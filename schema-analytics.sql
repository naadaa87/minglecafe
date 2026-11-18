-- ============================================================
-- MINGLE 방문 통계 테이블 (D1: MINGLE_DB)
-- 이 테이블들은 사이트가 처음 방문 기록을 받을 때 자동으로 만들어집니다.
-- 직접 실행할 필요는 없고, 구조 확인용으로 남겨 둡니다.
-- 원본: lib/analytics.js 의 AN_SCHEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS an_views (
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
  );

CREATE INDEX IF NOT EXISTS idx_anv_day ON an_views(day);

CREATE INDEX IF NOT EXISTS idx_anv_day_path ON an_views(day, path);

CREATE INDEX IF NOT EXISTS idx_anv_sid ON an_views(sid);

CREATE TABLE IF NOT EXISTS an_events (
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
  );

CREATE INDEX IF NOT EXISTS idx_ane_day_kind ON an_events(day, kind);
