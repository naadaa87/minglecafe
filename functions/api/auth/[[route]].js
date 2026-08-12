/**
 * 밍글 회원 API  —  /api/auth/*
 * 저장소: Cloudflare D1 (binding: MINGLE_DB)
 * 선택 환경변수: KAKAO_REST_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BREVO_API_KEY, MAIL_FROM
 */
import {
  json, bad, hashPassword, verifyPassword, sha256,
  createSession, currentUser, destroySession, sessionCookie, clearSessionCookie,
  EMAIL_RE, checkNickname, checkPassword, rateLimit, clientIp,
  safeText, publicUser,
} from "../../../lib/util.js";

const needDb = (env) =>
  env.MINGLE_DB ? null : json({ message: "회원 기능이 아직 연결되지 않았어요. (D1 바인딩 MINGLE_DB 필요)" }, 503);

const uid = () => crypto.randomUUID();

export async function onRequest(context) {
  const { request, env, params } = context;
  const route = (Array.isArray(params.route) ? params.route : [params.route || ""]).join("/");
  const method = request.method;

  try {
    /* ---------- 사용 가능한 로그인 수단 ---------- */
    if (route === "providers" && method === "GET") {
      return json({
        email: !!env.MINGLE_DB,
        kakao: !!env.KAKAO_REST_KEY,
        google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        reset: !!env.BREVO_API_KEY,
      });
    }

    /* ---------- 내 정보 ---------- */
    if (route === "me" && method === "GET") {
      const u = await currentUser(request, env);
      return json({ user: publicUser(u) });
    }

    const dbErr = needDb(env);
    if (dbErr) return dbErr;

    /* ---------- 가입 ---------- */
    if (route === "signup" && method === "POST") {
      const b = await request.json().catch(() => ({}));
      if (b.website) return bad("잠시 후 다시 시도해 주세요.");
      if (!(await rateLimit(env, "signup:" + clientIp(request), 5, 3600)))
        return bad("가입 시도가 너무 잦아요. 잠시 후 다시 시도해 주세요.", 429);

      const email = safeText(b.email, 160).toLowerCase();
      const nickname = safeText(b.nickname, 12);
      const password = String(b.password || "");
      if (!EMAIL_RE.test(email)) return bad("이메일 주소를 다시 확인해 주세요.");
      const nErr = checkNickname(nickname); if (nErr) return bad(nErr);
      const pErr = checkPassword(password); if (pErr) return bad(pErr);
      if (b.agree !== true) return bad("이용약관과 개인정보처리방침에 동의해 주세요.");

      const dup = await env.MINGLE_DB.prepare(
        "SELECT id FROM users WHERE email = ? AND deleted_at IS NULL"
      ).bind(email).first();
      if (dup) return bad("이미 가입된 이메일이에요. 로그인하거나 비밀번호를 새로 정해 주세요.", 409);

      const dupNick = await env.MINGLE_DB.prepare(
        "SELECT id FROM users WHERE nickname = ? AND deleted_at IS NULL"
      ).bind(nickname).first();
      if (dupNick) return bad("이미 쓰고 있는 닉네임이에요. 다른 이름으로 해 주세요.", 409);

      const { hash, salt } = await hashPassword(password);
      const id = uid();
      await env.MINGLE_DB.prepare(
        `INSERT INTO users (id,email,pw_hash,pw_salt,nickname,lang,interests,level,role,provider,marketing,created_at)
         VALUES (?,?,?,?,?,?,?,1,'member','email',?,?)`
      ).bind(id, email, hash, salt, nickname, safeText(b.lang, 5) || "ko",
             JSON.stringify(Array.isArray(b.interests) ? b.interests.slice(0, 8) : []),
             b.marketing === true ? 1 : 0, Date.now()).run();

      const token = await createSession(env, id);
      const u = await env.MINGLE_DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
      return json({ ok: true, user: publicUser(u) }, 201, { "Set-Cookie": sessionCookie(token) });
    }

    /* ---------- 로그인 ---------- */
    if (route === "login" && method === "POST") {
      const b = await request.json().catch(() => ({}));
      if (!(await rateLimit(env, "login:" + clientIp(request), 10, 600)))
        return bad("로그인 시도가 너무 잦아요. 10분 뒤에 다시 해 주세요.", 429);

      const email = safeText(b.email, 160).toLowerCase();
      const password = String(b.password || "");
      const u = await env.MINGLE_DB.prepare(
        "SELECT * FROM users WHERE email = ? AND deleted_at IS NULL"
      ).bind(email).first();

      // 이메일 존재 여부를 알려주지 않습니다.
      if (!u || !u.pw_hash || !(await verifyPassword(password, u.pw_hash, u.pw_salt)))
        return bad("이메일 또는 비밀번호가 맞지 않아요.", 401);

      const token = await createSession(env, u.id);
      return json({ ok: true, user: publicUser(u) }, 200, { "Set-Cookie": sessionCookie(token) });
    }

    /* ---------- 로그아웃 ---------- */
    if (route === "logout" && method === "POST") {
      await destroySession(request, env);
      return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
    }

    /* ---------- 프로필 수정 ---------- */
    if (route === "profile" && (method === "PATCH" || method === "POST")) {
      const me = await currentUser(request, env);
      if (!me) return bad("로그인이 필요해요.", 401);
      const b = await request.json().catch(() => ({}));

      if (b.nickname !== undefined) {
        const nickname = safeText(b.nickname, 12);
        const nErr = checkNickname(nickname); if (nErr) return bad(nErr);
        const dup = await env.MINGLE_DB.prepare(
          "SELECT id FROM users WHERE nickname = ? AND id <> ? AND deleted_at IS NULL"
        ).bind(nickname, me.id).first();
        if (dup) return bad("이미 쓰고 있는 닉네임이에요.", 409);
        await env.MINGLE_DB.prepare("UPDATE users SET nickname = ? WHERE id = ?").bind(nickname, me.id).run();
      }
      if (b.lang !== undefined)
        await env.MINGLE_DB.prepare("UPDATE users SET lang = ? WHERE id = ?")
          .bind(safeText(b.lang, 5) || "ko", me.id).run();
      if (Array.isArray(b.interests))
        await env.MINGLE_DB.prepare("UPDATE users SET interests = ? WHERE id = ?")
          .bind(JSON.stringify(b.interests.slice(0, 8).map((s) => safeText(s, 20))), me.id).run();

      const u = await env.MINGLE_DB.prepare("SELECT * FROM users WHERE id = ?").bind(me.id).first();
      return json({ ok: true, user: publicUser(u) });
    }

    /* ---------- 비밀번호 변경 ---------- */
    if (route === "password" && method === "POST") {
      const me = await currentUser(request, env);
      if (!me) return bad("로그인이 필요해요.", 401);
      const b = await request.json().catch(() => ({}));
      const row = await env.MINGLE_DB.prepare("SELECT * FROM users WHERE id = ?").bind(me.id).first();
      if (!row.pw_hash) return bad("소셜 로그인으로 가입한 계정이에요. 비밀번호가 따로 없습니다.");
      if (!(await verifyPassword(String(b.current || ""), row.pw_hash, row.pw_salt)))
        return bad("지금 쓰는 비밀번호가 맞지 않아요.", 401);
      const pErr = checkPassword(b.next); if (pErr) return bad(pErr);
      const { hash, salt } = await hashPassword(String(b.next));
      await env.MINGLE_DB.prepare("UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?")
        .bind(hash, salt, me.id).run();
      // 다른 기기의 세션은 모두 끊습니다.
      await env.MINGLE_DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(me.id).run();
      const token = await createSession(env, me.id);
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token) });
    }

    /* ---------- 비밀번호 재설정: 코드 보내기 ---------- */
    if (route === "reset/request" && method === "POST") {
      const b = await request.json().catch(() => ({}));
      const email = safeText(b.email, 160).toLowerCase();
      if (!EMAIL_RE.test(email)) return bad("이메일 주소를 다시 확인해 주세요.");
      if (!(await rateLimit(env, "reset:" + clientIp(request), 5, 3600)))
        return bad("요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.", 429);

      const u = await env.MINGLE_DB.prepare(
        "SELECT id FROM users WHERE email = ? AND deleted_at IS NULL"
      ).bind(email).first();

      // 가입 여부를 알려주지 않기 위해, 없어도 같은 응답을 돌려줍니다.
      if (u && env.BREVO_API_KEY) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await env.MINGLE_DB.prepare(
          "INSERT OR REPLACE INTO reset_codes (email, code_hash, expires_at, tries) VALUES (?,?,?,0)"
        ).bind(email, await sha256(code), Date.now() + 10 * 60 * 1000).run();

        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: "밍글", email: env.MAIL_FROM || "no-reply@hellomingle.kr" },
            to: [{ email }],
            subject: "[밍글] 비밀번호 재설정 코드",
            htmlContent:
              `<div style="font-family:Pretendard,system-ui,sans-serif;color:#17263F;line-height:1.7">
                 <p>안녕하세요, 밍글입니다.</p>
                 <p>비밀번호를 새로 정하시려면 아래 6자리 숫자를 화면에 입력해 주세요.</p>
                 <p style="font-size:30px;font-weight:800;letter-spacing:8px;color:#F46A1F;margin:22px 0">${code}</p>
                 <p>이 코드는 10분 동안만 쓸 수 있습니다. 직접 요청하신 게 아니라면 이 메일은 그냥 지워 주세요.</p>
                 <p style="color:#8A93A6;font-size:13px;margin-top:26px">밍글 · hellomingle.kr</p>
               </div>`,
          }),
        }).catch(() => {});
      }
      return json({ ok: true, mailReady: !!env.BREVO_API_KEY });
    }

    /* ---------- 비밀번호 재설정: 코드 확인 ---------- */
    if (route === "reset/confirm" && method === "POST") {
      const b = await request.json().catch(() => ({}));
      const email = safeText(b.email, 160).toLowerCase();
      const code = safeText(b.code, 6);
      const pErr = checkPassword(b.password); if (pErr) return bad(pErr);

      const row = await env.MINGLE_DB.prepare("SELECT * FROM reset_codes WHERE email = ?")
        .bind(email).first();
      if (!row) return bad("코드를 다시 요청해 주세요.", 400);
      if (row.expires_at < Date.now()) return bad("코드 사용 시간이 지났어요. 다시 요청해 주세요.", 400);
      if (row.tries >= 5) return bad("여러 번 틀렸어요. 코드를 다시 요청해 주세요.", 429);

      if ((await sha256(code)) !== row.code_hash) {
        await env.MINGLE_DB.prepare("UPDATE reset_codes SET tries = tries + 1 WHERE email = ?")
          .bind(email).run();
        return bad("코드가 맞지 않아요.", 400);
      }

      const u = await env.MINGLE_DB.prepare(
        "SELECT id FROM users WHERE email = ? AND deleted_at IS NULL"
      ).bind(email).first();
      if (!u) return bad("코드를 다시 요청해 주세요.", 400);

      const { hash, salt } = await hashPassword(String(b.password));
      await env.MINGLE_DB.batch([
        env.MINGLE_DB.prepare("UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?").bind(hash, salt, u.id),
        env.MINGLE_DB.prepare("DELETE FROM reset_codes WHERE email = ?").bind(email),
        env.MINGLE_DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id),
      ]);
      const token = await createSession(env, u.id);
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token) });
    }

    /* ---------- 탈퇴 ---------- */
    if (route === "withdraw" && method === "POST") {
      const me = await currentUser(request, env);
      if (!me) return bad("로그인이 필요해요.", 401);
      // 개인정보는 지우고, 기록의 연결만 끊습니다. 같은 이메일로 다시 가입할 수 있습니다.
      await env.MINGLE_DB.batch([
        env.MINGLE_DB.prepare(
          `UPDATE users SET email = NULL, pw_hash = NULL, pw_salt = NULL,
                            nickname = '탈퇴한 회원', interests = '[]',
                            provider_uid = NULL, deleted_at = ? WHERE id = ?`
        ).bind(Date.now(), me.id),
        env.MINGLE_DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(me.id),
      ]);
      return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
    }

    /* ---------- 카카오 / 구글 로그인 ---------- */
    if (route.startsWith("oauth/")) return oauth(context, route.slice(6));

    return json({ message: "없는 주소예요." }, 404);
  } catch (e) {
    return json({ message: "처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." }, 500);
  }
}

