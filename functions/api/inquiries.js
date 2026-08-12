/**
 * 창업 · 제휴 문의 API — /api/inquiries
 * 저장소: KV(MINGLE_KV) "inq:" 키. 관리자 화면에서 확인합니다.
 */
import { json, bad, rateLimit, clientIp, safeText } from "../../lib/util.js";

const KINDS = ["startup", "partner", "space"];

export async function onRequestPost({ request, env }) {
  if (!env.MINGLE_KV) return json({ message: "문의 접수가 아직 연결되지 않았어요." }, 503);

  const b = await request.json().catch(() => null);
  if (!b) return bad("요청 형식이 올바르지 않아요.");
  if (b.website) return bad("잠시 후 다시 시도해 주세요.");

  const kind = String(b.kind || "");
  const name = safeText(b.name, 60);
  const contact = safeText(b.contact, 120);
  const region = safeText(b.region, 80);
  const message = safeText(b.message, 2000);

  if (!KINDS.includes(kind)) return bad("문의 유형이 올바르지 않아요.");
  if (name.length < 2) return bad("성함(또는 소속)을 적어 주세요.");
  if (contact.length < 5) return bad("연락받을 이메일이나 전화번호를 적어 주세요.");
  if (message.length < 10) return bad("문의 내용을 조금만 더 자세히 적어 주세요.");
  if (b.agree !== true) return bad("개인정보 수집·이용 동의가 필요해요.");

  if (!(await rateLimit(env, "inq:" + clientIp(request), 3, 600)))
    return bad("접수가 너무 잦아요. 잠시 후 다시 시도해 주세요.", 429);

  const ts = Date.now();
  const id = "inq:" + String(1e13 - ts) + ":" + Math.random().toString(36).slice(2, 8);
  await env.MINGLE_KV.put(id, JSON.stringify({
    kind, ptype: safeText(b.ptype, 40), name, contact, region, message,
    marketing: b.marketing === true, ts, state: "open",
  }));

  return json({ ok: true }, 201);
}

export async function onRequest() {
  return json({ message: "허용되지 않은 요청이에요." }, 405);
}
