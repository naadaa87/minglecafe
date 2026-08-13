/* 관리자 화면 — 휴대폰에서 쓰는 것을 기준으로 만들었습니다. */
(function () {
  const { api, $, $$, el, timeAgo, fmtWhen } = window.MINGLE;

  const loginBox = $("[data-admin-login]");
  const panel = $("[data-admin-panel]");
  if (!loginBox || !panel) return;

  const say = (sel, ok, text) => {
    const n = $(sel);
    if (!n) return;
    n.className = ok ? "ok-msg" : "err-msg";
    n.textContent = text;
  };

  let state = { level: "unknown", note: "", devices: [], soldout: [] };

  /* ---------- 로그인 ---------- */
  $("[data-admin-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = new FormData(e.target).get("pin");
    const btn = $("button[type=submit]", e.target);
    btn.disabled = true;
    const { ok, data } = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ pin }) });
    btn.disabled = false;
    if (!ok) return say("[data-admin-msg]", false, data.message || "들어가지 못했어요.");
    open();
  });

  $("[data-admin-logout]").addEventListener("click", async () => {
    await api("/api/admin/logout", { method: "POST" });
    location.reload();
  });

  /* ---------- 진입 ---------- */
  (async function () {
    const { data } = await api("/api/admin/session");
    if (data.ok) open();
    else if (!data.pinSet)
      say("[data-admin-msg]", false, "관리자 PIN이 아직 등록되지 않았어요. Cloudflare 설정에서 ADMIN_PIN을 Secret으로 넣고 다시 배포해 주세요.");
  })();

  async function open() {
    loginBox.hidden = true;
    panel.hidden = false;
    buildSoldoutChips();
    await loadStatus();
    await Promise.all([loadOverview(), loadMeetups(), loadReports(), loadInquiries()]);
  }

  /* ---------- 숫자 ---------- */
  async function loadOverview() {
    const { data } = await api("/api/admin/overview");
    $("[data-kpi-inq]").textContent = data.inquiries ?? 0;
    $("[data-kpi-rep]").textContent = data.reports ?? 0;
    $("[data-kpi-meet]").textContent = data.pendingMeetups ?? 0;
    $("[data-kpi-mem]").textContent = data.members ?? 0;
  }

  /* ---------- 매장 상태 ---------- */
  function buildSoldoutChips() {
    const box = $("[data-soldout-chips]");
    if (!box || !window.MINGLE_MENU) return;
    box.innerHTML = "";
    for (const g of window.MINGLE_MENU.groups)
      for (const it of g.items) {
        const b = el("button", "chip", it.ko);
        b.dataset.item = it.id;
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", () => {
          const on = b.getAttribute("aria-pressed") === "true";
          b.setAttribute("aria-pressed", String(!on));
        });
        box.append(b);
      }
  }

  function paintChips() {
    $$("[data-level-chips] .chip").forEach((c) =>
      c.setAttribute("aria-pressed", String(c.dataset.level === state.level)));
    $$("[data-device-chips] .chip").forEach((c) =>
      c.setAttribute("aria-pressed", String(state.devices.includes(c.dataset.device))));
    $$("[data-soldout-chips] .chip").forEach((c) =>
      c.setAttribute("aria-pressed", String(state.soldout.includes(c.dataset.item))));
    $("#ad-note").value = state.note || "";
  }

  async function loadStatus() {
    const { data } = await api("/api/status");
    state = {
      level: data.level || "unknown",
      note: data.note || "",
      devices: data.devices || [],
      soldout: data.soldout || [],
    };
    paintChips();
  }

  $$("[data-level-chips] .chip").forEach((c) =>
    c.addEventListener("click", () => {
      state.level = c.dataset.level;
      $$("[data-level-chips] .chip").forEach((x) =>
        x.setAttribute("aria-pressed", String(x === c)));
    }));

  $$("[data-device-chips] .chip").forEach((c) =>
    c.addEventListener("click", () => {
      const on = c.getAttribute("aria-pressed") === "true";
      c.setAttribute("aria-pressed", String(!on));
    }));

  $("[data-status-save]").addEventListener("click", async () => {
    const body = {
      level: state.level,
      note: $("#ad-note").value,
      devices: $$("[data-device-chips] .chip")
        .filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => c.dataset.device),
      soldout: $$("[data-soldout-chips] .chip")
        .filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => c.dataset.item),
    };
    const btn = $("[data-status-save]");
    btn.disabled = true;
    const { ok, data } = await api("/api/admin/status", { method: "POST", body: JSON.stringify(body) });
    btn.disabled = false;
    say("[data-status-msg]", ok, ok ? "저장했어요. 손님 화면에 바로 보입니다." : (data.message || "저장하지 못했어요."));
    if (ok) state = { ...state, ...body };
  });

  /* ---------- 모임 검수 ---------- */
  async function loadMeetups() {
    const box = $("[data-admin-meetups]");
    const { data } = await api("/api/admin/meetups");
    box.innerHTML = "";
    const items = data.items || [];
    if (!items.length) return box.append(el("p", "small", "검수할 모임이 없어요."));
    for (const m of items) {
      const row = el("div", "muted-box");
      row.style.marginBottom = "10px";
      row.append(el("b", null, m.title));
      const sub = el("div", "small");
      sub.textContent = `${m.host_nick} · ${fmtWhen(m.starts_at)} · 정원 ${m.capacity} · ${m.status === "pending" ? "검수 대기" : "공개 중"}`;
      row.append(sub);
      if (m.goal) row.append(el("div", "small", m.goal));

      const acts = el("div", "chip-row");
      acts.style.marginTop = "8px";
      const mk = (label, st) => {
        const b = el("button", "chip", label);
        b.style.minHeight = "34px";
        b.addEventListener("click", async () => {
          b.disabled = true;
          await api("/api/admin/meetups/set", { method: "POST", body: JSON.stringify({ id: m.id, state: st }) });
          loadMeetups(); loadOverview();
        });
        return b;
      };
      if (m.status === "pending") acts.append(mk("공개하기", "open"));
      acts.append(mk("마감", "closed"), mk("비공개", "blocked"));
      row.append(acts);
      box.append(row);
    }
  }

  /* ---------- 신고 ---------- */
  async function loadReports() {
    const box = $("[data-admin-reports]");
    const { data } = await api("/api/admin/reports");
    box.innerHTML = "";
    const items = data.items || [];
    if (!items.length) return box.append(el("p", "small", "새 신고가 없어요."));
    for (const r of items) {
      const row = el("div", "muted-box");
      row.style.marginBottom = "10px";
      row.append(el("b", null, r.reason));
      row.append(el("div", "small", `${r.target_type} · ${timeAgo(r.created_at)}`));
      if (r.detail) row.append(el("div", "small", r.detail));

      const acts = el("div", "chip-row");
      acts.style.marginTop = "8px";
      if (r.target_type === "post") {
        const hide = el("button", "chip", "해당 글 숨기기");
        hide.style.minHeight = "34px";
        hide.addEventListener("click", async () => {
          hide.disabled = true;
          await api("/api/admin/posts/hide", { method: "POST", body: JSON.stringify({ id: r.target_id }) });
          hide.textContent = "숨김 완료";
        });
        acts.append(hide);
      }
      const done = el("button", "chip", "처리 완료");
      done.style.minHeight = "34px";
      done.addEventListener("click", async () => {
        done.disabled = true;
        await api("/api/admin/reports/done", { method: "POST", body: JSON.stringify({ id: r.id }) });
        loadReports(); loadOverview();
      });
      acts.append(done);
      row.append(acts);
      box.append(row);
    }
  }

  /* ---------- 문의 ---------- */
  async function loadInquiries() {
    const box = $("[data-admin-inquiries]");
    const { data } = await api("/api/admin/inquiries");
    box.innerHTML = "";
    const items = (data.items || []).filter((i) => !i.done);
    if (!items.length) return box.append(el("p", "small", "새 문의가 없어요."));
    const kindKo = { startup: "창업", partner: "제휴", space: "공간 제안" };
    for (const i of items) {
      const row = el("div", "muted-box");
      row.style.marginBottom = "10px";
      row.append(el("b", null, `[${kindKo[i.kind] || i.kind}] ${i.name}`));
      row.append(el("div", "small", `${i.contact}${i.region ? " · " + i.region : ""} · ${timeAgo(i.ts)}`));
      row.append(el("div", null, i.message));
      const done = el("button", "chip", "처리 완료");
      done.style.cssText = "min-height:34px;margin-top:8px";
      done.addEventListener("click", async () => {
        done.disabled = true;
        await api("/api/admin/inquiries/done", { method: "POST", body: JSON.stringify({ id: i.id }) });
        loadInquiries(); loadOverview();
      });
      row.append(done);
      box.append(row);
    }
  }
})();
