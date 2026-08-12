/**
 * 매장 상태 · 품절 안내 API — /api/status  (누구나 읽기)
 * 저장소: KV(MINGLE_KV) 키 "store:status"
 * 값은 사람이 /admin 에서 직접 바꿉니다. 자동 측정이 아닙니다.
 */
import { json } from "../../lib/util.js";

const DEFAULT = {
  level: "unknown",     // free | normal | busy | unknown
  note: "",
  devices: [],          // 점검 중인 기기 이름
  soldout: [],          // 품절 메뉴 id
  updatedAt: null,
};

export async function onRequestGet({ env }) {
  if (!env.MINGLE_KV) return json({ ...DEFAULT, kv: false });
  const raw = await env.MINGLE_KV.get("store:status");
  let v = DEFAULT;
  try { if (raw) v = { ...DEFAULT, ...JSON.parse(raw) }; } catch {}
  return json({ ...v, kv: true });
}
