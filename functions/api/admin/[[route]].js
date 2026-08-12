/**
 * 관리자 API — /api/admin/*
 * 로그인: ADMIN_PIN 환경변수(Secret)와 대조. 통과하면 쿠키가 12시간 유지됩니다.
 * 휴대폰에서 쓰는 것을 기준으로 만들었습니다.
 */
import { json, bad, sha256, readCookie, rateLimit, clientIp, safeText, todayKey }
  from "../../../lib/util.js";

const COOKIE = "mg_admin";
const HOURS = 12;

async function isAdmin(request, env) {
  if (!env.ADMIN_PIN) return false;
  const token = readCookie(request, COOKIE);
  if (!token) return false;
  const [ts, sig] = token.split(".");
  if (!ts || !sig) return false;
  if (Date.now() > Number(ts)) return false;
  return sig === (await sha256(ts + "|" + env.ADMIN_PIN));
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const route = (Array.isArray(params.route) ? params.route : [params.route || ""]).join("/");
  const method = request.method;

  try {
    /* ---------- PIN 로그인 ---------- */
    if (route === "login" && method === "POST") {
      if (!env.ADMIN_PIN)
        return json({ message: "관리자 PIN이 아직 등록되지 않았어요. Cloudflare에서 ADMIN_PIN을 Secret으로 넣어 주세요." }, 503);
      if (!(await rateLimit(env, "adm:" + clientIp(request), 8, 900)))
        return bad("시도가 너무 잦아요. 15분 뒤에 다시 해 주세요.", 429);

      const b = await request.json().catch(() => ({}));
      if (String(b.pin || "") !== env.ADMIN_PIN) return bad("PIN이 맞지 않아요.", 401);

      const exp = String(Date.now() + HOURS * 3600 * 1000);
      const token = exp + "." + (await sha256(exp + "|" + env.ADMIN_PIN));
      return json({ ok: true }, 200, {
        "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${HOURS * 3600}`,
      });
    }

    if (route === "logout" && method === "POST")
      return json({ ok: true }, 200, {
        "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      });

    if (route === "session" && method === "GET")
      return json({ ok: await isAdmin(request, env), pinSet: !!env.ADMIN_PIN });

    /* ---------- 여기부터는 관리자만 ---------- */
    if (!(await isAdmin(request, env))) return bad("관리자 로그인이 필요해요.", 401);

    /* 오늘 할 일 + 숫자 */
    if (route === "overview" && method === "GET") {
      const out = { inquiries: 0, reports: 0, pendingMeetups: 0, members: 0, checkinsToday: 0, posts: 0 };

      if (env.MINGLE_KV) {
        const inq = await env.MINGLE_KV.list({ prefix: "inq:", limit: 200 });
        for (const k of inq.keys) {
          const raw = await env.MINGLE_KV.get(k.name);
          if (raw && !JSON.parse(raw).done) out.inquiries++;
        }
        const posts = await env.MINGLE_KV.list({ prefix: "post:", limit: 500 });
        out.posts = posts.keys.length;
      }
      if (env.MINGLE_DB) {
        const q = async (sql, ...b) => (await env.MINGLE_DB.prepare(sql).bind(...b).first())?.c ?? 0;
        out.reports = await q("SELECT COUNT(*) AS c FROM reports WHERE state = 'open'");
        out.pendingMeetups = await q("SELECT COUNT(*) AS c FROM meetups WHERE status = 'pending'");
        out.members = await q("SELECT COUNT(*) AS c FROM users WHERE deleted_at IS NULL");
        out.checkinsToday = await q("SELECT COUNT(*) AS c FROM checkins WHERE day = ?", todayKey());
      }
      return json({ ...out, db: !!env.MINGLE_DB, kv: !!env.MINGLE_KV });
    }

    /* 매장 상태 · 품절 저장 */
    if (route === "status" && method === "POST") {
      if (!env.MINGLE_KV) return json({ message: "KV가 연결되지 않았어요." }, 503);
      const b = await request.json().catch(() => ({}));
      const value = {
        level: ["free", "normal", "busy", "unknown"].includes(b.level) ? b.level : "unknown",
        note: safeText(b.note, 80),
        devices: Array.isArray(b.devices) ? b.devices.slice(0, 8).map((s) => safeText(s, 30)) : [],
        soldout: Array.isArray(b.soldout) ? b.soldout.slice(0, 60).map((s) => safeText(s, 40)) : [],
        updatedAt: Date.now(),
      };
      await env.MINGLE_KV.put("store:status", JSON.stringify(value));
      return json({ ok: true, ...value });
    }

    /* 문의 목록 / 처리 */
    if (route === "inquiries" && method === "GET") {
      if (!env.MINGLE_KV) return json({ items: [] });
      const list = await env.MINGLE_KV.list({ prefix: "inq:", limit: 60 });
      const items = [];
      for (const k of list.keys) {
        const raw = await env.MINGLE_KV.get(k.name);
        if (!raw) continue;
        try { items.push({ id: k.name, ...JSON.parse(raw) }); } catch {}
      }
      return json({ items });
    }
    if (route === "inquiries/done" && method === "POST") {
      const b = await request.json().catch(() => ({}));
      const id = safeText(b.id, 120);
      const raw = await env.MINGLE_KV.get(id);
      if (raw) {
        const v = JSON.parse(raw); v.done = true; v.doneAt = Date.now();
        await env.MINGLE_KV.put(id, JSON.stringify(v));
      }
      return json({ ok: true });
    }

    /* 신고 목록 / 처리 */
    if (route === "reports" && method === "GET") {
      if (!env.MINGLE_DB) return json({ items: [] });
      const r = await env.MINGLE_DB.prepare(
        "SELECT * FROM reports WHERE state = 'open' ORDER BY created_at DESC LIMIT 50"
      ).all();
      return json({ items: r.results || [] });
    }
    if (route === "reports/done" && method === "POST") {
      const b = await request.json().catch(() => ({}));
      await env.MINGLE_DB.prepare("UPDATE reports SET state = 'done' WHERE id = ?")
        .bind(safeText(b.id, 60)).run();
      return json({ ok: true });
    }

    /* 글 숨기기 */
    if (route === "posts/hide" && method === "POST") {
      const b = await request.json().catch(() => ({}));
      const id = safeText(b.id, 120);
      if (!id.startsWith("post:")) return bad("대상을 찾을 수 없어요.");
      const raw = await env.MINGLE_KV.get(id);
      if (raw) {
        const p = JSON.parse(raw); p.hidden = true;
        await env.MINGLE_KV.put(id, JSON.stringify(p));
      }
      return json({ ok: true });
    }

    /* 모임 검수 */
    if (route === "meetups" && method === "GET") {
      if (!env.MINGLE_DB) return json({ items: [] });
      const r = await env.MINGLE_DB.prepare(
        "SELECT * FROM meetups WHERE status IN ('pending','open') ORDER BY created_at DESC LIMIT 40"
      ).all();
      return json({ items: r.results || [] });
    }
    if (route === "meetups/set" && method === "POST") {
      const b = await request.json().catch(() => ({}));
      const state = ["open", "closed", "blocked", "done"].includes(b.state) ? b.state : null;
      if (!state) return bad("상태 값이 올바르지 않아요.");
      await env.MINGLE_DB.prepare("UPDATE meetups SET status = ? WHERE id = ?")
        .bind(state, safeText(b.id, 60)).run();
      return json({ ok: true });
    }

    return json({ message: "없는 주소예요." }, 404);
  } catch (e) {
    return json({ message: "처리 중 문제가 생겼어요." }, 500);
  }
}
