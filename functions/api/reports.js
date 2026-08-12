/**
 * 신고 접수 API — /api/reports
 * 저장소: D1(MINGLE_DB). D1이 없으면 KV에 임시 보관합니다.
 */
import { json, bad, currentUser, rateLimit, clientIp, safeText } from "../../lib/util.js";

const REASONS = ["영업·홍보", "욕설·괴롭힘", "성적·데이트 목적", "사기·금전 요구", "개인정보 노출", "기타"];
const TYPES = ["post", "comment", "meetup", "user"];

export async function onRequestPost({ request, env }) {
  const b = await request.json().catch(() => null);
  if (!b) return bad("요청 형식이 올바르지 않아요.");

  const targetType = String(b.targetType || "");
  const targetId = safeText(b.targetId, 120);
  const reason = String(b.reason || "");
  const detail = safeText(b.detail, 600);

  if (!TYPES.includes(targetType)) return bad("무엇을 신고하는지 알 수 없어요.");
  if (!targetId) return bad("신고 대상을 찾을 수 없어요.");
  if (!REASONS.includes(reason)) return bad("신고 사유를 골라 주세요.");
  if (!(await rateLimit(env, "rep:" + clientIp(request), 10, 3600)))
    return bad("신고가 너무 잦아요. 잠시 후 다시 시도해 주세요.", 429);

  const me = await currentUser(request, env);
  const ts = Date.now();

  if (env.MINGLE_DB) {
    await env.MINGLE_DB.prepare(
      "INSERT INTO reports (id,target_type,target_id,reason,detail,reporter_id,state,created_at) VALUES (?,?,?,?,?,?, 'open', ?)"
    ).bind(crypto.randomUUID(), targetType, targetId, reason, detail, me?.id || null, ts).run();
  } else if (env.MINGLE_KV) {
    await env.MINGLE_KV.put(
      "rep:" + String(1e13 - ts) + ":" + Math.random().toString(36).slice(2, 8),
      JSON.stringify({ targetType, targetId, reason, detail, ts, state: "open" })
    );
  } else {
    return json({ message: "신고 접수가 아직 연결되지 않았어요." }, 503);
  }

  return json({ ok: true }, 201);
}
