/**
 * KPI 집계 API — /api/kpi/*   (관리자 전용, 로그인은 기존 PIN 쿠키)
 *
 *  GET today                         오늘 방문자·페이지뷰·최근 30분 (오늘 할 일 화면용)
 *  GET overview?from&to              핵심 지표 + 이전 같은 기간 비교 + 추이
 *  GET pages?from&to                 페이지별 조회·체류·스크롤·이탈, 인기 가이드·소식·질문, 404, QR
 *  GET traffic?from&to               유입 경로·검색어·외부 사이트·캠페인·첫 페이지·기기·언어·시간대
 *  GET clicks?from&to                클릭 종류·많이 누른 항목·전환 흐름(퍼널)
 *  GET members?from&to&q&sort&page   회원 지표·가입 추이·회원 목록
 *  GET community?from&to             모임·참여·밍글보드·신고·매장 체크인
 *  GET members.csv / pages.csv       내려받기
 *
 * 날짜(from, to)는 한국 시간 기준 YYYY-MM-DD. 비우면 최근 7일입니다.
 */
import { json, bad } from "../../../lib/util.js";
import { isAdmin } from "../../../lib/cms.js";
import { ensureAnalytics, kstParts, addDays, dayStartMs, daysBetween, SEARCH_SOURCES } from "../../../lib/analytics.js";


/* ---------- 기간 ---------- */
function period(url) {
  const today = kstParts().day;
  const ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
  let to = url.searchParams.get("to");
  let from = url.searchParams.get("from");
  if (!ok(to) || to > today) to = today;
  if (!ok(from)) from = addDays(to, -6);
  if (from > to) [from, to] = [to, from];
  let n = daysBetween(from, to);
  if (n > 400) { from = addDays(to, -399); n = 400; }
  const pto = addDays(from, -1);
  const pfrom = addDays(pto, -(n - 1));
  const ms = (f, t) => [dayStartMs(f), dayStartMs(addDays(t, 1)) - 1];
  const [s, e] = ms(from, to);
  const [ps, pe] = ms(pfrom, pto);
  return { from, to, n, pfrom, pto, s, e, ps, pe, today };
}

