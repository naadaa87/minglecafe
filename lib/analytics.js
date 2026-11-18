/* ============================================================
   밍글 방문 통계 공통 모듈
   - 저장소: D1(MINGLE_DB)의 an_views(페이지 조회), an_events(클릭 등) 테이블
   - 테이블은 처음 쓰일 때 자동으로 만들어집니다. (터미널 작업 필요 없음)
     같은 내용을 schema-analytics.sql 에도 적어 두었습니다.
   - 개인을 알아볼 수 있는 정보(IP, 이메일, 전체 유입 주소)는 저장하지 않습니다.
   ============================================================ */

export const AN_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS an_views (
    id           TEXT PRIMARY KEY,
    ts           INTEGER NOT NULL,
    day          TEXT NOT NULL,
    hour         INTEGER NOT NULL,
    dow          INTEGER NOT NULL,
    vid          TEXT NOT NULL,
    sid          TEXT NOT NULL,
    entry        INTEGER DEFAULT 0,
    is_new       INTEGER DEFAULT 0,
    member       INTEGER DEFAULT 0,
    path         TEXT NOT NULL,
    title        TEXT,
    nf           INTEGER DEFAULT 0,
    prev         TEXT,
    ref_host     TEXT,
    source       TEXT,
    keyword      TEXT,
    utm_source   TEXT,
    utm_medium   TEXT,
    utm_campaign TEXT,
    device       TEXT,
    lang         TEXT,
    country      TEXT,
    dur          INTEGER DEFAULT 0,
    scroll       INTEGER DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_anv_day ON an_views(day)`,
  `CREATE INDEX IF NOT EXISTS idx_anv_day_path ON an_views(day, path)`,
  `CREATE INDEX IF NOT EXISTS idx_anv_sid ON an_views(sid)`,
  `CREATE TABLE IF NOT EXISTS an_events (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ts       INTEGER NOT NULL,
    day      TEXT NOT NULL,
    vid      TEXT NOT NULL,
    sid      TEXT,
    view_id  TEXT,
    path     TEXT,
    kind     TEXT NOT NULL,
    target   TEXT,
    label    TEXT,
    href     TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ane_day_kind ON an_events(day, kind)`,
];

let ready = false;

/** 통계 테이블이 있는지 확인하고 없으면 만듭니다. D1이 없으면 false. */
export async function ensureAnalytics(env) {
  if (!env.MINGLE_DB) return false;
  if (ready) return true;
  await env.MINGLE_DB.batch(AN_SCHEMA.map((s) => env.MINGLE_DB.prepare(s)));
  ready = true;
  return true;
}

/* ---------- 시간 (KST) ---------- */
export function kstParts(ts = Date.now()) {
  const d = new Date(ts + 9 * 3600 * 1000);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours(), dow: d.getUTCDay() };
}

/** 'YYYY-MM-DD'(KST) 하루의 시작 시각(ms) */
export function dayStartMs(day) {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - 9 * 3600 * 1000;
}

export function addDays(day, n) {
  const t = new Date(dayStartMs(day) + 9 * 3600 * 1000 + n * 86400000);
  return t.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((dayStartMs(to) - dayStartMs(from)) / 86400000) + 1;
}

/* ---------- 주소 정리 ---------- */
export function cleanPath(p) {
  let s = String(p || "/").split("?")[0].split("#")[0];
  try { s = decodeURIComponent(s); } catch {}
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
  if (s.length > 1 && s.endsWith("/") && !/^\/(en|guide|news)\/$/.test(s)) s = s.slice(0, -1);
  return (s || "/").slice(0, 200);
}

/* ---------- 유입 경로 분류 ---------- */
const SEARCH_KEY = [
  [/(^|\.)search\.naver\.com$/, "query"],
  [/(^|\.)search\.daum\.net$/, "q"],
  [/(^|\.)google\./, "q"],
  [/(^|\.)bing\.com$/, "q"],
  [/(^|\.)search\.zum\.com$/, "query"],
  [/(^|\.)search\.yahoo\./, "p"],
];

/**
 * @returns {{host:string|null, source:string, keyword:string|null}}
 */
export function classifyReferrer(ref, ownHost) {
  if (!ref) return { host: null, source: "direct", keyword: null };
  let u;
  try { u = new URL(ref); } catch { return { host: null, source: "direct", keyword: null }; }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (!host) return { host: null, source: "direct", keyword: null };
  if (ownHost && (host === ownHost.replace(/^www\./, "") || host.endsWith(".pages.dev"))) {
    return { host: null, source: "internal", keyword: null };
  }

  let keyword = null;
  for (const [re, key] of SEARCH_KEY) {
    if (re.test(host)) {
      const k = u.searchParams.get(key);
      if (k) keyword = k.trim().slice(0, 80);
      break;
    }
  }

  let source = "other";
  if (/(^|\.)search\.naver\.com$/.test(host)) source = "naver_search";
  else if (/^(m\.)?(map|place)\.naver\.com$/.test(host) || host === "naver.me" || /pcmap\.place\.naver\.com$/.test(host)) source = "naver_map";
  else if (/(^|\.)blog\.naver\.com$/.test(host)) source = "naver_blog";
  else if (/(^|\.)cafe\.naver\.com$/.test(host)) source = "naver_cafe";
  else if (/(^|\.)naver\.com$/.test(host)) source = "naver";
  else if (/(^|\.)google\./.test(host)) source = "google";
  else if (/(^|\.)map\.kakao\.com$/.test(host) || /(^|\.)place\.map\.kakao\.com$/.test(host)) source = "kakao_map";
  else if (/(^|\.)daum\.net$/.test(host)) source = "daum";
  else if (/(^|\.)kakao\.com$/.test(host)) source = "kakao";
  else if (/(^|\.)instagram\.com$/.test(host)) source = "instagram";
  else if (/(facebook\.com|threads\.net|twitter\.com|x\.com|youtube\.com|youtu\.be|tiktok\.com)$/.test(host)) source = "sns";
  else if (/(bing\.com|zum\.com|yahoo\.)/.test(host)) source = "search_other";

  return { host: host.slice(0, 80), source, keyword };
}

export const SEARCH_SOURCES = ["naver_search", "google", "daum", "search_other"];

/* ---------- 기기 ---------- */
export function deviceOf(ua) {
  const s = String(ua || "");
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Opera Mini|IEMobile/i.test(s)) return "mobile";
  return "desktop";
}

const BOT_RE = /bot|crawl|spider|slurp|yeti|daumoa|bingpreview|headless|lighthouse|pagespeed|facebookexternalhit|kakaotalk-scrap|preview|monitor|curl|wget|python|axios|node-fetch|go-http/i;
export const isBot = (ua) => !ua || BOT_RE.test(ua);

/* ---------- 입력 정리 ---------- */
export const idOk = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(v);
export const txt = (v, max) =>
  v == null ? null : String(v).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || null;
