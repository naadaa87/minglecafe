/* ============================================================
   MINGLE 공통 스크립트
   바꿀 값은 아래 SITE 한 곳에만 있습니다.
   ============================================================ */

const SITE = {
  name: "밍글",
  storeName: "밍글 무인카페 건대화양점",
  address: "서울특별시 광진구 화양동 10-1",
  addressRoad: "서울 광진구 능동로13길 39",
  supportEmail: "spaceblank0100@gmail.com",
  partnershipEmail: "spaceblank0100@gmail.com",
  instagram: "",    // 예: https://instagram.com/mingle_cafe
  kakaoChannel: "", // 예: http://pf.kakao.com/_xxxxx
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: opts.body ? { "Content-Type": "application/json" } : {},
    ...opts,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
};

const timeAgo = (ts) => {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return "방금 전";
  if (d < 3600) return Math.floor(d / 60) + "분 전";
  if (d < 86400) return Math.floor(d / 3600) + "시간 전";
  return new Date(ts).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
};

const fmtWhen = (ts) => {
  if (!ts) return "날짜 조율 중";
  const d = new Date(ts);
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" }) +
         " " + d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
};

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;   // textContent — HTML 삽입 차단
  return n;
};

/* ---------- 화면 밝기 ---------- */
(function () {
  const btn = $("[data-theme-toggle]");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") === "dawn" ? "day" : "dawn";
    document.documentElement.setAttribute("data-theme", cur);
    try { localStorage.setItem("mg-theme", cur); } catch {}
  });
})();

/* ---------- 모바일 메뉴 ---------- */
(function () {
  const btn = $(".menu-btn"), sheet = $(".sheet");
  if (!btn || !sheet) return;
  const close = () => { sheet.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", () => {
    sheet.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    sheet.querySelector("a, button").focus();
  });
  $(".sheet__bg", sheet).addEventListener("click", close);
  $(".sheet__close", sheet).addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
})();

/* ---------- 연락처·SNS 자동 채움 ---------- */
$$("[data-site]").forEach((n) => {
  const key = n.getAttribute("data-site");
  if (!SITE[key]) return;
  if (n.tagName === "A" && key.toLowerCase().includes("mail")) {
    n.href = "mailto:" + SITE[key];
    n.textContent = SITE[key];
  } else n.textContent = SITE[key];
});
$$("[data-sns]").forEach((n) => {
  const key = n.getAttribute("data-sns");
  if (SITE[key]) { n.href = SITE[key]; n.target = "_blank"; n.rel = "noopener"; }
  else { n.removeAttribute("href"); n.textContent += " (준비 중)"; n.classList.add("small"); }
});

/* ============================================================
   회원 상태 — 로그인 여부에 따라 화면을 바꿉니다.
   [data-auth-only] 로그인했을 때만 / [data-guest-only] 안 했을 때만
   ============================================================ */
let ME = null;
const authReady = (async () => {
  const { data } = await api("/api/auth/me");
  ME = data.user || null;
  paintAuth();
  return ME;
})();

function paintAuth() {
  $$("[data-auth-only]").forEach((n) => { n.hidden = !ME; });
  $$("[data-guest-only]").forEach((n) => { n.hidden = !!ME; });
  $$("[data-auth-link]").forEach((n) => {
    if (ME) { n.href = "/account/me.html"; n.textContent = ME.nickname; }
    else { n.href = "/account/login.html"; n.textContent = "로그인"; }
  });
  $$("[data-me-nick]").forEach((n) => { n.textContent = ME ? ME.nickname : ""; });
}

/* ============================================================
   매장 상태 카드 — 사람이 /admin 에서 직접 갱신합니다.
   ============================================================ */