function dayList(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/* ---------- DB 도우미: 테이블이 없거나 실패하면 null ---------- */
function dbx(db) {
  return {
    all: async (sql, ...b) => { try { return (await db.prepare(sql).bind(...b).all()).results || []; } catch { return null; } },
    first: async (sql, ...b) => { try { return await db.prepare(sql).bind(...b).first(); } catch { return null; } },
  };
}
const num = (v) => (v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

/* ---------- KV 도우미 ---------- */
async function kvKeys(env, prefix, max = 3000) {
  if (!env.MINGLE_KV) return [];
  const out = [];
  let cursor;
  do {
    const r = await env.MINGLE_KV.list({ prefix, limit: 1000, cursor });
    out.push(...r.keys.map((k) => k.name));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor && out.length < max);
  return out;
}
/** "post:<1e13-ts>:..." / "inq:<1e13-ts>:..." 에서 시각 꺼내기 */
const revTs = (key) => 1e13 - Number(String(key).split(":")[1] || 0);
/** "cmt:post:<rev>:<rand>:<ts>:<rand>" 에서 시각 꺼내기 */
const cmtTs = (key) => Number(String(key).split(":")[4] || 0);

async function inquiriesIn(env, s1, e1, s2, e2) {
  const keys = (await kvKeys(env, "inq:", 2000)).filter((k) => {
    const t = revTs(k);
    return (t >= s1 && t <= e1) || (t >= s2 && t <= e2);
  }).slice(0, 400);
  const items = [];
  for (const k of keys) {
    try {
      const v = JSON.parse((await env.MINGLE_KV.get(k)) || "null");
      if (v) items.push({ ts: v.ts || revTs(k), kind: v.kind });
    } catch {}
  }
  return items;
}

const inRange = (t, s, e) => t >= s && t <= e;

/* ============================================================
   지표 계산
   ============================================================ */
async function trafficTotals(q, from, to) {
  const t = await q.first(
    `SELECT COUNT(*) views, COUNT(DISTINCT vid) visitors, COUNT(DISTINCT sid) sessions,
            COUNT(DISTINCT CASE WHEN is_new = 1 THEN vid END) newv,
            COALESCE(SUM(dur), 0) dur_sum,
            AVG(CASE WHEN dur > 0 THEN dur END) dur_view,
            COUNT(DISTINCT CASE WHEN entry = 1 AND source IN (${SEARCH_SOURCES.map(() => "?").join(",")}) THEN sid END) search_s,
            SUM(CASE WHEN path = '/go' OR path LIKE '/go/%' THEN 1 ELSE 0 END) qr,
            COUNT(DISTINCT CASE WHEN member = 1 THEN vid END) member_v,
            COUNT(DISTINCT CASE WHEN lang IS NOT NULL AND lang <> '' AND lang NOT LIKE 'ko%' THEN vid END) foreign_v
       FROM an_views WHERE day BETWEEN ? AND ?`,
    ...SEARCH_SOURCES, from, to
  );
  const b = await q.first(
    `SELECT COUNT(*) c FROM (SELECT sid, COUNT(*) n, MAX(dur) d FROM an_views
       WHERE day BETWEEN ? AND ? GROUP BY sid) WHERE n = 1 AND d < 10000`,
    from, to
  );
  const clicks = (await q.all(
    `SELECT target, COUNT(*) c, COUNT(DISTINCT vid) u FROM an_events
      WHERE kind = 'click' AND day BETWEEN ? AND ? GROUP BY target`,
    from, to
  )) || [];
  const ck = Object.fromEntries(clicks.map((r) => [r.target, { c: num(r.c), u: num(r.u) }]));
  const sessions = num(t && t.sessions);
  return {
    views: num(t && t.views),
    visitors: num(t && t.visitors),
    sessions,
    newVisitors: num(t && t.newv),
    durSession: sessions ? num(t.dur_sum) / sessions : 0,
    durView: num(t && t.dur_view),
    pagesPerSession: sessions ? num(t.views) / sessions : 0,
    bounce: sessions ? num(b && b.c) / sessions : 0,
    searchShare: sessions ? num(t.search_s) / sessions : 0,
    qr: num(t && t.qr),
    memberVisitors: num(t && t.member_v),
    foreignVisitors: num(t && t.foreign_v),
    kakao: (ck.kakao || {}).c || 0,
    map: (ck.map || {}).c || 0,
    tel: (ck.tel || {}).c || 0,
    clicks: ck,
  };
}

async function bizTotals(q, from, to, s, e) {
  const one = async (sql, ...b) => { const r = await q.first(sql, ...b); return r ? num(r.c) : null; };
  return {
    signups: await one("SELECT COUNT(*) c FROM users WHERE created_at BETWEEN ? AND ?", s, e),
    meetups: await one("SELECT COUNT(*) c FROM meetups WHERE created_at BETWEEN ? AND ?", s, e),
    applications: await one("SELECT COUNT(*) c FROM applications WHERE created_at BETWEEN ? AND ? AND state <> 'cancelled'", s, e),
    checkins: await one("SELECT COUNT(*) c FROM checkins WHERE day BETWEEN ? AND ?", from, to),
  };
}

async function series(q, p, prev) {
  const from = prev ? p.pfrom : p.from;
  const to = prev ? p.pto : p.to;
  if (p.n === 1) {
    const rows = (await q.all(
      `SELECT hour k, COUNT(*) v, COUNT(DISTINCT vid) u, AVG(CASE WHEN dur > 0 THEN dur END) d
         FROM an_views WHERE day = ? GROUP BY hour`, from)) || [];
    const m = Object.fromEntries(rows.map((r) => [r.k, r]));
    const keys = Array.from({ length: 24 }, (_, i) => i);
    return { unit: "hour", labels: keys.map((h) => h + "시"), v: keys.map((h) => num(m[h] && m[h].v)), u: keys.map((h) => num(m[h] && m[h].u)), d: keys.map((h) => num(m[h] && m[h].d)) };
  }
  const rows = (await q.all(
    `SELECT day k, COUNT(*) v, COUNT(DISTINCT vid) u, AVG(CASE WHEN dur > 0 THEN dur END) d
       FROM an_views WHERE day BETWEEN ? AND ? GROUP BY day`, from, to)) || [];
  const m = Object.fromEntries(rows.map((r) => [r.k, r]));
  const keys = dayList(from, to);
  return { unit: "day", labels: keys, v: keys.map((k) => num(m[k] && m[k].v)), u: keys.map((k) => num(m[k] && m[k].u)), d: keys.map((k) => num(m[k] && m[k].d)) };
}

/* ---------- 페이지 묶음 ---------- */
function sectionOf(path) {
  if (path === "/") return "home";
  if (path === "/en/" || path.startsWith("/en/")) return "en";
  if (path.startsWith("/guide")) return "guide";
  if (path.startsWith("/news")) return "news";
  if (path === "/go" || path.startsWith("/go/")) return "qr";
  if (path.startsWith("/account")) return "account";
  if (path.startsWith("/legal")) return "legal";
  const map = { "/menu": "menu", "/store": "store", "/community": "community", "/global": "global", "/pass": "pass", "/brand": "brand", "/startup": "business", "/partner": "business", "/faq": "faq" };
  return map[path] || "etc";
}

/* ============================================================
   라우터
   ============================================================ */
export async function onRequestGet(context) {
  const { request, env, params } = context;
  const route = (Array.isArray(params.route) ? params.route : [params.route || ""]).join("/");
  if (!(await isAdmin(request, env))) return bad("관리자 로그인이 필요해요.", 401);
  if (!env.MINGLE_DB) return json({ noDb: true, message: "D1(MINGLE_DB)이 연결되지 않아 통계를 모을 수 없어요." }, 200);

  try { await ensureAnalytics(env); } catch { return json({ noDb: true, message: "통계 테이블을 만들지 못했어요. D1 연결을 확인해 주세요." }, 200); }

  const url = new URL(request.url);
  const p = period(url);
  const q = dbx(env.MINGLE_DB);
  const since = await q.first("SELECT MIN(day) d FROM an_views");
  const base = { period: { from: p.from, to: p.to, n: p.n, pfrom: p.pfrom, pto: p.pto, today: p.today }, since: since && since.d };

  try {
    /* ---------------- 오늘 ---------------- */
    if (route === "today") {
      const t = await q.first("SELECT COUNT(*) v, COUNT(DISTINCT vid) u FROM an_views WHERE day = ?", p.today);
      const rt = await q.first("SELECT COUNT(DISTINCT vid) u FROM an_views WHERE day >= ? AND ts > ?", addDays(p.today, -1), Date.now() - 30 * 60000);
      const c = await q.first("SELECT COUNT(*) c FROM an_events WHERE day = ? AND kind = 'click' AND target IN ('kakao','map','tel')", p.today);
      return json({ ...base, views: num(t && t.v), visitors: num(t && t.u), realtime: num(rt && rt.u), contactClicks: num(c && c.c) });
    }

    /* ---------------- 한눈에 ---------------- */
    if (route === "overview") {
      const [cur, prev] = await Promise.all([trafficTotals(q, p.from, p.to), trafficTotals(q, p.pfrom, p.pto)]);
      const [bc, bp] = await Promise.all([bizTotals(q, p.from, p.to, p.s, p.e), bizTotals(q, p.pfrom, p.pto, p.ps, p.pe)]);
      const inq = await inquiriesIn(env, p.s, p.e, p.ps, p.pe);
      const inqCount = (s, e) => inq.filter((i) => inRange(i.ts, s, e)).length;
      const posts = (await kvKeys(env, "post:", 3000)).map(revTs);
      const postCount = (s, e) => posts.filter((t) => inRange(t, s, e)).length;

      const [sc, sp] = await Promise.all([series(q, p, false), series(q, p, true)]);
      const top = (await q.all(
        `SELECT path, MAX(title) title, COUNT(*) views, COUNT(DISTINCT vid) visitors
           FROM an_views WHERE day BETWEEN ? AND ? AND nf = 0 GROUP BY path ORDER BY views DESC LIMIT 6`, p.from, p.to)) || [];
      const sources = (await q.all(
        `SELECT COALESCE(source, 'direct') source, COUNT(*) sessions FROM an_views
          WHERE entry = 1 AND day BETWEEN ? AND ? GROUP BY source ORDER BY sessions DESC`, p.from, p.to)) || [];
      const rt = await q.first("SELECT COUNT(DISTINCT vid) u FROM an_views WHERE day >= ? AND ts > ?", addDays(p.today, -1), Date.now() - 30 * 60000);

      return json({
        ...base,
        realtime: num(rt && rt.u),
        cur: { ...cur, ...bc, inquiries: inqCount(p.s, p.e), posts: postCount(p.s, p.e) },
        prev: { ...prev, ...bp, inquiries: inqCount(p.ps, p.pe), posts: postCount(p.ps, p.pe) },
        series: { cur: sc, prev: sp },
        topPages: top,
        sources,
      });
    }

    /* ---------------- 페이지 · 인기 정보 ---------------- */
    if (route === "pages" || route === "pages.csv") {
      const rows = (await q.all(
        `SELECT path, MAX(title) title, COUNT(*) views, COUNT(DISTINCT vid) visitors,
                AVG(CASE WHEN dur > 0 THEN dur END) dur,
                AVG(CASE WHEN scroll > 0 THEN scroll END) scroll,
                SUM(CASE WHEN scroll >= 90 THEN 1 ELSE 0 END) full_read,
                SUM(CASE WHEN scroll > 0 THEN 1 ELSE 0 END) scrolled,
                SUM(entry) entries
           FROM an_views WHERE day BETWEEN ? AND ? AND nf = 0
          GROUP BY path ORDER BY views DESC LIMIT 300`, p.from, p.to)) || [];
      const exits = (await q.all(
        `SELECT v.path, COUNT(*) c FROM an_views v
           JOIN (SELECT sid, MAX(ts) mts FROM an_views WHERE day BETWEEN ? AND ? GROUP BY sid) l
             ON l.sid = v.sid AND l.mts = v.ts
          WHERE v.day BETWEEN ? AND ? GROUP BY v.path`, p.from, p.to, p.from, p.to)) || [];
      const ex = Object.fromEntries(exits.map((r) => [r.path, num(r.c)]));
      const pages = rows.map((r) => ({
        path: r.path, title: r.title || "", section: sectionOf(r.path),
        views: num(r.views), visitors: num(r.visitors), dur: num(r.dur),
        scroll: num(r.scroll), fullRead: num(r.scrolled) ? num(r.full_read) / num(r.scrolled) : null,
        entries: num(r.entries), exits: ex[r.path] || 0,
        exitRate: num(r.views) ? (ex[r.path] || 0) / num(r.views) : 0,
      }));

      if (route === "pages.csv") {
        const head = ["주소", "제목", "조회수", "방문자", "평균 체류(초)", "평균 스크롤(%)", "끝까지 읽은 비율(%)", "첫 페이지로 들어온 수", "이탈 수", "이탈률(%)"];
        const lines = [head, ...pages.map((r) => [r.path, r.title, r.views, r.visitors, Math.round(r.dur / 1000), Math.round(r.scroll), r.fullRead == null ? "" : Math.round(r.fullRead * 100), r.entries, r.exits, Math.round(r.exitRate * 100)])];
        return csv(lines, `mingle-pages-${p.from}_${p.to}.csv`);
      }

      const sections = {};
      for (const r of pages) {
        const s = (sections[r.section] = sections[r.section] || { section: r.section, views: 0 });
        s.views += r.views;
      }
      const faq = (await q.all(
        `SELECT label, COUNT(*) c, COUNT(DISTINCT vid) u, MAX(path) path FROM an_events
          WHERE kind = 'faq' AND day BETWEEN ? AND ? AND label IS NOT NULL
          GROUP BY label ORDER BY c DESC LIMIT 20`, p.from, p.to)) || [];
      const searches = (await q.all(
        `SELECT label, COUNT(*) c, COUNT(DISTINCT vid) u, SUM(CASE WHEN target = 'none' THEN 1 ELSE 0 END) none FROM an_events
          WHERE kind = 'search' AND day BETWEEN ? AND ? AND label IS NOT NULL
          GROUP BY label ORDER BY c DESC LIMIT 30`, p.from, p.to)) || [];
      const nf = (await q.all(
        `SELECT path, COUNT(*) c, MAX(prev) prev, MAX(ref_host) ref FROM an_views
          WHERE nf = 1 AND day BETWEEN ? AND ? GROUP BY path ORDER BY c DESC LIMIT 30`, p.from, p.to)) || [];
      const qr = pages.filter((r) => r.section === "qr");

      return json({
        ...base,
        pages,
        sections: Object.values(sections).sort((a, b) => b.views - a.views),
        guides: pages.filter((r) => r.section === "guide" && r.path !== "/guide/").slice(0, 10),
        news: pages.filter((r) => r.section === "news" && r.path !== "/news/").slice(0, 10),
        faq: faq.map((r) => ({ label: r.label, count: num(r.c), visitors: num(r.u), path: r.path })),
        searches: searches.map((r) => ({ label: r.label, count: num(r.c), visitors: num(r.u), none: num(r.none) })),
        notFound: nf.map((r) => ({ path: r.path, count: num(r.c), prev: r.prev, ref: r.ref })),
        qr,
      });
    }

    /* ---------------- 유입 경로 ---------------- */
    if (route === "traffic") {
      const W = "day BETWEEN ? AND ?";
      const [sources, refs, keywords, utm, landing, devices, langs, countries, heat, totals, aiLanding] = await Promise.all([
        q.all(`SELECT COALESCE(source,'direct') source, COUNT(*) sessions, COUNT(DISTINCT vid) visitors FROM an_views WHERE entry = 1 AND ${W} GROUP BY source ORDER BY sessions DESC`, p.from, p.to),
        q.all(`SELECT ref_host host, COALESCE(source,'other') source, COUNT(*) c FROM an_views WHERE entry = 1 AND ref_host IS NOT NULL AND ${W} GROUP BY ref_host ORDER BY c DESC LIMIT 25`, p.from, p.to),
        q.all(`SELECT keyword, source, COUNT(*) c FROM an_views WHERE entry = 1 AND keyword IS NOT NULL AND ${W} GROUP BY keyword, source ORDER BY c DESC LIMIT 50`, p.from, p.to),
        q.all(`SELECT utm_source s, utm_medium m, utm_campaign c, COUNT(*) n, COUNT(DISTINCT vid) u FROM an_views WHERE entry = 1 AND utm_source IS NOT NULL AND ${W} GROUP BY utm_source, utm_medium, utm_campaign ORDER BY n DESC LIMIT 30`, p.from, p.to),
        q.all(`SELECT path, MAX(title) title, COUNT(*) c FROM an_views WHERE entry = 1 AND nf = 0 AND ${W} GROUP BY path ORDER BY c DESC LIMIT 20`, p.from, p.to),
        q.all(`SELECT COALESCE(device,'desktop') device, COUNT(DISTINCT vid) u, COUNT(*) v FROM an_views WHERE ${W} GROUP BY device ORDER BY u DESC`, p.from, p.to),
        q.all(`SELECT LOWER(SUBSTR(COALESCE(lang,''),1,2)) lang, COUNT(DISTINCT vid) u FROM an_views WHERE ${W} GROUP BY 1 ORDER BY u DESC LIMIT 12`, p.from, p.to),
        q.all(`SELECT COALESCE(country,'') country, COUNT(DISTINCT vid) u FROM an_views WHERE ${W} GROUP BY country ORDER BY u DESC LIMIT 12`, p.from, p.to),
        q.all(`SELECT dow, hour, COUNT(*) c FROM an_views WHERE ${W} GROUP BY dow, hour`, p.from, p.to),
        q.first(`SELECT COUNT(DISTINCT vid) u, COUNT(DISTINCT CASE WHEN is_new = 1 THEN vid END) n, COUNT(DISTINCT CASE WHEN member = 1 THEN vid END) m FROM an_views WHERE ${W}`, p.from, p.to),
        q.all(`SELECT path, MAX(title) title, MAX(COALESCE(ref_host, utm_source)) host, COUNT(*) c FROM an_views WHERE entry = 1 AND source = 'ai' AND ${W} GROUP BY path ORDER BY c DESC LIMIT 15`, p.from, p.to),
      ]);
      return json({
        ...base,
        sources: sources || [], refs: refs || [], keywords: keywords || [], utm: utm || [],
        landing: landing || [], devices: devices || [], langs: langs || [], countries: countries || [],
        heat: heat || [],
        aiLanding: aiLanding || [],
        visitors: num(totals && totals.u), newVisitors: num(totals && totals.n), memberVisitors: num(totals && totals.m),
      });
    }

    /* ---------------- 클릭 · 전환 ---------------- */
    if (route === "clicks") {
      const W = "day BETWEEN ? AND ?";
      const [cur, prev, items, f, cv] = await Promise.all([
        q.all(`SELECT target, COUNT(*) c, COUNT(DISTINCT vid) u FROM an_events WHERE kind = 'click' AND ${W} GROUP BY target`, p.from, p.to),
        q.all(`SELECT target, COUNT(*) c, COUNT(DISTINCT vid) u FROM an_events WHERE kind = 'click' AND ${W} GROUP BY target`, p.pfrom, p.pto),
        q.all(`SELECT target, label, href, COUNT(*) c, COUNT(DISTINCT vid) u, COUNT(DISTINCT path) pages, MAX(path) path
                 FROM an_events WHERE kind = 'click' AND ${W}
                GROUP BY target, label, href ORDER BY c DESC LIMIT 60`, p.from, p.to),
        q.first(`SELECT COUNT(DISTINCT vid) all_v,
                        COUNT(DISTINCT CASE WHEN path IN ('/store','/menu','/en/visit') THEN vid END) store_v,
                        COUNT(DISTINCT CASE WHEN path = '/startup' THEN vid END) startup_v,
                        COUNT(DISTINCT CASE WHEN path IN ('/partner','/en/business') THEN vid END) partner_v,
                        COUNT(DISTINCT CASE WHEN path IN ('/community','/global','/en/community') THEN vid END) community_v,
                        COUNT(DISTINCT CASE WHEN path LIKE '/account/signup%' THEN vid END) signup_v
                   FROM an_views WHERE ${W}`, p.from, p.to),
        q.first(`SELECT COUNT(DISTINCT CASE WHEN target IN ('map','kakao') THEN vid END) contact_v FROM an_events WHERE kind = 'click' AND ${W}`, p.from, p.to),
      ]);
      const biz = await bizTotals(q, p.from, p.to, p.s, p.e);
      const inq = (await inquiriesIn(env, p.s, p.e, 0, -1));
      const kinds = { startup: 0, partner: 0, space: 0 };
      for (const i of inq) if (kinds[i.kind] != null) kinds[i.kind]++;
      const allV = num(f && f.all_v);

      return json({
        ...base,
        visitors: allV,
        byTarget: cur || [], byTargetPrev: prev || [],
        items: items || [],
        funnels: [
          { id: "store", title: "매장 방문으로 이어지는 흐름", steps: [
            ["홈페이지 방문자", allV], ["매장·메뉴 페이지를 본 방문자", num(f && f.store_v)],
            ["길찾기·카카오 문의를 누른 방문자", num(cv && cv.contact_v)], ["매장 QR 체크인 (회원)", biz.checkins],
          ] },
          { id: "startup", title: "창업 상담 흐름", steps: [
            ["홈페이지 방문자", allV], ["창업 안내 페이지 방문자", num(f && f.startup_v)], ["창업 상담 신청", kinds.startup],
          ] },
          { id: "partner", title: "제휴·공간 제안 흐름", steps: [
            ["홈페이지 방문자", allV], ["제휴 페이지 방문자", num(f && f.partner_v)], ["제휴·공간 제안 접수", kinds.partner + kinds.space],
          ] },
          { id: "community", title: "커뮤니티 참여 흐름", steps: [
            ["홈페이지 방문자", allV], ["커뮤니티·글로벌 페이지 방문자", num(f && f.community_v)],
            ["회원가입 페이지 방문자", num(f && f.signup_v)], ["신규 가입", biz.signups], ["모임 참여 신청", biz.applications],
          ] },
        ],
      });
    }

    /* ---------------- 회원 ---------------- */
    if (route === "members" || route === "members.csv") {
      const sorts = {
        recent: "u.created_at DESC",
        login: "last_login IS NULL, last_login DESC",
        checkins: "checkins DESC, u.created_at DESC",
        joined: "joined DESC, u.created_at DESC",
        name: "u.nickname COLLATE NOCASE ASC",
      };
      const sort = sorts[url.searchParams.get("sort")] ? url.searchParams.get("sort") : "recent";
      const kw = String(url.searchParams.get("q") || "").trim().slice(0, 40);
      const page = Math.max(1, Math.min(500, Number(url.searchParams.get("page")) || 1));
      const where = ["u.deleted_at IS NULL"];
      const binds = [];
      if (kw) { where.push("(u.nickname LIKE ? OR u.email LIKE ?)"); binds.push(`%${kw}%`, `%${kw}%`); }
      const listSql = `SELECT u.id, u.nickname, u.email, u.provider, u.level, u.role, u.marketing, u.lang, u.interests, u.created_at,
            (SELECT COUNT(*) FROM checkins c WHERE c.user_id = u.id) checkins,
            (SELECT MAX(day) FROM checkins c WHERE c.user_id = u.id) last_checkin,
            (SELECT COUNT(*) FROM meetups m WHERE m.host_id = u.id) hosted,
            (SELECT COUNT(*) FROM applications a WHERE a.user_id = u.id AND a.state <> 'cancelled') joined,
            (SELECT MAX(created_at) FROM sessions s WHERE s.user_id = u.id) last_login
          FROM users u WHERE ${where.join(" AND ")} ORDER BY ${sorts[sort]}`;

      if (route === "members.csv") {
        const rows = (await q.all(listSql + " LIMIT 5000", ...binds)) || [];
        const prov = { email: "이메일", kakao: "카카오", google: "구글" };
        const d = (t) => (t ? new Date(Number(t) + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") : "");
        const lines = [["닉네임", "이메일", "가입 방법", "등급", "가입일", "최근 로그인", "체크인 수", "최근 체크인", "개설 모임", "참여 신청", "소식 수신 동의"],
          ...rows.map((r) => [r.nickname, r.email || "", prov[r.provider] || r.provider || "", r.role === "host" ? "호스트" : `Lv.${r.level || 1}`, d(r.created_at), d(r.last_login), num(r.checkins), r.last_checkin || "", num(r.hosted), num(r.joined), r.marketing ? "동의" : ""])];
        return csv(lines, `mingle-members-${p.today}.csv`);
      }

      const one = async (sql, ...b) => { const r = await q.first(sql, ...b); return r ? num(r.c) : null; };
      const [total, newCur, newPrev, marketing, withdrawn, providers, providersCur, signupRows, activeCur, activePrev, count, list] = await Promise.all([
        one("SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL"),
        one("SELECT COUNT(*) c FROM users WHERE created_at BETWEEN ? AND ?", p.s, p.e),
        one("SELECT COUNT(*) c FROM users WHERE created_at BETWEEN ? AND ?", p.ps, p.pe),
        one("SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL AND marketing = 1"),
        one("SELECT COUNT(*) c FROM users WHERE deleted_at BETWEEN ? AND ?", p.s, p.e),
        q.all("SELECT COALESCE(provider,'email') provider, COUNT(*) c FROM users WHERE deleted_at IS NULL GROUP BY 1 ORDER BY c DESC"),
        q.all("SELECT COALESCE(provider,'email') provider, COUNT(*) c FROM users WHERE created_at BETWEEN ? AND ? GROUP BY 1 ORDER BY c DESC", p.s, p.e),
        q.all("SELECT strftime('%Y-%m-%d', (created_at / 1000) + 32400, 'unixepoch') d, COUNT(*) c FROM users WHERE created_at BETWEEN ? AND ? GROUP BY d", p.s, p.e),
        one(`SELECT COUNT(*) c FROM (SELECT user_id FROM checkins WHERE day BETWEEN ? AND ?
               UNION SELECT user_id FROM applications WHERE created_at BETWEEN ? AND ?
               UNION SELECT user_id FROM sessions WHERE created_at BETWEEN ? AND ?)`, p.from, p.to, p.s, p.e, p.s, p.e),
        one(`SELECT COUNT(*) c FROM (SELECT user_id FROM checkins WHERE day BETWEEN ? AND ?
               UNION SELECT user_id FROM applications WHERE created_at BETWEEN ? AND ?
               UNION SELECT user_id FROM sessions WHERE created_at BETWEEN ? AND ?)`, p.pfrom, p.pto, p.ps, p.pe, p.ps, p.pe),
        one(`SELECT COUNT(*) c FROM users u WHERE ${where.join(" AND ")}`, ...binds),
        q.all(listSql + " LIMIT 50 OFFSET ?", ...binds, (page - 1) * 50),
      ]);
      if (total == null) return json({ ...base, noUsers: true, message: "회원 테이블(users)을 읽지 못했어요. D1에 schema.sql이 적용됐는지 확인해 주세요." });

      const sm = Object.fromEntries((signupRows || []).map((r) => [r.d, num(r.c)]));
      const days = p.n === 1 ? [p.from] : dayList(p.from, p.to);
      return json({
        ...base,
        total, newCur, newPrev, marketing, withdrawn, activeCur, activePrev,
        providers: providers || [], providersCur: providersCur || [],
        signups: { labels: days, values: days.map((d) => sm[d] || 0) },
        list: (list || []).map((r) => ({
          id: r.id, nickname: r.nickname, email: r.email, provider: r.provider || "email",
          level: num(r.level) || 1, role: r.role || "member", marketing: !!r.marketing, lang: r.lang,
          interests: (() => { try { return JSON.parse(r.interests || "[]"); } catch { return []; } })(),
          createdAt: num(r.created_at), lastLogin: num(r.last_login) || null,
          checkins: num(r.checkins), lastCheckin: r.last_checkin || null, hosted: num(r.hosted), joined: num(r.joined),
        })),
        count: count || 0, page, pageSize: 50, sort, q: kw,
      });
    }

    /* ---------------- 모임 · 커뮤니티 ---------------- */
    if (route === "community") {
      const meetups = (await q.all(
        `SELECT m.id, m.title, m.category, m.host_nick, m.starts_at, m.capacity, m.status, m.created_at, m.lang,
                (SELECT COUNT(*) FROM applications a WHERE a.meetup_id = m.id AND a.state IN ('applied','approved','attended')) taken,
                (SELECT COUNT(*) FROM applications a WHERE a.meetup_id = m.id AND a.state = 'attended') attended,
                (SELECT COUNT(*) FROM applications a WHERE a.meetup_id = m.id AND a.state = 'cancelled') cancelled
           FROM meetups m WHERE m.created_at BETWEEN ? AND ? ORDER BY m.created_at DESC LIMIT 200`, p.s, p.e));
      const one = async (sql, ...b) => { const r = await q.first(sql, ...b); return r ? num(r.c) : null; };
      const [apps, appsPrev, appsCancelled, participants, openNow, reports, checkinDays, checkinSrc, checkinUsers, rewards, checkinsPrev] = await Promise.all([
        one("SELECT COUNT(*) c FROM applications WHERE created_at BETWEEN ? AND ? AND state <> 'cancelled'", p.s, p.e),
        one("SELECT COUNT(*) c FROM applications WHERE created_at BETWEEN ? AND ? AND state <> 'cancelled'", p.ps, p.pe),
        one("SELECT COUNT(*) c FROM applications WHERE created_at BETWEEN ? AND ? AND state = 'cancelled'", p.s, p.e),
        one("SELECT COUNT(DISTINCT user_id) c FROM applications WHERE created_at BETWEEN ? AND ? AND state <> 'cancelled'", p.s, p.e),
        one("SELECT COUNT(*) c FROM meetups WHERE status = 'open'"),
        q.all("SELECT state, COUNT(*) c FROM reports WHERE created_at BETWEEN ? AND ? GROUP BY state", p.s, p.e),
        q.all("SELECT day d, COUNT(*) c FROM checkins WHERE day BETWEEN ? AND ? GROUP BY day", p.from, p.to),
        q.all("SELECT COALESCE(source,'etc') source, COUNT(*) c FROM checkins WHERE day BETWEEN ? AND ? GROUP BY 1 ORDER BY c DESC", p.from, p.to),
        one("SELECT COUNT(DISTINCT user_id) c FROM checkins WHERE day BETWEEN ? AND ?", p.from, p.to),
        one("SELECT COUNT(*) c FROM rewards WHERE used_at BETWEEN ? AND ?", p.s, p.e),
        one("SELECT COUNT(*) c FROM checkins WHERE day BETWEEN ? AND ?", p.pfrom, p.pto),
      ]);
      const meetupsPrev = await one("SELECT COUNT(*) c FROM meetups WHERE created_at BETWEEN ? AND ?", p.ps, p.pe);

      const posts = (await kvKeys(env, "post:", 3000)).map(revTs);
      const cmts = (await kvKeys(env, "cmt:", 5000)).map(cmtTs);
      const cm = Object.fromEntries((checkinDays || []).map((r) => [r.d, num(r.c)]));
      const days = dayList(p.from, p.to);

      const list = (meetups || []).map((m) => ({
        id: m.id, title: m.title, category: m.category, host: m.host_nick, startsAt: num(m.starts_at) || null,
        capacity: num(m.capacity), status: m.status, createdAt: num(m.created_at), lang: m.lang,
        taken: num(m.taken), attended: num(m.attended), cancelled: num(m.cancelled),
      }));
      const fillable = list.filter((m) => m.capacity > 0 && m.status !== "blocked");
      const fill = fillable.length ? fillable.reduce((s, m) => s + Math.min(1, m.taken / m.capacity), 0) / fillable.length : null;
      const byStatus = {}; const byCat = {};
      for (const m of list) {
        byStatus[m.status] = (byStatus[m.status] || 0) + 1;
        const c = (byCat[m.category] = byCat[m.category] || { category: m.category, meetups: 0, taken: 0 });
        c.meetups++; c.taken += m.taken;
      }

      return json({
        ...base,
        noMeetups: meetups == null,
        meetups: list,
        meetupCount: list.length, meetupsPrev, openNow,
        byStatus, byCategory: Object.values(byCat).sort((a, b) => b.meetups - a.meetups),
        applications: apps, applicationsPrev: appsPrev, cancelled: appsCancelled, participants, fillRate: fill,
        posts: posts.filter((t) => inRange(t, p.s, p.e)).length,
        postsPrev: posts.filter((t) => inRange(t, p.ps, p.pe)).length,
        comments: cmts.filter((t) => inRange(t, p.s, p.e)).length,
        reports: Object.fromEntries((reports || []).map((r) => [r.state, num(r.c)])),
        checkins: { labels: days, values: days.map((d) => cm[d] || 0), total: days.reduce((s, d) => s + (cm[d] || 0), 0), prev: checkinsPrev, users: checkinUsers, rewards, bySource: checkinSrc || [] },
      });
    }

    return json({ message: "없는 주소예요." }, 404);
  } catch (e) {
    return json({ message: "통계를 계산하다 문제가 생겼어요.", detail: String(e && e.message || e).slice(0, 200) }, 500);
  }
}

function csv(lines, filename) {
  const body = "﻿" + lines.map((r) => r.map((c) => `"${String(c == null ? "" : c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
