/**
 * 모임 API — /api/meetups
 * 저장소: D1(MINGLE_DB)
 *  GET  ?scope=open|mine        모임 목록
 *  POST {action:"create"|"apply"|"cancel"}
 */
import { json, bad, currentUser, safeText, hasContactInfo, riskyIntent, rateLimit } from "../../lib/util.js";

const CATS = ["study", "project", "cowork", "global", "hobby"];
const CAT_KO = { study: "스터디", project: "프로젝트", cowork: "코워킹", global: "글로벌 교류", hobby: "취미·친구" };

const needDb = (env) =>
  env.MINGLE_DB ? null : json({ message: "모임 기능이 아직 연결되지 않았어요. (D1 바인딩 MINGLE_DB 필요)" }, 503);

export async function onRequestGet({ request, env }) {
  const e = needDb(env); if (e) return e;
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") || "open";
  const me = await currentUser(request, env);

  if (scope === "mine") {
    if (!me) return json({ meetups: [], applications: [] });
    const hosted = await env.MINGLE_DB.prepare(
      "SELECT * FROM meetups WHERE host_id = ? ORDER BY created_at DESC LIMIT 30"
    ).bind(me.id).all();
    const applied = await env.MINGLE_DB.prepare(
      `SELECT a.state, a.created_at AS applied_at, m.*
         FROM applications a JOIN meetups m ON m.id = a.meetup_id
        WHERE a.user_id = ? AND a.state <> 'cancelled'
        ORDER BY a.created_at DESC LIMIT 30`
    ).bind(me.id).all();
    return json({ hosted: hosted.results || [], applied: applied.results || [] });
  }

  const rows = await env.MINGLE_DB.prepare(
    `SELECT m.*, (SELECT COUNT(*) FROM applications a
                   WHERE a.meetup_id = m.id AND a.state IN ('applied','approved','attended')) AS taken
       FROM meetups m
      WHERE m.status IN ('open','closed')
      ORDER BY (m.starts_at IS NULL), m.starts_at ASC, m.created_at DESC
      LIMIT 40`
  ).all();

  let myIds = [];
  if (me) {
    const mine = await env.MINGLE_DB.prepare(
      "SELECT meetup_id FROM applications WHERE user_id = ? AND state <> 'cancelled'"
    ).bind(me.id).all();
    myIds = (mine.results || []).map((r) => r.meetup_id);
  }

  const meetups = (rows.results || []).map((m) => ({
    id: m.id, title: m.title, category: m.category, categoryKo: CAT_KO[m.category] || m.category,
    goal: m.goal, place: m.place, startsAt: m.starts_at, duration: m.duration,
    capacity: m.capacity, taken: m.taken, lang: m.lang, fee: m.fee, detail: m.detail,
    hostNick: m.host_nick, status: m.status, applied: myIds.includes(m.id),
    mine: !!(me && m.host_id === me.id),
  }));
  return json({ meetups, signedIn: !!me });
}

