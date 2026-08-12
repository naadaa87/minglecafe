/* ============================================================
   MINGLE 서버 공통 유틸
   functions/ 밖에 두었기 때문에 URL로 노출되지 않습니다.
   ============================================================ */

export const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });

export const bad = (message, status = 400) => json({ message }, status);

/* ---------- 비밀번호: PBKDF2-SHA256 100,000회 ---------- */
const ITER = 100000;
const enc = new TextEncoder();

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    key,
    256
  );
  return { hash: b64(bits), salt: b64(salt) };
}

export async function verifyPassword(password, hash, salt) {
  const r = await hashPassword(password, salt);
  // 길이가 같을 때만 비교 — 타이밍 차이를 줄입니다.
  if (r.hash.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= r.hash.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return b64(buf);
}

/* ---------- 세션 ---------- */
const COOKIE = "mg_session";
const SESSION_DAYS = 30;

export function readCookie(request, name = COOKIE) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function sessionCookie(token, maxAgeSec = SESSION_DAYS * 86400) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export const clearSessionCookie = () =>
  `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function createSession(env, userId) {
  const token = crypto.randomUUID() + "." + crypto.randomUUID();
  const th = await sha256(token);
  const expires = Date.now() + SESSION_DAYS * 86400 * 1000;
  await env.MINGLE_DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  )
    .bind(th, userId, expires, Date.now())
    .run();
  return token;
}

/** 로그인한 회원을 반환합니다. 없으면 null. */
export async function currentUser(request, env) {
  if (!env.MINGLE_DB) return null;
  const token = readCookie(request);
  if (!token) return null;
  const th = await sha256(token);
  const row = await env.MINGLE_DB.prepare(
    `SELECT u.id, u.email, u.nickname, u.lang, u.interests, u.level, u.role, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND u.deleted_at IS NULL`
  )
    .bind(th)
    .first();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await env.MINGLE_DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(th).run();
    return null;
  }
  return row;
}

export async function destroySession(request, env) {
  const token = readCookie(request);
  if (!token || !env.MINGLE_DB) return;
  await env.MINGLE_DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(await sha256(token))
    .run();
}

/* ---------- 입력 검증 ---------- */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function checkNickname(n) {
  const v = String(n || "").trim();
  if (v.length < 2 || v.length > 12) return "닉네임은 2~12자로 적어 주세요.";
  if (/[<>&"'\\/]/.test(v)) return "닉네임에는 특수기호를 넣을 수 없어요.";
  return null;
}

export function checkPassword(p) {
  const v = String(p || "");
  if (v.length < 8) return "비밀번호는 8자 이상으로 정해 주세요.";
  if (v.length > 72) return "비밀번호가 너무 깁니다.";
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return "영문과 숫자를 섞어 주세요.";
  return null;
}

/** 개인 연락처가 본문에 들어갔는지 확인합니다. (안전 정책) */
export function hasContactInfo(text) {
  const phone = /01[016789][ .\-]?\d{3,4}[ .\-]?\d{4}/;
  const kakao = /(카톡|카카오톡?|kakao(talk)?)\s*(아이디|id)?\s*[:：]?\s*[A-Za-z0-9_.\-]{3,}/i;
  const insta = /(인스타|insta(gram)?)\s*[:：@]?\s*[A-Za-z0-9_.]{3,}/i;
  const line = /(라인|line)\s*(아이디|id)\s*[:：]?\s*[A-Za-z0-9_.\-]{3,}/i;
  return phone.test(text) || kakao.test(text) || insta.test(text) || line.test(text);
}

/** 커뮤니티 금지 목적 1차 감지 — 최종 판단은 사람이 합니다. */
export function riskyIntent(text) {
  const t = String(text || "");
  const patterns = [
    /(다단계|네트워크\s*마케팅|부업\s*권유|투자\s*수익\s*보장|원금\s*보장)/,
    /(대출|현금화|작업대출|통장\s*대여|계좌\s*대여)/,
    /(소개팅|애인\s*구|썸\s*탈|데이트\s*하실)/,
  ];
  return patterns.some((re) => re.test(t));
}

/* ---------- 속도 제한 (KV) ---------- */
export async function rateLimit(env, key, max, windowSec) {
  if (!env.MINGLE_KV) return true;
  const k = "rl:" + key;
  const count = Number((await env.MINGLE_KV.get(k)) || 0);
  if (count >= max) return false;
  await env.MINGLE_KV.put(k, String(count + 1), { expirationTtl: windowSec });
  return true;
}

export const clientIp = (request) => request.headers.get("CF-Connecting-IP") || "unknown";

/* ---------- 기타 ---------- */
export const now = () => Date.now();

export function todayKey(tzOffsetHours = 9) {
  const d = new Date(Date.now() + tzOffsetHours * 3600 * 1000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (KST 기준)
}

export function safeText(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

/** 회원 정보를 화면에 보낼 형태로 다듬습니다. 이메일은 가립니다. */
export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    nickname: u.nickname,
    lang: u.lang || "ko",
    interests: u.interests ? JSON.parse(u.interests) : [],
    level: u.level ?? 1,
    role: u.role || "member",
    emailMasked: u.email ? u.email.replace(/^(.{2}).*(@.*)$/, "$1••••$2") : null,
    joinedAt: u.created_at,
  };
}