/* ============================================================
   OAuth
   등록해야 하는 Redirect URI (두 주소 모두 등록해 두세요)
     https://hellomingle.kr/api/auth/oauth/kakao/callback
     https://hellomingle.kr/api/auth/oauth/google/callback
   ============================================================ */
async function oauth({ request, env }, sub) {
  const origin = new URL(request.url).origin;
  const back = (msg) =>
    Response.redirect(origin + "/account/login.html?err=" + encodeURIComponent(msg), 302);

  /* --- 카카오 --- */
  if (sub === "kakao") {
    if (!env.KAKAO_REST_KEY) return back("카카오 로그인이 아직 준비되지 않았어요.");
    const state = crypto.randomUUID();
    const u = new URL("https://kauth.kakao.com/oauth/authorize");
    u.searchParams.set("client_id", env.KAKAO_REST_KEY);
    u.searchParams.set("redirect_uri", origin + "/api/auth/oauth/kakao/callback");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("state", state);
    return new Response(null, {
      status: 302,
      headers: {
        Location: u.toString(),
        "Set-Cookie": `mg_oauth=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      },
    });
  }

  if (sub === "kakao/callback") {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    if (!code) return back("카카오 로그인을 취소하셨어요.");
    const tk = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: env.KAKAO_REST_KEY,
        redirect_uri: origin + "/api/auth/oauth/kakao/callback",
        code,
      }),
    }).then((r) => r.json()).catch(() => null);
    if (!tk || !tk.access_token) return back("카카오 로그인에 실패했어요.");

    const me = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: "Bearer " + tk.access_token },
    }).then((r) => r.json()).catch(() => null);
    if (!me || !me.id) return back("카카오 정보를 가져오지 못했어요.");

    const nick = me.kakao_account?.profile?.nickname || "밍글회원";
    return finishOauth(env, origin, "kakao", String(me.id), me.kakao_account?.email || null, nick);
  }

  /* --- 구글 --- */
  if (sub === "google") {
    if (!env.GOOGLE_CLIENT_ID) return back("구글 로그인이 아직 준비되지 않았어요.");
    const state = crypto.randomUUID();
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
    u.searchParams.set("redirect_uri", origin + "/api/auth/oauth/google/callback");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", "openid email profile");
    u.searchParams.set("state", state);
    return new Response(null, {
      status: 302,
      headers: {
        Location: u.toString(),
        "Set-Cookie": `mg_oauth=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      },
    });
  }

  if (sub === "google/callback") {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    if (!code) return back("구글 로그인을 취소하셨어요.");
    const tk = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: origin + "/api/auth/oauth/google/callback",
        grant_type: "authorization_code",
      }),
    }).then((r) => r.json()).catch(() => null);
    if (!tk || !tk.access_token) return back("구글 로그인에 실패했어요.");

    const me = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: "Bearer " + tk.access_token },
    }).then((r) => r.json()).catch(() => null);
    if (!me || !me.id) return back("구글 정보를 가져오지 못했어요.");

    return finishOauth(env, origin, "google", me.id, me.email || null, me.name || "밍글회원");
  }

  return back("알 수 없는 로그인 방식이에요.");
}