(async function () {
  const card = $("[data-status-card]");
  if (!card) return;
  const { data } = await api("/api/status");
  const label = { free: "지금 자리 넉넉해요", normal: "적당히 앉아 계세요", busy: "지금은 좀 붐벼요", unknown: "24시간 열려 있어요" };
  card.setAttribute("data-level", data.level || "unknown");
  $("[data-status-title]", card).textContent = label[data.level] || label.unknown;

  const bits = [];
  if (data.updatedAt) bits.push(timeAgo(data.updatedAt) + " 확인");
  else bits.push("무인 운영 · 언제든 이용 가능");
  if (data.note) bits.push(data.note);
  if (data.devices && data.devices.length) bits.push("점검 중: " + data.devices.join(", "));
  $("[data-status-sub]", card).textContent = bits.join(" · ");
})();

/* ============================================================
   오늘의 메뉴
   ============================================================ */
(async function () {
  const root = $("[data-menu]");
  if (!root || !window.MINGLE_MENU) return;

  let soldout = [];
  const { data } = await api("/api/status");
  if (data && Array.isArray(data.soldout)) soldout = data.soldout;

  const wrap = el("div");
  for (const g of window.MINGLE_MENU.groups) {
    const head = el("div", "row-between");
    head.style.margin = "34px 0 14px";
    const h = el("h2", null, g.ko);
    h.style.margin = "0";
    head.append(h);
    if (g.desc) { const d = el("p", "small", g.desc); d.style.margin = "0"; head.append(d); }
    wrap.append(head);

    const grid = el("div", "menu-grid");
    for (const it of g.items) {
      const sold = soldout.includes(it.id);
      const card = el("article", "mcard");
      card.setAttribute("data-sold", sold ? "1" : "0");

      if (it.img) {
        const box = el("div", "mcard__img");
        const img = el("img");
        img.src = "/img/p/" + it.img + ".webp";
        img.alt = it.ko;
        img.loading = "lazy";
        box.append(img);
        if (it.new && !sold) box.append(el("span", "mcard__flag mcard__flag--new", "NEW"));
        if (sold) box.append(el("span", "mcard__flag mcard__flag--sold", "오늘 품절"));
        card.append(box);
      }

      const b = el("div", "mcard__b");
      b.append(el("h3", null, it.ko));
      b.append(el("span", "en", it.en));
      if (sold && !it.img) b.append(el("span", "badge badge--soon", "오늘 품절"));
      const price = it.price
        ? el("span", "mcard__price", it.price.toLocaleString("ko-KR") + "원")
        : el("span", "mcard__price na", "매장 가격표");
      b.append(price);
      card.append(b);
      grid.append(card);
    }
    wrap.append(grid);
  }
  root.innerHTML = "";
  root.append(wrap);

  const note = $("[data-menu-note]");
  if (note) note.textContent = window.MINGLE_MENU.note;
})();

/* ============================================================
   밍글보드
   ============================================================ */
const boardEl = $("[data-board]");
if (boardEl) initBoard(boardEl);

