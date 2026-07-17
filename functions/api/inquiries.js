/**
 * 창업·제휴 문의 API — Cloudflare Pages Functions + KV
 * 저장 위치: KV(MINGLE_KV)의 "inq:" 키. 확인 방법은 README_배포가이드.md 참고.
 */

const KINDS = ["startup", "partner"];
const RATE_MAX = 3;       // 10분당 최대 접수 수 (IP 기준)
const RATE_WINDOW = 600;  // 초

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export async function onRequestPost({ request, env }) {
  if (!env.MINGLE_KV) return json({ message: "KV 바인딩(MINGLE_KV)이 아직 연결되지 않았어요." }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ message: "요청 형식이 올바르지 않아요." }, 400); }

  const kind = String(body.kind || "");
  const ptype = String(body.ptype || "").slice(0, 40);
  const name = String(body.name || "").trim().slice(0, 60);
  const contact = String(body.contact || "").trim().slice(0, 120);
  const region = String(body.region || "").trim().slice(0, 80);
  const message = String(body.message || "").trim().slice(0, 2000);
  const agree = body.agree === true;
  const marketing = body.marketing === true;
  const honeypot = String(body.website || "");

  if (honeypot) return json({ message: "잠시 후 다시 시도해 주세요." }, 400);
  if (!KINDS.includes(kind)) return json({ message: "문의 유형이 올바르지 않아요." }, 400);
  if (name.length < 2) return json({ message: "성함(또는 소속)을 적어 주세요." }, 400);
  if (contact.length < 5) return json({ message: "연락받을 이메일이나 전화번호를 적어 주세요." }, 400);
  if (message.length < 10) return json({ message: "문의 내용을 조금만 더 자세히 적어 주세요." }, 400);
  if (!agree) return json({ message: "개인정보 수집·이용 동의가 필요해요." }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rlKey = "rl:inq:" + ip;
  const count = Number((await env.MINGLE_KV.get(rlKey)) || 0);
  if (count >= RATE_MAX) return json({ message: "접수가 너무 잦아요. 잠시 후 다시 시도해 주세요." }, 429);
  await env.MINGLE_KV.put(rlKey, String(count + 1), { expirationTtl: RATE_WINDOW });

  const ts = Date.now();
  const id = "inq:" + String(1e13 - ts) + ":" + Math.random().toString(36).slice(2, 8);
  await env.MINGLE_KV.put(id, JSON.stringify({ kind, ptype, name, contact, region, message, marketing, ts }));

  return json({ ok: true }, 201);
}

/* POST 외의 메서드는 405 (onRequestPost가 우선 매칭됩니다) */
export async function onRequest() {
  return json({ message: "허용되지 않은 요청이에요." }, 405);
}