export async function onRequestPost({ request, env }) {
  const e = needDb(env); if (e) return e;
  const me = await currentUser(request, env);
  if (!me) return bad("모임은 로그인한 회원만 이용할 수 있어요.", 401);

  const b = await request.json().catch(() => ({}));
  const action = String(b.action || "");

  /* ---------- 모임 열기 ---------- */
  if (action === "create") {
    if (!(await rateLimit(env, "meetup:" + me.id, 3, 3600)))
      return bad("모임을 너무 자주 만들고 있어요. 한 시간 뒤에 다시 해 주세요.", 429);

    const title = safeText(b.title, 40);
    const category = String(b.category || "");
    const goal = safeText(b.goal, 80);
    const detail = safeText(b.detail, 800);
    const capacity = Math.min(Math.max(Number(b.capacity) || 8, 2), 30);
    const duration = Math.min(Math.max(Number(b.duration) || 90, 30), 300);
    const startsAt = b.startsAt ? Number(b.startsAt) : null;

    if (title.length < 4) return bad("모임 이름을 조금만 더 적어 주세요.");
    if (!CATS.includes(category)) return bad("어떤 모임인지 골라 주세요.");
    if (goal.length < 4) return bad("한 줄 목표를 적어 주세요. 예: 4주 동안 토익 단어 끝내기");
    if (hasContactInfo(title + goal + detail))
      return bad("연락처는 모임 글에 적을 수 없어요. 신청한 분에게는 밍글 안에서 안내됩니다.");
    if (riskyIntent(title + goal + detail))
      return bad("영업·투자·데이트 목적의 모임은 열 수 없어요.");
    if (startsAt && startsAt < Date.now() - 3600 * 1000)
      return bad("지난 시각으로는 모임을 열 수 없어요.");

    const id = crypto.randomUUID();
    // 첫 모임은 운영자 확인 후 공개됩니다. 신뢰회원·호스트는 바로 공개됩니다.
    const status = me.level >= 4 || me.role === "host" || me.role === "admin" ? "open" : "pending";

    await env.MINGLE_DB.prepare(
      `INSERT INTO meetups (id,title,category,goal,place,starts_at,duration,capacity,lang,fee,detail,
                            host_id,host_nick,status,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`
    ).bind(id, title, category, goal, safeText(b.place, 60) || "밍글 건대화양점",
           startsAt, duration, capacity, safeText(b.lang, 5) || "ko", detail,
           me.id, me.nickname, status, Date.now()).run();

    return json({ ok: true, id, status }, 201);
  }

  /* ---------- 신청 ---------- */
  if (action === "apply") {
    const meetupId = safeText(b.id, 40);
    const m = await env.MINGLE_DB.prepare("SELECT * FROM meetups WHERE id = ?").bind(meetupId).first();
    if (!m) return bad("모임을 찾을 수 없어요.", 404);
    if (m.status !== "open") return bad("지금은 신청을 받지 않는 모임이에요.");
    if (m.host_id === me.id) return bad("내가 연 모임에는 따로 신청하지 않아도 돼요.");

    const cnt = await env.MINGLE_DB.prepare(
      "SELECT COUNT(*) AS c FROM applications WHERE meetup_id = ? AND state IN ('applied','approved','attended')"
    ).bind(meetupId).first();
    if (cnt.c >= m.capacity) return bad("자리가 다 찼어요. 다음 모임을 기다려 주세요.");

    const note = safeText(b.note, 200);
    if (hasContactInfo(note)) return bad("연락처는 적지 않으셔도 돼요.");

    await env.MINGLE_DB.prepare(
      `INSERT INTO applications (id,meetup_id,user_id,nickname,note,state,created_at)
       VALUES (?,?,?,?,?, 'applied', ?)
       ON CONFLICT(meetup_id,user_id) DO UPDATE SET state='applied', note=excluded.note, created_at=excluded.created_at`
    ).bind(crypto.randomUUID(), meetupId, me.id, me.nickname, note, Date.now()).run();

    return json({ ok: true }, 201);
  }

  /* ---------- 신청 취소 ---------- */
  if (action === "cancel") {
    const meetupId = safeText(b.id, 40);
    await env.MINGLE_DB.prepare(
      "UPDATE applications SET state = 'cancelled' WHERE meetup_id = ? AND user_id = ?"
    ).bind(meetupId, me.id).run();
    return json({ ok: true });
  }

  /* ---------- 내가 연 모임 닫기 ---------- */
  if (action === "close") {
    const meetupId = safeText(b.id, 40);
    await env.MINGLE_DB.prepare(
      "UPDATE meetups SET status = 'closed' WHERE id = ? AND host_id = ?"
    ).bind(meetupId, me.id).run();
    return json({ ok: true });
  }

  return bad("무엇을 하려는 요청인지 알 수 없어요.");
}