async function initBoard(root) {
  const listEl = $("[data-board-list]", root);
  const form = $("[data-board-form]", root);
  const chips = $$("[data-cat-chip]", root);
  const statusEl = $("[data-board-status]", root);
  const nickField = $("[data-nick-field]", root);
  let cat = "all", cache = [];

  await authReady;
  if (ME && nickField) {
    nickField.hidden = true;
    const inp = $("input", nickField);
    if (inp) { inp.value = ME.nickname; inp.required = false; }
    const badge = $("[data-board-asme]", root);
    if (badge) { badge.hidden = false; badge.textContent = ME.nickname + " 이름으로 올라갑니다"; }
  }

  function render() {
    listEl.innerHTML = "";
    const items = cat === "all" ? cache : cache.filter((p) => p.cat === cat);
    if (!items.length) {
      listEl.append(el("div", "empty", "아직 조용하네요. 첫 글을 남겨 보실래요?"));
      return;
    }
    for (const p of items) {
      const art = el("article", "post");
      const meta = el("div", "post__meta");
      meta.append(el("span", "badge badge--navy", p.cat));
      meta.append(el("b", null, p.nick));
      if (p.member) meta.append(el("span", "tbadge", "회원"));
      meta.append(el("span", null, timeAgo(p.ts)));
      art.append(meta, el("p", "post__body", p.content));

      const act = el("div", "post__actions row-between");
      act.style.gap = "10px";

      const up = el("button", "chip");
      up.style.minHeight = "34px";
      up.textContent = p.ups ? `저요! ${p.ups}` : "저요!";
      up.addEventListener("click", async () => {
        up.disabled = true;
        const { ok, data } = await api("/api/posts", {
          method: "POST", body: JSON.stringify({ action: "up", postId: p.id }),
        });
        if (ok) { p.ups = data.ups || p.ups + 1; up.textContent = `저요! ${p.ups}`; }
        up.disabled = false;
      });
      act.append(up);

      const cbtn = el("button", "chip");
      cbtn.style.minHeight = "34px";
      cbtn.textContent = p.cmts ? `댓글 ${p.cmts}` : "댓글";
      act.append(cbtn);

      const rep = el("button", "chip");
      rep.style.minHeight = "34px";
      rep.textContent = "신고";
      rep.addEventListener("click", () => openReport("post", p.id));
      act.append(rep);

      if (p.mine) {
        const del = el("button", "chip");
        del.style.minHeight = "34px";
        del.textContent = "삭제";
        del.addEventListener("click", async () => {
          if (!confirm("이 글을 지울까요? 되돌릴 수 없어요.")) return;
          const { ok } = await api("/api/posts?id=" + encodeURIComponent(p.id), { method: "DELETE" });
          if (ok) load();
        });
        act.append(del);
      }
      art.append(act);

      /* 댓글 영역 */
      const cbox = el("div");
      cbox.hidden = true;
      cbox.style.marginTop = "12px";
      cbtn.addEventListener("click", async () => {
        cbox.hidden = !cbox.hidden;
        if (cbox.hidden || cbox.dataset.loaded) return;
        cbox.dataset.loaded = "1";
        const { data } = await api("/api/posts?comments=" + encodeURIComponent(p.id));
        const list = el("div", "stack");
        for (const c of data.comments || []) {
          const line = el("div", "muted-box");
          line.style.padding = "10px 13px";
          const m = el("div", "small");
          m.textContent = c.nick + " · " + timeAgo(c.ts);
          line.append(m, el("div", null, c.content));
          list.append(line);
        }
        if (!(data.comments || []).length) list.append(el("p", "small", "아직 댓글이 없어요."));
        cbox.append(list);

        const ta = el("textarea");
        ta.placeholder = "짧게 한마디 남겨 주세요";
        ta.style.cssText = "width:100%;margin-top:10px;min-height:64px;border:1.5px solid var(--line-2);border-radius:12px;padding:10px 12px;font:inherit";
        const send = el("button", "btn btn--primary btn--sm", "댓글 남기기");
        send.style.marginTop = "8px";
        send.addEventListener("click", async () => {
          const content = ta.value.trim();
          if (content.length < 2) return alert("댓글을 조금만 더 적어 주세요.");
          send.disabled = true;
          const { ok, data: d } = await api("/api/posts", {
            method: "POST",
            body: JSON.stringify({ action: "comment", postId: p.id, content, nick: ME ? undefined : "이웃" }),
          });
          send.disabled = false;
          if (!ok) return alert(d.message || "댓글을 남기지 못했어요.");
          ta.value = "";
          cbox.dataset.loaded = "";
          cbox.innerHTML = "";
          cbtn.click(); cbtn.click();
          p.cmts = (p.cmts || 0) + 1;
          cbtn.textContent = `댓글 ${p.cmts}`;
        });
        cbox.append(ta, send);
      });
      art.append(cbox);
      listEl.append(art);
    }
  }

  async function load() {
    const { ok, data } = await api("/api/posts?limit=40");
    if (!ok) {
      listEl.innerHTML = "";
      listEl.append(el("div", "empty", data.message || "게시판을 불러오지 못했어요."));
      return;
    }
    cache = data.posts || [];
    render();
  }

  chips.forEach((c) => c.addEventListener("click", () => {
    chips.forEach((x) => x.setAttribute("aria-pressed", "false"));
    c.setAttribute("aria-pressed", "true");
    cat = c.getAttribute("data-cat-chip");
    render();
  }));

  if (form) form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = {
      nick: ME ? undefined : String(fd.get("nick") || ""),
      cat: String(fd.get("cat") || ""),
      content: String(fd.get("content") || ""),
      website: String(fd.get("website") || ""),
    };
    statusEl.textContent = "";
    statusEl.className = "";
    const btn = $("button[type=submit]", form);
    btn.disabled = true;
    const { ok, data } = await api("/api/posts", { method: "POST", body: JSON.stringify(body) });
    btn.disabled = false;
    if (!ok) { statusEl.className = "err-msg"; statusEl.textContent = data.message || "글을 올리지 못했어요."; return; }
    statusEl.className = "ok-msg";
    statusEl.textContent = "올라갔어요. 이웃들이 곧 볼 거예요.";
    form.reset();
    load();
  });

  load();
}

