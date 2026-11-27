/**
 * 방문 통계 수집 — POST /api/t   (site/js/track.js 가 보냅니다)
 *
 *  { t:"pv",  id, vid, sid, n, e, p, ti, r, pr, nf, l, us, um, uc }   페이지 조회 시작
 *  { t:"end", id, d, s }                                               체류 시간(ms)·스크롤(%) 갱신
 *  { t:"ev",  id, vid, sid, p, k, g, lb, h }                           클릭·질문 펼침·사이트 안 검색
 *
 * 항상 204로 답합니다. 통계가 실패해도 손님 화면에는 아무 영향이 없어야 하니까요.
 * 관리자 본인(관리자 쿠키), 검색 로봇, 다른 사이트에서 보낸 요청은 기록하지 않습니다.
 */
import { readCookie } from "../../lib/util.js";
import { isAdmin } from "../../lib/cms.js";
import {
  ensureAnalytics, kstParts, cleanPath, classifyReferrer, isAiHost, deviceOf, isBot, idOk, txt,
} from "../../lib/analytics.js";

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/* 같은 서버 인스턴스 안에서의 간단한 과속 방지 (분당 IP별 150건) */
const hits = new Map();
function tooMany(ip) {
  const minute = Math.floor(Date.now() / 60000);
  const k = ip + ":" + minute;
  const n = (hits.get(k) || 0) + 1;
  hits.set(k, n);
  if (hits.size > 5000) for (const key of hits.keys()) if (!key.endsWith(":" + minute)) hits.delete(key);
  return n > 150;
}

function sameOrigin(request) {
  const host = new URL(request.url).host;
  const site = request.headers.get("Sec-Fetch-Site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("Origin") || request.headers.get("Referer");
  if (!origin) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    if (!env.MINGLE_DB) return done();
    if (!sameOrigin(request)) return done();
    const ua = request.headers.get("User-Agent") || "";
    if (isBot(ua)) return done();
    if (tooMany(request.headers.get("CF-Connecting-IP") || "?")) return done();
    if (await isAdmin(request, env)) return done();

    const raw = await request.text();
    if (!raw || raw.length > 4000) return done();
    let m;
    try { m = JSON.parse(raw); } catch { return done(); }
    if (!m || typeof m !== "object" || !idOk(m.id)) return done();

    await ensureAnalytics(env);
    const db = env.MINGLE_DB;
    const now = Date.now();
    const { day, hour, dow } = kstParts(now);

    /* ---------- 페이지 조회 ---------- */
    if (m.t === "pv") {
      if (!idOk(m.vid) || !idOk(m.sid)) return done();
      const url = new URL(request.url);
      const path = cleanPath(m.p);
      if (path.startsWith("/admin") || path.startsWith("/api/") || path.startsWith("/_tpl")) return done();

      const entry = m.e ? 1 : 0;
      let ref = { host: null, source: null, keyword: null };
      let utm = { s: null, m: null, c: null };
      if (entry) {
        ref = classifyReferrer(txt(m.r, 600), url.hostname);
        utm = { s: txt(m.us, 60), m: txt(m.um, 60), c: txt(m.uc, 80) };
        if (ref.source === "internal") ref.source = "direct";
        if (isAiHost(utm.s) && (ref.source === "direct" || ref.source === "other")) ref.source = "ai";
        else if (ref.source === "direct" && (path === "/go" || path.startsWith("/go/"))) ref.source = "qr";
        else if (ref.source === "direct" && utm.s) ref.source = "campaign";
      }

      await db.prepare(
        `INSERT OR IGNORE INTO an_views
          (id, ts, day, hour, dow, vid, sid, entry, is_new, member, path, title, nf, prev,
           ref_host, source, keyword, utm_source, utm_medium, utm_campaign, device, lang, country)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        m.id, now, day, hour, dow, m.vid, m.sid, entry, m.n ? 1 : 0,
        readCookie(request) ? 1 : 0,
        path, txt(m.ti, 120), m.nf ? 1 : 0, m.pr ? cleanPath(m.pr) : null,
        ref.host, ref.source, ref.keyword, utm.s, utm.m, utm.c,
        deviceOf(ua), txt(m.l, 12), (request.cf && request.cf.country) || null
      ).run();

      /* 1년이 넘은 기록은 가끔 한 번씩 정리합니다 */
      if (Math.random() < 0.002) {
        const cut = now - 400 * 86400000;
        context.waitUntil(db.batch([
          db.prepare("DELETE FROM an_views WHERE ts < ?").bind(cut),
          db.prepare("DELETE FROM an_events WHERE ts < ?").bind(cut),
        ]).catch(() => {}));
      }
      return done();
    }

    /* ---------- 체류 시간 · 스크롤 ---------- */
    if (m.t === "end") {
      const d = Math.max(0, Math.min(Number(m.d) || 0, 30 * 60 * 1000));
      const s = Math.max(0, Math.min(Math.round(Number(m.s) || 0), 100));
      await db.prepare("UPDATE an_views SET dur = MAX(dur, ?), scroll = MAX(scroll, ?) WHERE id = ?")
        .bind(d, s, m.id).run();
      return done();
    }

    /* ---------- 클릭 · 질문 펼침 ---------- */
    if (m.t === "ev") {
      if (!idOk(m.vid)) return done();
      const kind = ["click", "faq", "search"].includes(m.k) ? m.k : null;
      if (!kind) return done();
      await db.prepare(
        `INSERT INTO an_events (ts, day, vid, sid, view_id, path, kind, target, label, href)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        now, day, m.vid, idOk(m.sid) ? m.sid : null, m.id, cleanPath(m.p), kind,
        txt(m.g, 20), txt(m.lb, 80), txt(m.h, 200)
      ).run();
      return done();
    }
  } catch {}
  return done();
}

