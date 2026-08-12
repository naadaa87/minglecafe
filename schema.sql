-- ============================================================
-- MINGLE D1 스키마 (binding: MINGLE_DB / database: mingle-db)
-- 적용:  npx wrangler d1 execute mingle-db --remote --file=schema.sql
-- 여러 번 실행해도 안전합니다 (IF NOT EXISTS).
-- ============================================================

-- 회원 -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE,
  pw_hash       TEXT,
  pw_salt       TEXT,
  nickname      TEXT NOT NULL,
  lang          TEXT DEFAULT 'ko',
  interests     TEXT DEFAULT '[]',
  level         INTEGER DEFAULT 1,      -- 1 회원 / 2 매장인증 / 4 신뢰회원 / 5 호스트
  role          TEXT DEFAULT 'member',  -- member | host | admin
  provider      TEXT,                   -- email | kakao | google
  provider_uid  TEXT,
  marketing     INTEGER DEFAULT 0,
  created_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_uid);
CREATE INDEX IF NOT EXISTS idx_users_nick ON users(nickname);

-- 세션 -------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 비밀번호 재설정 코드 ---------------------------------------
CREATE TABLE IF NOT EXISTS reset_codes (
  email      TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  tries      INTEGER DEFAULT 0
);

-- 모임 -------------------------------------------------------
CREATE TABLE IF NOT EXISTS meetups (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL,   -- study | project | cowork | global | hobby
  goal        TEXT,            -- 한 줄 목표
  place       TEXT DEFAULT '밍글 건대화양점',
  starts_at   INTEGER,         -- 시작 시각(ms). 미정이면 NULL
  duration    INTEGER,         -- 분
  capacity    INTEGER DEFAULT 8,
  lang        TEXT DEFAULT 'ko',
  fee         INTEGER DEFAULT 0,
  detail      TEXT,
  host_id     TEXT NOT NULL,
  host_nick   TEXT NOT NULL,
  status      TEXT DEFAULT 'pending', -- pending | open | closed | done | blocked
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meetups_status ON meetups(status, starts_at);

-- 모임 신청 ---------------------------------------------------
CREATE TABLE IF NOT EXISTS applications (
  id         TEXT PRIMARY KEY,
  meetup_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  nickname   TEXT NOT NULL,
  note       TEXT,
  state      TEXT DEFAULT 'applied', -- applied | approved | cancelled | attended | noshow
  created_at INTEGER NOT NULL,
  UNIQUE (meetup_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_app_meetup ON applications(meetup_id);
CREATE INDEX IF NOT EXISTS idx_app_user ON applications(user_id);

-- 매장 체크인 (스탬프) ---------------------------------------
CREATE TABLE IF NOT EXISTS checkins (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  day        TEXT NOT NULL,   -- YYYY-MM-DD (KST)
  source     TEXT,            -- entrance | kiosk | table | event
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_checkin_user ON checkins(user_id);

-- 스탬프 사용 기록 -------------------------------------------
CREATE TABLE IF NOT EXISTS rewards (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,   -- stamp10
  used_at    INTEGER,
  created_at INTEGER NOT NULL
);

-- 신고 -------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,  -- post | comment | meetup | user
  target_id   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  detail      TEXT,
  reporter_id TEXT,
  state       TEXT DEFAULT 'open', -- open | done
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_state ON reports(state, created_at);