/* ============================================================
   모임
   ============================================================ */
const meetRoot = $("[data-meetups]");
if (meetRoot) initMeetups(meetRoot);

async function initMeetups(root) {
  const listEl = $("[data-meet-list]", root);
  const form = $("[data-meet-form]", root);
  const statusEl = $("[data-meet-status]", root);
  await authReady;

  async function load() {
    const { ok, data } = await api("/api/meetups");
    listEl.innerHTML = "";
    if (!ok) { listEl.append(el("div", "empty", data.message || "모임을 불러오지 못했어요.")); return; }
    const items = data.meetups || [];
    if (!items.length) {
      listEl.append(el("div", "empty", "아직 열린 모임이 없어요. 첫 모임을 만들어 보실래요?"));
      return;
    }
    const grid = el("div", "grid grid--2");
    for (const m of items) {
      const c = el("article", "meet");
      const top = el("div", "meet__top");
      top.append(el("span", "badge", m.categoryKo));
      if (m.lang === "en") top.append(el("span", "badge badge--navy", "KR/EN"));
      if (m.status === "closed") top.append(el("span", "badge badge--soon", "마감"));
      c.append(top, el("h3", null, m.title));
      if (m.goal) c.append(el("p", null, m.goal));

      const meta = el("div", "meet__meta");
      meta.append(el("span", null, fmtWhen(m.startsAt)));
      meta.append(el("span", null, m.place));
      meta.append(el("span", null, "진행 " + m.duration + "분"));
      meta.append(el("span", null, "호스트 " + m.hostNick));
      c.append(meta);

      const foot = el("div", "meet__foot");
      foot.append(el("span", "meet__seats", `${m.taken}/${m.capacity}명`));
      const btn = el("button", "btn btn--sm " + (m.applied ? "btn--ghost" : "btn--primary"));
      btn.textContent = m.mine ? "내가 연 모임" : m.applied ? "신청 취소" : "신청하기";
      btn.disabled = m.mine || (m.status !== "open" && !m.applied);
      btn.addEventListener("click", async () => {
        if (!ME) { location.href = "/account/login.html?next=" + encodeURIComponent("/community.html#meetups"); return; }
        btn.disabled = true;
        const { ok, data: d } = await api("/api/meetups", {
          method: "POST",
          body: JSON.stringify({ action: m.applied ? "cancel" : "apply", id: m.id }),
        });
        btn.disabled = false;
        if (!ok) return alert(d.message || "처리하지 못했어요.");
        load();
      });
      foot.append(btn);
      c.append(foot);
      grid.append(c);
    }
    listEl.append(grid);
  }

  if (form) form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!ME) { location.href = "/account/login.html?next=" + encodeURIComponent("/community.html#meetups"); return; }
    const fd = new FormData(form);
    const dt = String(fd.get("startsAt") || "");
    const body = {
      action: "create",
      title: String(fd.get("title") || ""),
      category: String(fd.get("category") || ""),
      goal: String(fd.get("goal") || ""),
      detail: String(fd.get("detail") || ""),
      capacity: Number(fd.get("capacity") || 8),
      duration: Number(fd.get("duration") || 90),
      lang: String(fd.get("lang") || "ko"),
      startsAt: dt ? new Date(dt).getTime() : null,
    };
    const btn = $("button[type=submit]", form);
    btn.disabled = true;
    const { ok, data } = await api("/api/meetups", { method: "POST", body: JSON.stringify(body) });
    btn.disabled = false;
    statusEl.className = ok ? "ok-msg" : "err-msg";
    statusEl.textContent = ok
      ? (data.status === "pending"
          ? "접수됐어요. 처음 여는 모임이라 운영자가 한 번 보고 공개합니다. 보통 하루 안에 끝나요."
          : "모임이 공개됐어요.")
      : (data.message || "모임을 만들지 못했어요.");
    if (ok) { form.reset(); load(); }
  });

  load();
}

