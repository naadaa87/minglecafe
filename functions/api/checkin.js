/**
 * 매장 체크인 · 스탬프 API — /api/checkin
 * 저장소: D1(MINGLE_DB) — 하루 한 번만 적립됩니다.
 *  GET   내 스탬프 현황
 *  POST  {source:"entrance"|"kiosk"|"table"} 체크인
 */
import { json, bad, currentUser, todayKey, safeText } from "../../lib/util.js";

const GOAL = 10;
const SOURCES = ["entrance", "kiosk", "table", "event"];

const needDb = (env) =>
  env.MINGLE_DB ? null : json({ message: "체크인 기능이 아직 연결되지 않았어요. (D1 바인딩 MINGLE_DB 필요)" }, 503);

async function summary(env, userId) {
  const total = await env.MINGLE_DB.prepare(
    "SELECT COUNT(*) AS c FROM checkins WHERE user_id = ?"
  ).bind(userId).first();
  const used = await env.MINGLE_DB.prepare(
    "SELECT COUNT(*) AS c FROM rewards WHERE user_id = ? AND kind = 'stamp10'"
  ).bind(userId).first();
  const today = await env.MINGLE_DB.prepare(
    "SELECT id FROM checkins WHERE user_id = ? AND day = ?"
  ).bind(userId, todayKey()).first();
  const stamps = total.c - used.c * GOAL;
  return {
    total: total.c,
    stamps: Math.max(0, stamps % GOAL === 0 && stamps > 0 ? GOAL : stamps % GOAL),
    goal: GOAL,
    rewardsReady: Math.floor(stamps / GOAL),
    checkedInToday: !!today,
  };
}

export async function onRequestGet({ request, env }) {
  const e = needDb(env); if (e) return e;
  const me = await currentUser(request, env);
  if (!me) return json({ signedIn: false });
  return json({ signedIn: true, nickname: me.nickname, level: me.level, ...(await summary(env, me.id)) });
}

export async function onRequestPost({ request, env }) {
  const e = needDb(env); if (e) return e;
  const me = await currentUser(request, env);
  if (!me) return bad("체크인은 로그인한 회원만 할 수 있어요.", 401);

  const b = await request.json().catch(() => ({}));

  /* 도장 10개를 쓰신 경우 — 판을 비웁니다. */
  if (String(b.action) === "redeem") {
    const s = await summary(env, me.id);
    if (s.rewardsReady < 1) return bad("아직 도장 10개가 안 모였어요.");
    await env.MINGLE_DB.prepare(
      "INSERT INTO rewards (id,user_id,kind,used_at,created_at) VALUES (?,?, 'stamp10', ?, ?)"
    ).bind(crypto.randomUUID(), me.id, Date.now(), Date.now()).run();
    return json({ ok: true, redeemed: true, ...(await summary(env, me.id)) });
  }

  const source = SOURCES.includes(String(b.source)) ? String(b.source) : "entrance";
  const day = todayKey();

  const dup = await env.MINGLE_DB.prepare(
    "SELECT id FROM checkins WHERE user_id = ? AND day = ?"
  ).bind(me.id, day).first();
  if (dup) return json({ ok: true, already: true, ...(await summary(env, me.id)) });

  await env.MINGLE_DB.prepare(
    "INSERT INTO checkins (id,user_id,day,source,created_at) VALUES (?,?,?,?,?)"
  ).bind(crypto.randomUUID(), me.id, day, source, Date.now()).run();

  // 첫 체크인이면 '매장 인증' 배지를 올려 줍니다.
  if (me.level < 2)
    await env.MINGLE_DB.prepare("UPDATE users SET level = 2 WHERE id = ? AND level < 2").bind(me.id).run();

  return json({ ok: true, ...(await summary(env, me.id)) }, 201);
}