/** 소셜 계정으로 회원을 찾거나 새로 만들고, 세션을 발급합니다. */
async function finishOauth(env, origin, provider, providerUid, email, rawNick) {
  if (!env.MINGLE_DB)
    return Response.redirect(origin + "/account/login.html?err=" + encodeURIComponent("회원 기능이 아직 연결되지 않았어요."), 302);

  let user = await env.MINGLE_DB.prepare(
    "SELECT * FROM users WHERE provider = ? AND provider_uid = ? AND deleted_at IS NULL"
  ).bind(provider, providerUid).first();

  if (!user && email) {
    user = await env.MINGLE_DB.prepare(
      "SELECT * FROM users WHERE email = ? AND deleted_at IS NULL"
    ).bind(email.toLowerCase()).first();
    if (user) {
      await env.MINGLE_DB.prepare("UPDATE users SET provider = ?, provider_uid = ? WHERE id = ?")
        .bind(provider, providerUid, user.id).run();
    }
  }

  if (!user) {
    // 닉네임이 겹치면 뒤에 숫자를 붙입니다.
    let nick = String(rawNick).replace(/[<>&"'\\/]/g, "").slice(0, 10) || "밍글회원";
    for (let i = 0; i < 20; i++) {
      const dup = await env.MINGLE_DB.prepare(
        "SELECT id FROM users WHERE nickname = ? AND deleted_at IS NULL"
      ).bind(nick).first();
      if (!dup) break;
      nick = String(rawNick).slice(0, 8) + Math.floor(10 + Math.random() * 89);
    }
    const id = crypto.randomUUID();
    await env.MINGLE_DB.prepare(
      `INSERT INTO users (id,email,nickname,lang,interests,level,role,provider,provider_uid,created_at)
       VALUES (?,?,?,'ko','[]',1,'member',?,?,?)`
    ).bind(id, email ? email.toLowerCase() : null, nick, provider, providerUid, Date.now()).run();
    user = await env.MINGLE_DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  }

  const token = await createSession(env, user.id);
  return new Response(null, {
    status: 302,
    headers: {
      Location: origin + "/account/me.html?welcome=1",
      "Set-Cookie": sessionCookie(token),
    },
  });
}