/* ============================================================
   밍글패스 — 체크인 · 스탬프
   ============================================================ */
const passRoot = $("[data-pass]");
if (passRoot) initPass(passRoot);

async function initPass(root) {
  const stampsEl = $("[data-stamps]", root);
  const btn = $("[data-checkin-btn]", root);
  const msg = $("[data-pass-msg]", root);
  const src = new URLSearchParams(location.search).get("src") || "entrance";
  await authReady;

  function paint(d) {
    if (stampsEl) {
      stampsEl.innerHTML = "";
      for (let i = 1; i <= (d.goal || 10); i++) {
        const s = el("div", "stamp" + (i === (d.goal || 10) ? " stamp--goal" : ""), i === (d.goal || 10) ? "★" : String(i));
        if (i <= (d.stamps || 0)) s.setAttribute("data-on", "1");
        stampsEl.append(s);
      }
    }
    $$("[data-stamp-count]", root).forEach((n) => { n.textContent = String(d.stamps || 0); });
    $$("[data-total-count]", root).forEach((n) => { n.textContent = String(d.total || 0); });
    if (btn) {
      btn.disabled = !!d.checkedInToday;
      btn.textContent = d.checkedInToday ? "오늘은 이미 찍었어요" : "오늘 방문 도장 찍기";
    }
    const redeem = root.querySelector("[data-redeem-btn]");
    if (redeem) redeem.hidden = !(d.rewardsReady > 0);
    if (d.rewardsReady > 0 && msg) {
      msg.className = "ok-msg";
      msg.textContent = "도장 10개를 모으셨어요. 매장에서 음료 한 잔을 받으신 뒤 아래 버튼을 눌러 판을 비워 주세요.";
    }
  }

  const { ok, data } = await api("/api/checkin");
  if (!ok || !data.signedIn) {
    root.querySelectorAll("[data-pass-signed]").forEach((n) => { n.hidden = true; });
    root.querySelectorAll("[data-pass-guest]").forEach((n) => { n.hidden = false; });
    return;
  }
  root.querySelectorAll("[data-pass-guest]").forEach((n) => { n.hidden = true; });
  root.querySelectorAll("[data-pass-signed]").forEach((n) => { n.hidden = false; });
  paint(data);

  const redeemBtn = root.querySelector("[data-redeem-btn]");
  if (redeemBtn) redeemBtn.addEventListener("click", async () => {
    if (!confirm("음료를 받으셨나요? 확인을 누르면 도장판이 처음부터 다시 시작합니다.")) return;
    redeemBtn.disabled = true;
    const { ok, data: d } = await api("/api/checkin", { method: "POST", body: JSON.stringify({ action: "redeem" }) });
    redeemBtn.disabled = false;
    if (!ok) { if (msg) { msg.className = "err-msg"; msg.textContent = d.message || "처리하지 못했어요."; } return; }
    paint(d);
    if (msg) { msg.className = "ok-msg"; msg.textContent = "새 도장판을 시작했어요. 또 뵙겠습니다."; }
  });

  if (btn) btn.addEventListener("click", async () => {
    btn.disabled = true;
    const { ok, data: d } = await api("/api/checkin", { method: "POST", body: JSON.stringify({ source: src }) });
    if (!ok) { btn.disabled = false; if (msg) { msg.className = "err-msg"; msg.textContent = d.message || "체크인하지 못했어요."; } return; }
    paint(d);
    if (msg && !d.already && d.rewardsReady === 0) {
      msg.className = "ok-msg";
      msg.textContent = "도장 하나 찍었어요. 오늘도 와 주셔서 고맙습니다.";
    }
  });
}

