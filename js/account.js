/* 회원 화면 — 로그인 · 가입 · 비밀번호 재설정 · 마이 밍글 */
(function () {
  const { api, $, $$, el, fmtWhen } = window.MINGLE;
  const nextUrl = new URLSearchParams(location.search).get("next") || "/";

  const say = (node, ok, text) => {
    if (!node) return;
    node.className = ok ? "ok-msg" : "err-msg";
    node.textContent = text;
  };

  /* ---------- 쓸 수 있는 로그인 수단만 켭니다 ---------- */
  (async function () {
    const boxes = $$("[data-oauth]");
    if (!boxes.length) return;
    const { data } = await api("/api/auth/providers");
    let off = 0;
    boxes.forEach((b) => {
      const k = b.getAttribute("data-oauth");
      if (!data[k]) { b.setAttribute("aria-disabled", "true"); b.removeAttribute("href"); off++; }
    });
    const note = $("[data-oauth-note]");
    if (note && off) {
      note.hidden = false;
      note.textContent = "카카오·구글 로그인은 준비되는 대로 열립니다. 지금은 이메일로 가입해 주세요.";
    }
  })();

  /* URL에 실려 온 오류 메시지 */
  const err = new URLSearchParams(location.search).get("err");
  if (err) say($("[data-auth-msg]"), false, err);

  /* ---------- 로그인 ---------- */
  const loginForm = $("[data-login-form]");
  if (loginForm) loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(loginForm);
    const btn = $("button[type=submit]", loginForm);
    btn.disabled = true;
    const { ok, data } = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
    });
    btn.disabled = false;
    if (!ok) return say($("[data-auth-msg]"), false, data.message || "로그인하지 못했어요.");
    location.href = nextUrl;
  });

  /* ---------- 가입 ---------- */
  const signupForm = $("[data-signup-form]");
  if (signupForm) signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(signupForm);
    const btn = $("button[type=submit]", signupForm);
    btn.disabled = true;
    const { ok, data } = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: fd.get("email"),
        nickname: fd.get("nickname"),
        password: fd.get("password"),
        lang: fd.get("lang") || "ko",
        agree: fd.get("agree") === "on",
        marketing: fd.get("marketing") === "on",
        website: fd.get("website") || "",
      }),
    });
    btn.disabled = false;
    if (!ok) return say($("[data-auth-msg]"), false, data.message || "가입하지 못했어요.");
    location.href = "/account/me.html?welcome=1";
  });

  /* ---------- 비밀번호 재설정 ---------- */
  const reqForm = $("[data-reset-request]");
  const cfmForm = $("[data-reset-confirm]");
  if (reqForm) reqForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = new FormData(reqForm).get("email");
    const btn = $("button[type=submit]", reqForm);
    btn.disabled = true;
    const { ok, data } = await api("/api/auth/reset/request", {
      method: "POST", body: JSON.stringify({ email }),
    });
    btn.disabled = false;
    if (!ok) return say($("[data-auth-msg]"), false, data.message || "요청하지 못했어요.");
    if (!data.mailReady)
      return say($("[data-auth-msg]"), false,
        "메일 발송이 아직 연결되지 않았어요. 운영자에게 문의해 주세요.");
    say($("[data-auth-msg]"), true, "메일을 보냈어요. 받은 편지함을 확인해 주세요. 안 보이면 스팸함도 봐 주세요.");
    cfmForm.hidden = false;
    cfmForm.dataset.email = email;
    $("#rs-code").focus();
  });

  if (cfmForm) cfmForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(cfmForm);
    const btn = $("button[type=submit]", cfmForm);
    btn.disabled = true;
    const { ok, data } = await api("/api/auth/reset/confirm", {
      method: "POST",
      body: JSON.stringify({
        email: cfmForm.dataset.email,
        code: fd.get("code"),
        password: fd.get("password"),
      }),
    });
    btn.disabled = false;
    if (!ok) return say($("[data-auth-msg]"), false, data.message || "바꾸지 못했어요.");
    location.href = "/account/me.html";
  });

  /* ---------- 마이 밍글 ---------- */
  const mePage = $("[data-me-page]");
  if (mePage) initMe();

  async function initMe() {
    const me = await window.MINGLE.authReady;
    if (!me) {
      $$("[data-guest-only]").forEach((n) => (n.hidden = false));
      $("[data-me-sub]").textContent = "로그인하면 활동 기록을 볼 수 있어요.";
      return;
    }
    $("[data-me-sub]").textContent =
      new Date(me.joinedAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long" }) +
      "부터 밍글 회원이세요. " + (me.emailMasked || "");
    const nickInput = $("#me-nick");
    if (nickInput) nickInput.value = me.nickname;

    if (new URLSearchParams(location.search).get("welcome"))
      say($("[data-me-msg]"), true, "가입을 환영합니다. 매장에 오시면 도장부터 하나 찍어 보세요.");

    /* 활동 숫자 */
    const { data: ck } = await api("/api/checkin");
    if (ck && ck.signedIn) {
      $("[data-my-stamps]").textContent = ck.stamps ?? 0;
      $("[data-my-visits]").textContent = ck.total ?? 0;
    }
    const { data: mm } = await api("/api/meetups?scope=mine");
    const applied = mm.applied || [], hosted = mm.hosted || [];
    $("[data-my-applied]").textContent = applied.length;
    $("[data-my-hosted]").textContent = hosted.length;

    const box = $("[data-my-meetups]");
    box.innerHTML = "";
    if (!applied.length && !hosted.length) {
      box.append(el("p", "small", "아직 신청한 모임이 없어요. 커뮤니티에서 둘러보세요."));
    } else {
      const list = el("div", "stack");
      for (const m of [...hosted, ...applied]) {
        const row = el("div", "muted-box");
        const t = el("b", null, m.title);
        const sub = el("div", "small");
        const stateKo = { pending: "검수 중", open: "공개됨", closed: "마감", blocked: "비공개", done: "종료" };
        sub.textContent = fmtWhen(m.starts_at) + " · " + (stateKo[m.status] || m.status);
        row.append(t, sub);
        list.append(row);
      }
      box.append(list);
    }

    /* 닉네임 */
    $("[data-nick-form]").addEventListener("submit", async (e) => {
      e.preventDefault();
      const nickname = new FormData(e.target).get("nickname");
      const { ok, data } = await api("/api/auth/profile", {
        method: "POST", body: JSON.stringify({ nickname }),
      });
      say($("[data-me-msg]"), ok, ok ? "닉네임을 바꿨어요." : (data.message || "바꾸지 못했어요."));
      if (ok) $$("[data-me-nick]").forEach((n) => (n.textContent = data.user.nickname));
    });

    /* 비밀번호 */
    $("[data-pw-form]").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const { ok, data } = await api("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ current: fd.get("current"), next: fd.get("next") }),
      });
      say($("[data-me-msg]"), ok, ok ? "비밀번호를 바꿨어요." : (data.message || "바꾸지 못했어요."));
      if (ok) e.target.reset();
    });

    /* 로그아웃 · 탈퇴 */
    $("[data-logout]").addEventListener("click", async () => {
      await api("/api/auth/logout", { method: "POST" });
      location.href = "/";
    });
    $("[data-withdraw]").addEventListener("click", async () => {
      if (!confirm("정말 탈퇴하시겠어요?\n이메일과 닉네임은 지워지고, 남긴 글은 작성자 없이 남습니다.")) return;
      if (!confirm("한 번 더 확인할게요. 되돌릴 수 없습니다.")) return;
      await api("/api/auth/withdraw", { method: "POST" });
      alert("탈퇴 처리했습니다. 그동안 함께해 주셔서 고맙습니다.");
      location.href = "/";
    });
  }
})();