/* ============================================================
   신고 창
   ============================================================ */
function openReport(targetType, targetId) {
  const reasons = ["영업·홍보", "욕설·괴롭힘", "성적·데이트 목적", "사기·금전 요구", "개인정보 노출", "기타"];
  const pick = prompt(
    "어떤 문제인가요? 번호를 적어 주세요.\n" + reasons.map((r, i) => `${i + 1}. ${r}`).join("\n")
  );
  const idx = Number(pick) - 1;
  if (!(idx >= 0 && idx < reasons.length)) return;
  const detail = prompt("자세한 내용을 적어 주시면 확인이 빨라집니다. (건너뛰셔도 됩니다)") || "";
  api("/api/reports", {
    method: "POST",
    body: JSON.stringify({ targetType, targetId, reason: reasons[idx], detail }),
  }).then(({ ok, data }) => {
    alert(ok ? "접수했습니다. 확인하고 조치할게요." : (data.message || "접수하지 못했어요."));
  });
}

/* ============================================================
   창업 · 제휴 문의 폼
   ============================================================ */
$$("[data-inquiry-form]").forEach((form) => {
  const statusEl = $("[data-form-msg]", form) || $("[data-inquiry-status]", form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = {
      kind: form.getAttribute("data-inquiry-form"),
      ptype: String(fd.get("ptype") || ""),
      name: String(fd.get("name") || ""),
      contact: String(fd.get("contact") || ""),
      region: String(fd.get("region") || ""),
      message: String(fd.get("message") || ""),
      agree: fd.get("agree") === "on",
      marketing: fd.get("marketing") === "on",
      website: String(fd.get("website") || ""),
    };
    const btn = $("button[type=submit]", form);
    btn.disabled = true;
    const { ok, data } = await api("/api/inquiries", { method: "POST", body: JSON.stringify(body) });
    btn.disabled = false;
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.className = ok ? "ok-msg" : "err-msg";
      statusEl.textContent = ok
        ? "접수됐습니다. 보통 1~2 영업일 안에 답을 드려요."
        : (data.message || "접수하지 못했어요.");
    }
    if (ok) form.reset();
  });
});

/* ---------- 탭 ---------- */
$$("[data-tabs]").forEach((tabs) => {
  const btns = $$("button", tabs);
  const show = (id) => {
    btns.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === id)));
    $$("[data-tabpanel]").forEach((p) => { p.hidden = p.dataset.tabpanel !== id; });
    if (history.replaceState) history.replaceState(null, "", "#" + id);
  };
  btns.forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
  const initial = location.hash.slice(1);
  show(btns.some((b) => b.dataset.tab === initial) ? initial : btns[0].dataset.tab);
  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (btns.some((b) => b.dataset.tab === h)) show(h);
  });
});

window.MINGLE = { api, authReady, openReport, SITE, $, $$, el, timeAgo, fmtWhen };
