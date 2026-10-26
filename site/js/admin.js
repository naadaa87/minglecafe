/* ============================================================
   밍글 관리자 화면
   - 로그인: /api/admin/login (PIN) — 기존 방식 그대로
   - 기존 기능: /api/admin/*  (매장 상태, 모임 검수, 신고, 문의 목록)
   - 홈페이지 관리: /api/cms/* (소식, 배너, 메뉴, 검색 노출, 사이트 정보, 기록)
   ============================================================ */
import { mdToHtml } from "/js/md.js?v=20261026";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: opts.body ? { "Content-Type": "application/json" } : {},
    ...opts,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401 && !url.includes("/login") && !url.includes("/session")) {
    toast("로그인이 끝났어요. 다시 들어가 주세요.", true);
    setTimeout(() => location.reload(), 1200);
  }
  return { ok: res.ok, status: res.status, data };
};
const post = (url, body) => api(url, { method: "POST", body: JSON.stringify(body || {}) });

const kst = (ts, withTime = true) => {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  const s = `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  return withTime ? `${s} ${p(d.getHours())}:${p(d.getMinutes())}` : s;
};
const ago = (ts) => {
  if (!ts) return "기록 없음";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return m + "분 전";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "시간 전";
  return Math.floor(h / 24) + "일 전";
};

let toastTimer;
function toast(msg, err = false) {
  const t = $("[data-toast]");
  t.textContent = msg;
  t.className = "adm-toast show" + (err ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = "adm-toast" + (err ? " err" : ""); }, 2600);
}

function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; if (label) btn.textContent = label; }
  else { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }
}

const COVERS = [
  ["store-exterior", "외관"], ["store-kiosk", "키오스크"], ["store-fridge", "냉장 진열"], ["store-shelf", "상온 선반"],
  ["store-seat", "좌석"], ["store-night", "야간 창가"], ["store-package", "포장"], ["drink", "음료"],
  ["packaging", "패키지"], ["showcase", "쇼케이스"], ["brand-set", "브랜드"], ["interior-wide", "실내"],
];

/* ============================================================
   로그인
   ============================================================ */
const loginBox = $("[data-login]");
const app = $("[data-app]");

$("[data-login-form]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("button[type=submit]", e.target);
  busy(btn, true, "확인 중…");
  const { ok, data } = await post("/api/admin/login", { pin: new FormData(e.target).get("pin") });
  busy(btn, false);
  if (!ok) return say($("[data-login-msg]"), false, data.message || "들어가지 못했어요.");
  start();
});

$$("[data-logout]").forEach((b) => b.addEventListener("click", async () => {
  await post("/api/admin/logout");
  location.reload();
}));

function say(box, ok, text) {
  box.className = ok ? "ok-msg" : "err-msg";
  box.textContent = text;
}

(async function boot() {
  const { data } = await api("/api/admin/session");
  if (data.ok) start();
  else if (data.pinSet === false)
    say($("[data-login-msg]"), false, "관리자 PIN이 아직 등록되지 않았어요. Cloudflare Pages 설정에서 ADMIN_PIN을 Secret으로 넣고 다시 배포해 주세요.");
})();

/* ============================================================
   화면 전환
   ============================================================ */
const TITLES = {
  dash: "오늘 할 일", status: "매장 상태 · 품절", inquiries: "문의 관리", community: "커뮤니티 관리",
  news: "소식 · 공지 글", banner: "상단 공지 배너", menu: "메뉴 · 가격", seo: "검색 노출 (SEO)",
  site: "사이트 정보", log: "활동 기록",
};
const loaders = {};
const loaded = new Set();

function go(view, opts = {}) {
  if (!TITLES[view]) view = "dash";
  $$("[data-view]").forEach((s) => { s.hidden = s.dataset.view !== view; });
  $$("[data-nav] [data-go]").forEach((b) => {
    if (b.dataset.go === view) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $("[data-view-title]").textContent = TITLES[view];
  if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
  window.scrollTo({ top: 0 });
  if (loaders[view] && (opts.reload || !loaded.has(view))) { loaded.add(view); loaders[view](opts); }
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-go]");
  if (!b) return;
  e.preventDefault();
  go(b.dataset.go, { newNews: b.hasAttribute("data-new-news") });
  if (b.hasAttribute("data-new-news")) openEditor(null);
});

/* 하위 탭 */
$$("[data-subtabs]").forEach((tabs) => {
  const section = tabs.closest("[data-view]");
  $$("[data-sub]", tabs).forEach((t) => t.addEventListener("click", () => {
    $$("[data-sub]", tabs).forEach((x) => x.setAttribute("aria-selected", String(x === t)));
    $$("[data-subpanel]", section).forEach((p) => { p.hidden = p.dataset.subpanel !== t.dataset.sub; });
    const fn = loaders[section.dataset.view + ":" + t.dataset.sub];
    if (fn) fn();
  }));
});

/* 글자 수 표시 */
function counter(input, warnMin, warnMax) {
  const out = $(`[data-count-for="${input.id}"]`);
  const upd = () => {
    if (!out) return;
    const n = input.value.length;
    out.textContent = `${n}자`;
    out.className = "cnt" + ((warnMin && n && n < warnMin) || (warnMax && n > warnMax) ? " cnt--warn" : "");
  };
  input.addEventListener("input", upd);
  upd();
  return upd;
}

async function start() {
  loginBox.hidden = true;
  app.hidden = false;
  const first = location.hash.slice(1);
  go(TITLES[first] ? first : "dash");
}

/* ============================================================
   오늘 할 일
   ============================================================ */
loaders.dash = async function () {
  const [a, c, l] = await Promise.all([api("/api/admin/overview"), api("/api/cms/overview"), api("/api/cms/log")]);
  const o = a.data || {};
  const x = c.data || {};
  const inq = x.inquiries || {};
  const working = (inq.contacted || 0) + (inq.meeting || 0);

  const kpis = [
    ["새 문의", inq.open ?? o.inquiries ?? 0, "inquiries", (inq.open ?? o.inquiries) > 0],
    ["진행 중 문의", working, "inquiries"],
    ["신고", o.reports ?? 0, "community", o.reports > 0],
    ["모임 검수", o.pendingMeetups ?? 0, "community", o.pendingMeetups > 0],
    ["회원", o.members ?? 0, null],
    ["오늘 체크인", o.checkinsToday ?? 0, null],
    ["게시 중 소식", x.news ? x.news.published : 0, "news"],
    ["밍글보드 글", o.posts ?? 0, "community"],
  ];
  const box = $("[data-kpis]");
  box.innerHTML = "";
  for (const [label, n, to, hot] of kpis) {
    const k = el(to ? "button" : "div", "adm-kpi" + (hot ? " adm-kpi--hot" : ""));
    if (to) k.dataset.go = to;
    k.append(el("b", null, String(n)), el("span", null, label));
    box.append(k);
  }
  $('[data-count="inq"]').textContent = inq.open ? String(inq.open) : "";
  const com = (o.reports || 0) + (o.pendingMeetups || 0);
  $('[data-count="com"]').textContent = com ? String(com) : "";

  /* 할 일 */
  const todo = [];
  const hours = x.statusUpdatedAt ? (Date.now() - x.statusUpdatedAt) / 3600e3 : Infinity;
  if (hours > 12) todo.push(["warn", x.statusUpdatedAt ? `매장 상태를 ${ago(x.statusUpdatedAt)}에 마지막으로 올렸어요.` : "매장 상태를 아직 한 번도 올리지 않았어요.", "손님 화면에는 마지막 확인 시각이 같이 보여요. 12시간이 넘으면 다시 확인해 주세요.", "status", "올리기"]);
  else todo.push(["ok", `매장 상태 ${ago(x.statusUpdatedAt)} 확인`, "", "status", "고치기"]);
  if (inq.open) todo.push(["warn", `답하지 않은 문의 ${inq.open}건`, "보통 1~2 영업일 안에 답한다고 안내하고 있어요.", "inquiries", "보기"]);
  if (o.reports) todo.push(["warn", `처리할 신고 ${o.reports}건`, "", "community", "보기"]);
  if (o.pendingMeetups) todo.push(["warn", `공개를 기다리는 모임 ${o.pendingMeetups}건`, "하루 안에 공개한다고 안내하고 있어요.", "community", "보기"]);
  if (x.banner && x.banner.on) todo.push(["", "상단 공지 배너가 켜져 있어요", x.banner.text || "", "banner", "확인"]);
  if (x.seo && (!x.seo.naver || !x.seo.google)) todo.push(["", "검색엔진 사이트 등록을 마무리해 주세요", `${x.seo.naver ? "" : "네이버 "}${x.seo.google ? "" : "구글 "}확인 코드가 비어 있어요.`, "seo", "등록하기"]);
  if (x.news && x.news.published === 0) todo.push(["", "아직 올린 소식이 없어요", "새 디저트나 모임 소식 하나만 올려도 검색에 잡히는 페이지가 늘어납니다.", "news", "쓰기"]);
  if (o.db === false || x.hasD1 === false) todo.push(["warn", "회원 DB(D1)가 연결되지 않았어요", "회원·모임·신고 기능이 멈춰 있어요. wrangler.toml의 D1 설정을 확인해 주세요.", null, null]);

  const ul = $("[data-todo]");
  ul.innerHTML = "";
  for (const [cls, title, sub, to, label] of todo) {
    const li = el("li", cls);
    li.append(el("span", "dot"));
    const t = el("div");
    t.append(el("b", null, title));
    if (sub) t.append(el("div", "small", sub));
    li.append(t);
    if (to) { const b = el("button", "btn btn--ghost btn--sm", label); b.dataset.go = to; li.append(b); }
    ul.append(li);
  }

  renderLog($("[data-log-mini]"), (l.data.items || []).slice(0, 6));
};

function renderLog(ul, items) {
  ul.innerHTML = "";
  if (!items.length) { ul.append(el("li", "small", "아직 기록이 없어요.")); return; }
  for (const it of items) {
    const li = el("li");
    li.append(el("time", null, kst(it.ts)));
    const d = el("div");
    d.append(el("b", null, it.action));
    if (it.detail) d.append(el("span", null, " · " + it.detail));
    li.append(d);
    ul.append(li);
  }
}

loaders.log = async function () {
  const { data } = await api("/api/cms/log");
  renderLog($("[data-log-full]"), data.items || []);
};

/* ============================================================
   메뉴 데이터 (매장 상태와 메뉴 편집이 함께 씁니다)
   ============================================================ */
let MENU = null;
let MENU_FROM = "default";
async function loadMenu(force) {
  if (MENU && !force) return MENU;
  const { data } = await api("/api/cms/menu");
  if (data.menu) { MENU = data.menu; MENU_FROM = "saved"; }
  else { MENU = JSON.parse(JSON.stringify(window.MINGLE_MENU || { groups: [] })); MENU_FROM = "default"; }
  return MENU;
}

/* ============================================================
   매장 상태
   ============================================================ */
let st = { level: "unknown", note: "", devices: [], soldout: [] };
loaders.status = async function () {
  await loadMenu();
  const { data } = await api("/api/status");
  st = { level: data.level || "unknown", note: data.note || "", devices: data.devices || [], soldout: data.soldout || [] };
  $("[data-status-when]").textContent = data.updatedAt ? `마지막 저장 ${kst(data.updatedAt)} (${ago(data.updatedAt)})` : "아직 저장한 적이 없어요.";

  const box = $("[data-soldout-chips]");
  box.innerHTML = "";
  for (const g of MENU.groups)
    for (const it of g.items) {
      if (it.hidden) continue;
      const b = el("button", "chip", it.ko);
      b.type = "button";
      b.dataset.item = it.id;
      b.addEventListener("click", () => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")));
      box.append(b);
    }
  paintStatus();
};
function paintStatus() {
  $$("[data-level-chips] .chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.level === st.level)));
  $$("[data-device-chips] .chip").forEach((c) => c.setAttribute("aria-pressed", String(st.devices.includes(c.dataset.device))));
  $$("[data-soldout-chips] .chip").forEach((c) => c.setAttribute("aria-pressed", String(st.soldout.includes(c.dataset.item))));
  $("#st-note").value = st.note || "";
}
$$("[data-level-chips] .chip").forEach((c) => c.addEventListener("click", () => { st.level = c.dataset.level; paintStatus(); }));
$$("[data-device-chips] .chip").forEach((c) => c.addEventListener("click", () =>
  c.setAttribute("aria-pressed", String(c.getAttribute("aria-pressed") !== "true"))));
$("[data-status-save]").addEventListener("click", async (e) => {
  const pressed = (sel, key) => $$(sel).filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => c.dataset[key]);
  const body = {
    level: st.level,
    note: $("#st-note").value,
    devices: pressed("[data-device-chips] .chip", "device"),
    soldout: pressed("[data-soldout-chips] .chip", "item"),
  };
  busy(e.target, true, "저장 중…");
  const { ok, data } = await post("/api/admin/status", body);
  busy(e.target, false);
  if (!ok) return toast(data.message || "저장하지 못했어요.", true);
  st = { ...st, ...body };
  $("[data-status-when]").textContent = `마지막 저장 ${kst(Date.now())} (방금)`;
  toast("저장했어요. 손님 화면에 바로 보입니다.");
  loaded.delete("dash");
});

/* ============================================================
   문의 관리
   ============================================================ */
const INQ_ST = { open: "새 문의", contacted: "연락함", meeting: "미팅", done: "완료", dropped: "보류" };
const KIND = { startup: "창업", partner: "제휴", space: "공간 제안" };
let inqItems = [];
let inqFilter = "active";
let inqKind = "all";

loaders.inquiries = async function () {
  const { data } = await api("/api/admin/inquiries");
  inqItems = (data.items || []).map((i) => ({ ...i, state: i.state && INQ_ST[i.state] ? i.state : i.done ? "done" : "open" }));
  renderInq();
};
function renderInq() {
  const counts = { active: 0, all: inqItems.length };
  for (const k of Object.keys(INQ_ST)) counts[k] = 0;
  for (const i of inqItems) { counts[i.state]++; if (!["done", "dropped"].includes(i.state)) counts.active++; }

  const fbox = $("[data-inq-filter]");
  fbox.innerHTML = "";
  for (const [k, label] of [["active", "처리 중"], ["open", "새 문의"], ["contacted", "연락함"], ["meeting", "미팅"], ["done", "완료"], ["dropped", "보류"], ["all", "전체"]]) {
    const b = el("button", "chip", `${label} ${counts[k] || 0}`);
    b.setAttribute("aria-pressed", String(inqFilter === k));
    b.addEventListener("click", () => { inqFilter = k; renderInq(); });
    fbox.append(b);
  }
  const kbox = $("[data-inq-kind]");
  kbox.innerHTML = "";
  for (const [k, label] of [["all", "모든 유형"], ["startup", "창업"], ["partner", "제휴"], ["space", "공간 제안"]]) {
    const b = el("button", "chip", label);
    b.setAttribute("aria-pressed", String(inqKind === k));
    b.addEventListener("click", () => { inqKind = k; renderInq(); });
    kbox.append(b);
  }

  const list = $("[data-inq-list]");
  list.innerHTML = "";
  const items = inqItems.filter((i) =>
    (inqFilter === "all" || (inqFilter === "active" ? !["done", "dropped"].includes(i.state) : i.state === inqFilter)) &&
    (inqKind === "all" || i.kind === inqKind));
  if (!items.length) return list.append(el("div", "adm-empty", "해당하는 문의가 없어요."));

  for (const i of items) {
    const card = el("article", "adm-item" + (["done", "dropped"].includes(i.state) ? " adm-item--muted" : ""));
    const top = el("div", "adm-item__top");
    top.append(el("span", "st st--" + i.state, INQ_ST[i.state]), el("span", "badge badge--navy", KIND[i.kind] || i.kind));
    if (i.ptype) top.append(el("span", "badge", i.ptype));
    top.append(el("b", null, i.name || "(이름 없음)"));
    card.append(top);

    const meta = el("div", "adm-item__meta");
    const contact = String(i.contact || "");
    const a = el("a", null, contact);
    if (/@/.test(contact)) a.href = "mailto:" + contact;
    else if (/\d{2,}/.test(contact)) a.href = "tel:" + contact.replace(/[^\d+]/g, "");
    meta.append(a);
    if (i.region) meta.append(el("span", null, i.region));
    meta.append(el("span", null, "접수 " + kst(i.ts)));
    if (i.marketing) meta.append(el("span", null, "소식 수신 동의"));
    card.append(meta, el("div", "adm-item__body", i.message || ""));

    const memo = el("textarea", "adm-input");
    memo.rows = 2;
    memo.placeholder = "메모 (손님에게 보이지 않아요) — 통화 내용, 다음 연락 날짜 등";
    memo.value = i.memo || "";
    memo.style.marginTop = "4px";

    const acts = el("div", "adm-item__acts");
    const sel = el("select", "adm-input");
    sel.style.width = "auto";
    for (const [k, v] of Object.entries(INQ_ST)) {
      const o = el("option", null, v); o.value = k; if (k === i.state) o.selected = true; sel.append(o);
    }
    const save = el("button", "btn btn--primary btn--sm", "저장");
    save.addEventListener("click", async () => {
      busy(save, true, "저장 중…");
      const { ok, data } = await post("/api/cms/inquiries/update", { id: i.id, state: sel.value, memo: memo.value });
      busy(save, false);
      if (!ok) return toast(data.message || "저장하지 못했어요.", true);
      Object.assign(i, { state: sel.value, memo: memo.value });
      toast("문의 상태를 저장했어요.");
      loaded.delete("dash");
      renderInq();
    });
    acts.append(sel, save);
    card.append(memo, acts);
    list.append(card);
  }
}

/* ============================================================
   커뮤니티
   ============================================================ */
loaders.community = async function () { loaders["community:meetups"](); };

loaders["community:meetups"] = async function () {
  const box = $("[data-meetups]");
  const { data } = await api("/api/admin/meetups");
  box.innerHTML = "";
  const items = data.items || [];
  if (!items.length) return box.append(el("div", "adm-empty", "검수할 모임이 없어요."));
  for (const m of items) {
    const c = el("article", "adm-item");
    const top = el("div", "adm-item__top");
    top.append(el("span", "st " + (m.status === "pending" ? "st--open" : "st--published"), m.status === "pending" ? "검수 대기" : "공개 중"));
    top.append(el("b", null, m.title));
    c.append(top);
    c.append(el("div", "adm-item__meta", `호스트 ${m.host_nick} · ${m.starts_at ? kst(m.starts_at) : "날짜 조율 중"} · 정원 ${m.capacity} · ${m.lang === "en" ? "한국어+영어" : "한국어"}`));
    if (m.goal) c.append(el("div", "adm-item__body", m.goal));
    if (m.detail) c.append(el("div", "adm-item__body small", m.detail));
    const acts = el("div", "adm-item__acts");
    const mk = (label, state) => {
      const b = el("button", "chip", label);
      b.addEventListener("click", async () => {
        if (state === "blocked" && !confirm("이 모임을 비공개로 돌릴까요?")) return;
        b.disabled = true;
        const { ok } = await post("/api/admin/meetups/set", { id: m.id, state });
        toast(ok ? "처리했어요." : "처리하지 못했어요.", !ok);
        loaded.delete("dash");
        loaders["community:meetups"]();
      });
      return b;
    };
    if (m.status === "pending") acts.append(mk("공개하기", "open"));
    acts.append(mk("마감", "closed"), mk("끝남", "done"), mk("비공개", "blocked"));
    c.append(acts);
    box.append(c);
  }
};

loaders["community:reports"] = async function () {
  const box = $("[data-reports]");
  const { data } = await api("/api/admin/reports");
  box.innerHTML = "";
  const items = data.items || [];
  if (!items.length) return box.append(el("div", "adm-empty", "새 신고가 없어요."));
  const TYPE = { post: "게시글", comment: "댓글", meetup: "모임", user: "회원" };
  for (const r of items) {
    const c = el("article", "adm-item");
    const top = el("div", "adm-item__top");
    top.append(el("span", "st st--open", r.reason), el("span", "badge badge--navy", TYPE[r.target_type] || r.target_type));
    c.append(top, el("div", "adm-item__meta", "접수 " + kst(r.created_at)));
    if (r.detail) c.append(el("div", "adm-item__body", r.detail));
    const acts = el("div", "adm-item__acts");
    if (r.target_type === "post") {
      const hide = el("button", "chip", "해당 글 숨기기");
      hide.addEventListener("click", async () => {
        hide.disabled = true;
        const { ok } = await post("/api/cms/posts/set", { id: r.target_id, hidden: true });
        hide.textContent = ok ? "숨김 완료" : "숨기지 못함";
      });
      acts.append(hide);
    }
    const done = el("button", "chip", "처리 완료");
    done.addEventListener("click", async () => {
      done.disabled = true;
      await post("/api/admin/reports/done", { id: r.id });
      toast("신고를 처리 완료로 바꿨어요.");
      loaded.delete("dash");
      loaders["community:reports"]();
    });
    acts.append(done);
    c.append(acts);
    box.append(c);
  }
};

loaders["community:posts"] = async function () {
  const box = $("[data-posts]");
  const { data } = await api("/api/cms/posts");
  box.innerHTML = "";
  const items = data.items || [];
  if (!items.length) return box.append(el("div", "adm-empty", "아직 글이 없어요."));
  for (const p of items) {
    const c = el("article", "adm-item" + (p.hidden ? " adm-item--muted" : ""));
    const top = el("div", "adm-item__top");
    if (p.hidden) top.append(el("span", "st st--hidden", "숨김"));
    top.append(el("span", "badge badge--navy", p.cat), el("b", null, p.nick));
    if (p.member) top.append(el("span", "badge", "회원"));
    c.append(top, el("div", "adm-item__meta", `${kst(p.ts)} · 저요 ${p.ups} · 댓글 ${p.cmts}`), el("div", "adm-item__body", p.content));
    const acts = el("div", "adm-item__acts");
    const tog = el("button", "chip", p.hidden ? "다시 보이기" : "숨기기");
    tog.addEventListener("click", async () => {
      tog.disabled = true;
      const { ok } = await post("/api/cms/posts/set", { id: p.id, hidden: !p.hidden });
      if (ok) { p.hidden = !p.hidden; toast(p.hidden ? "글을 숨겼어요." : "다시 보이게 했어요."); }
      loaders["community:posts"]();
    });
    const del = el("button", "chip adm-danger", "삭제");
    del.addEventListener("click", async () => {
      if (!confirm("이 글과 댓글을 모두 지울까요? 되돌릴 수 없어요.")) return;
      del.disabled = true;
      const { ok } = await post("/api/cms/posts/delete", { id: p.id });
      toast(ok ? "삭제했어요." : "삭제하지 못했어요.", !ok);
      loaders["community:posts"]();
    });
    acts.append(tog, del);
    c.append(acts);
    box.append(c);
  }
};

/* ============================================================
   소식
   ============================================================ */
const NEWS_CAT = { notice: "공지", menu: "새 메뉴", event: "이벤트·모임", story: "밍글 이야기" };
let newsCover = "";

loaders.news = async function (opts = {}) {
  if (!opts.newNews) showNewsList();
  const box = $("[data-news-list]");
  const { data } = await api("/api/cms/news");
  const items = data.items || [];
  box.innerHTML = "";
  if (!items.length) return box.append(el("div", "adm-empty", "아직 쓴 글이 없어요. 오른쪽 위 '새 글 쓰기'로 시작해 보세요."));
  for (const n of items) {
    const c = el("article", "adm-item");
    const top = el("div", "adm-item__top");
    top.append(el("span", "st st--" + n.status, n.status === "published" ? "게시 중" : "임시 저장"), el("span", "badge", NEWS_CAT[n.category] || "소식"));
    if (n.pinned) top.append(el("span", "badge badge--navy", "고정"));
    top.append(el("b", null, n.title));
    c.append(top);
    c.append(el("div", "adm-item__meta", `${n.publishedAt ? "게시 " + kst(n.publishedAt, false) : "아직 게시 전"} · 고친 날 ${kst(n.updatedAt)} · /news/${n.slug}`));
    if (n.summary) c.append(el("div", "adm-item__body small", n.summary));
    const acts = el("div", "adm-item__acts");
    const edit = el("button", "btn btn--ghost btn--sm", "고치기");
    edit.addEventListener("click", () => openEditor(n.id));
    const view = el("a", "btn btn--ghost btn--sm", n.status === "published" ? "보기" : "미리보기");
    view.href = `/news/${encodeURIComponent(n.slug)}${n.status === "published" ? "" : "?preview=1"}`;
    view.target = "_blank"; view.rel = "noopener";
    acts.append(edit, view);
    c.append(acts);
    box.append(c);
  }
};

function showNewsList() {
  $("[data-news-listbox]").hidden = false;
  $("[data-news-editor]").hidden = true;
}

$("[data-news-new]").addEventListener("click", () => openEditor(null));
$("[data-ed-back]").addEventListener("click", () => { showNewsList(); loaders.news(); });

function buildCovers() {
  const box = $("[data-ed-covers]");
  box.innerHTML = "";
  const none = el("button");
  none.type = "button";
  none.dataset.cover = "";
  none.append(el("span", "none", "없음"));
  box.append(none);
  for (const [k, label] of COVERS) {
    const b = el("button");
    b.type = "button";
    b.dataset.cover = k;
    const img = el("img"); img.src = `/img/${k}.webp`; img.alt = ""; img.loading = "lazy";
    b.append(img, el("span", null, label));
    box.append(b);
  }
  $$("button", box).forEach((b) => b.addEventListener("click", () => { newsCover = b.dataset.cover; paintCovers(); }));
}
function paintCovers() {
  $$("[data-ed-covers] button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cover === newsCover)));
}

const edForm = $("[data-ed-form]");
const F = (n) => edForm.elements.namedItem(n);
const sumCount = counter($("#ed-summary"), 0, 150);

async function openEditor(id) {
  $("[data-news-listbox]").hidden = true;
  $("[data-news-editor]").hidden = false;
  if (!$("[data-ed-covers]").children.length) buildCovers();
  edForm.reset();
  F("nid").value = "";
  newsCover = "store-exterior";
  $("[data-ed-title]").textContent = id ? "글 고치기" : "새 글";
  $("[data-ed-delete]").hidden = !id;
  $("[data-ed-view]").hidden = true;
  $("[data-ed-preview]").hidden = true;
  $("[data-md-preview]").setAttribute("aria-pressed", "false");
  $("#ed-body").hidden = false;

  if (id) {
    const { ok, data } = await api("/api/cms/news/one?id=" + encodeURIComponent(id));
    if (!ok) { toast(data.message || "글을 불러오지 못했어요.", true); return showNewsList(); }
    const n = data.item;
    F("nid").value = n.id;
    F("title").value = n.title;
    F("category").value = n.category;
    F("slug").value = n.slug;
    F("summary").value = n.summary || "";
    F("body").value = n.body || "";
    F("pinned").checked = !!n.pinned;
    newsCover = n.cover || "";
    setViewLink(n);
  }
  paintCovers();
  sumCount();
  slugHint();
  window.scrollTo({ top: 0 });
}

function setViewLink(n) {
  const v = $("[data-ed-view]");
  v.hidden = false;
  v.href = `/news/${encodeURIComponent(n.slug)}${n.status === "published" ? "" : "?preview=1"}`;
  v.textContent = n.status === "published" ? "새 탭에서 보기" : "미리보기 (새 탭)";
}

function slugHint() {
  const v = F("slug").value.trim();
  $("[data-ed-url]").textContent = v ? `주소: hellomingle.kr/news/${v.toLowerCase().replace(/[^a-z0-9가-힣-]+/g, "-")}` : "비워 두면 날짜로 자동 생성돼요. 영문 소문자와 - 를 추천해요.";
}
F("slug").addEventListener("input", slugHint);

$$("[data-ed-save]").forEach((b) => b.addEventListener("click", async () => {
  const status = b.dataset.edSave;
  const body = {
    id: F("nid").value || undefined,
    title: F("title").value,
    category: F("category").value,
    slug: F("slug").value,
    summary: F("summary").value,
    body: F("body").value,
    cover: newsCover,
    pinned: F("pinned").checked,
    status,
  };
  if (status === "published" && !confirm("게시하면 손님 화면과 검색엔진에 바로 공개돼요. 게시할까요?")) return;
  busy(b, true, "저장 중…");
  const { ok, data } = await post("/api/cms/news/save", body);
  busy(b, false);
  if (!ok) return toast(data.message || "저장하지 못했어요.", true);
  F("nid").value = data.item.id;
  F("slug").value = data.item.slug;
  slugHint();
  $("[data-ed-title]").textContent = "글 고치기";
  $("[data-ed-delete]").hidden = false;
  setViewLink(data.item);
  toast(status === "published" ? "게시했어요. 1분 안에 목록에도 보여요." : "임시 저장했어요.");
  loaded.delete("dash");
}));

$("[data-ed-delete]").addEventListener("click", async () => {
  if (!confirm("이 글을 지울까요? 되돌릴 수 없어요.")) return;
  const { ok } = await post("/api/cms/news/delete", { id: F("nid").value });
  toast(ok ? "삭제했어요." : "삭제하지 못했어요.", !ok);
  showNewsList();
  loaders.news();
});

/* 마크다운 도우미 */
function wrapSel(ta, before, after = "", placeholder = "") {
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e) || placeholder;
  ta.setRangeText(before + sel + after, s, e, "end");
  ta.focus();
}
$$("[data-md]").forEach((b) => b.addEventListener("click", () => {
  const ta = $("#ed-body");
  const atLineStart = (prefix, ph) => {
    const s = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf("\n", s - 1) + 1;
    const needNl = lineStart !== s;
    wrapSel(ta, (needNl ? "\n\n" : "") + prefix, "", ph);
  };
  const t = b.dataset.md;
  if (t === "h2") atLineStart("## ", "소제목");
  if (t === "bold") wrapSel(ta, "**", "**", "강조할 말");
  if (t === "list") atLineStart("- ", "항목");
  if (t === "tip") atLineStart("> ", "손님이 꼭 알아야 할 안내");
  if (t === "link") {
    const url = prompt("연결할 주소를 넣어 주세요. 예: /menu, https://…");
    if (url) wrapSel(ta, "[", `](${url})`, "링크 글자");
  }
}));
$("[data-md-preview]").addEventListener("click", (e) => {
  const on = e.target.getAttribute("aria-pressed") !== "true";
  e.target.setAttribute("aria-pressed", String(on));
  const pv = $("[data-ed-preview]");
  pv.hidden = !on;
  $("#ed-body").hidden = on;
  if (on) pv.innerHTML = mdToHtml($("#ed-body").value).html || '<p class="small">본문이 비어 있어요.</p>';
});

/* ============================================================
   공지 배너
   ============================================================ */
const bnForm = $("[data-banner-form]");
counter($("#bn-text"), 0, 60);

loaders.banner = async function () {
  const { data } = await api("/api/cms/settings");
  const b = data.banner || {};
  bnForm.elements.namedItem("on").checked = !!b.on;
  bnForm.elements.namedItem("text").value = b.text || "";
  bnForm.elements.namedItem("link").value = b.link || "";
  bnForm.elements.namedItem("linkLabel").value = b.linkLabel || "";
  bnForm.elements.namedItem("start").value = b.start || "";
  bnForm.elements.namedItem("end").value = b.end || "";
  $$('input[name="tone"]', bnForm).forEach((r) => { r.checked = r.value === (b.tone || "orange"); });
  $("#bn-text").dispatchEvent(new Event("input"));
  paintBanner();
};
function paintBanner() {
  const tone = (bnForm.querySelector('input[name="tone"]:checked') || {}).value || "orange";
  const box = $("[data-banner-preview]");
  box.innerHTML = "";
  if (!bnForm.elements.namedItem("text").value.trim()) { box.append(el("div", "adm-empty", "문구를 적으면 여기에 보여요.")); return; }
  const bar = el("div", "topbar topbar--" + tone);
  const w = el("div", "wrap");
  const p = el("p", "topbar__txt", bnForm.elements.namedItem("text").value);
  if (bnForm.elements.namedItem("link").value.trim()) { p.append(" "); const a = el("a", "topbar__link", bnForm.elements.namedItem("linkLabel").value || "자세히"); a.href = "#"; p.append(a); }
  w.append(p, el("button", "topbar__x", "×"));
  bar.append(w);
  box.append(bar);
}
bnForm.addEventListener("input", paintBanner);
bnForm.addEventListener("change", paintBanner);
bnForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(bnForm);
  const body = {
    on: bnForm.elements.namedItem("on").checked, text: fd.get("text"), link: fd.get("link"), linkLabel: fd.get("linkLabel"),
    tone: fd.get("tone") || "orange", start: fd.get("start"), end: fd.get("end"),
  };
  if (body.start && body.end && body.start > body.end) return toast("종료일이 시작일보다 빨라요.", true);
  const btn = $("button[type=submit]", bnForm);
  busy(btn, true, "저장 중…");
  const { ok, data } = await post("/api/cms/banner", body);
  busy(btn, false);
  if (!ok) return toast(data.message || "저장하지 못했어요.", true);
  toast(body.on ? "배너를 켰어요. 1분 안에 모든 페이지에 보여요." : "배너를 껐어요.");
  loaded.delete("dash");
});

/* ============================================================
   메뉴 · 가격
   ============================================================ */
loaders.menu = async function () {
  await loadMenu(true);
  renderMenuEditor();
};

function renderMenuEditor() {
  $("[data-menu-src]").textContent = MENU_FROM === "saved" ? "관리자 저장본 사용 중" : "기본 메뉴 사용 중";
  $("#mn-note").value = MENU.note || "";
  const root = $("[data-menu-groups]");
  root.innerHTML = "";
  MENU.groups.forEach((g, gi) => {
    const box = el("div", "mn-group");
    const head = el("div", "mn-group__head");
    const ko = el("input", "adm-input"); ko.value = g.ko || ""; ko.placeholder = "분류 이름 (예: 커피)";
    ko.addEventListener("input", () => { g.ko = ko.value; });
    const en = el("input", "adm-input"); en.value = g.en || ""; en.placeholder = "영문 (예: Coffee)";
    en.addEventListener("input", () => { g.en = en.value; });
    const tools = el("div", "mn-tools");
    tools.append(
      tool("↑", "분류 위로", () => move(MENU.groups, gi, -1)),
      tool("↓", "분류 아래로", () => move(MENU.groups, gi, 1)),
      tool("✕", "분류 삭제", () => {
        if (!confirm(`'${g.ko}' 분류와 안의 메뉴를 모두 지울까요?`)) return;
        MENU.groups.splice(gi, 1); renderMenuEditor();
      }),
    );
    head.append(ko, en, tools);
    const desc = el("input", "adm-input mn-group__desc"); desc.value = g.desc || ""; desc.placeholder = "분류 설명 한 줄 (선택)";
    desc.addEventListener("input", () => { g.desc = desc.value; });
    box.append(head, desc);

    const items = el("div", "mn-items");
    (g.items || []).forEach((it, ii) => {
      const row = el("div", "mn-item");
      row.dataset.hidden = it.hidden ? "1" : "0";
      const n = el("input", "adm-input"); n.value = it.ko || ""; n.placeholder = "메뉴 이름";
      n.addEventListener("input", () => { it.ko = n.value; });
      const e = el("input", "adm-input"); e.value = it.en || ""; e.placeholder = "영문 이름";
      e.addEventListener("input", () => { it.en = e.value; });
      const pw = el("div", "mn-price");
      const p = el("input", "adm-input"); p.inputMode = "numeric"; p.placeholder = "가격";
      p.value = it.price ? Number(it.price).toLocaleString("ko-KR") : "";
      p.addEventListener("input", () => {
        const d = p.value.replace(/[^\d]/g, "");
        it.price = d ? Number(d) : null;
        p.value = d ? Number(d).toLocaleString("ko-KR") : "";
      });
      pw.append(p);
      const flags = el("div", "mn-item__flags");
      flags.append(check("NEW", it.new, (v) => { it.new = v; }), check("숨김", it.hidden, (v) => { it.hidden = v; row.dataset.hidden = v ? "1" : "0"; }));
      const t = el("div", "mn-tools");
      t.append(
        tool("↑", "위로", () => move(g.items, ii, -1)),
        tool("↓", "아래로", () => move(g.items, ii, 1)),
        tool("✕", "메뉴 삭제", () => { if (confirm(`'${it.ko}'를 지울까요?`)) { g.items.splice(ii, 1); renderMenuEditor(); } }),
      );
      row.append(n, e, pw, flags, t);
      items.append(row);
    });
    box.append(items);
    const add = el("button", "btn btn--ghost btn--sm", "+ 메뉴 추가");
    add.style.marginTop = "10px";
    add.addEventListener("click", () => {
      g.items = g.items || [];
      g.items.push({ id: `${g.id || "g"}-${Date.now().toString(36)}`, ko: "", en: "", price: null, img: null, new: false, hidden: false });
      renderMenuEditor();
      const inputs = $$(".mn-group")[gi].querySelectorAll(".mn-item .adm-input");
      if (inputs.length) inputs[inputs.length - 3].focus();
    });
    box.append(add);
    root.append(box);
  });
}
function tool(label, title, fn) {
  const b = el("button", null, label);
  b.type = "button"; b.title = title; b.setAttribute("aria-label", title);
  b.addEventListener("click", fn);
  return b;
}
function check(label, on, fn) {
  const l = el("label");
  const c = el("input"); c.type = "checkbox"; c.checked = !!on;
  c.addEventListener("change", () => fn(c.checked));
  l.append(c, document.createTextNode(label));
  return l;
}
function move(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  renderMenuEditor();
}
$("#mn-note").addEventListener("input", (e) => { MENU.note = e.target.value; });
$("[data-menu-addgroup]").addEventListener("click", () => {
  MENU.groups.push({ id: "g" + Date.now().toString(36), ko: "", en: "", desc: "", items: [] });
  renderMenuEditor();
  const heads = $$(".mn-group .mn-group__head .adm-input");
  if (heads.length) heads[heads.length - 2].focus();
});
$("[data-menu-save]").addEventListener("click", async (e) => {
  const empty = MENU.groups.some((g) => !String(g.ko || "").trim() || (g.items || []).some((it) => !String(it.ko || "").trim()));
  if (empty && !confirm("이름이 빈 분류나 메뉴가 있어요. 그대로 저장할까요? (빈 이름은 '이름 없는 메뉴'로 저장돼요)")) return;
  busy(e.target, true, "저장 중…");
  const { ok, data } = await post("/api/cms/menu", { menu: MENU });
  busy(e.target, false);
  if (!ok) return toast(data.message || "저장하지 못했어요.", true);
  MENU = data.menu; MENU_FROM = "saved";
  renderMenuEditor();
  toast("메뉴를 저장했어요. 1분 안에 메뉴 페이지에 반영돼요.");
});
$("[data-menu-reset]").addEventListener("click", async () => {
  if (!confirm("저장한 메뉴를 지우고 처음 메뉴(menu-data.js)로 되돌릴까요?")) return;
  const { ok } = await post("/api/cms/menu", { reset: true });
  if (!ok) return toast("되돌리지 못했어요.", true);
  MENU = null;
  await loadMenu(true);
  renderMenuEditor();
  toast("기본 메뉴로 되돌렸어요.");
});

/* ============================================================
   검색 노출
   ============================================================ */
let SETTINGS = null;
const ORIGIN = location.origin.includes("localhost") || location.origin.includes("127.0.0.1") ? location.origin : "https://hellomingle.kr";

loaders.seo = async function () {
  const { data } = await api("/api/cms/settings");
  SETTINGS = data;
  const f = $("[data-verify-form]");
  f.naverVerification.value = data.seo.naverVerification || "";
  f.googleVerification.value = data.seo.googleVerification || "";
  f.bingVerification.value = data.seo.bingVerification || "";

  const list = $("[data-copylist]");
  list.innerHTML = "";
  for (const [label, path] of [["사이트맵", "/sitemap.xml"], ["소식 사이트맵", "/news/sitemap.xml"], ["가이드 RSS", "/rss.xml"], ["소식 RSS", "/news/rss.xml"]]) {
    const row = el("div", "adm-copy");
    const url = "https://hellomingle.kr" + path;
    const btn = el("button", "btn btn--ghost btn--sm", "복사");
    btn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(url); toast("복사했어요."); } catch { prompt("아래 주소를 복사하세요", url); }
    });
    const a = el("a", null, "열기"); a.href = path; a.target = "_blank"; a.rel = "noopener"; a.className = "small";
    row.append(el("span", null, label), el("code", null, url), a, btn);
    list.append(row);
  }
};

$("[data-verify-form]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    naverVerification: f.naverVerification.value,
    googleVerification: f.googleVerification.value,
    bingVerification: f.bingVerification.value,
    pages: (SETTINGS && SETTINGS.seo.pages) || {},
  };
  const btn = $("button[type=submit]", f);
  busy(btn, true, "저장 중…");
  const { ok, data } = await post("/api/cms/seo", body);
  busy(btn, false);
  if (!ok) return toast(data.message || "저장하지 못했어요.", true);
  SETTINGS.seo = data.seo;
  f.naverVerification.value = data.seo.naverVerification;
  f.googleVerification.value = data.seo.googleVerification;
  f.bingVerification.value = data.seo.bingVerification;
  toast("저장했어요. 1분 뒤에 각 사이트에서 '소유 확인'을 눌러 주세요.");
  loaded.delete("dash");
});

/* 사이트맵 읽기 */
async function sitemapUrls() {
  const paths = [];
  for (const sm of ["/sitemap.xml", "/news/sitemap.xml"]) {
    try {
      const r = await fetch(sm, { cache: "no-store" });
      if (!r.ok) continue;
      const doc = new DOMParser().parseFromString(await r.text(), "application/xml");
      $$("loc", doc).forEach((l) => {
        try { paths.push(new URL(l.textContent.trim()).pathname); } catch {}
      });
    } catch {}
  }
  return [...new Set(paths)];
}

async function readPage(path) {
  const r = await fetch(path, { cache: "no-store" });
  const html = await r.text();
  return { status: r.status, doc: new DOMParser().parseFromString(html, "text/html") };
}

const norm = (p) => {
  let s = p.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
  if (s.length > 1 && s.endsWith("/") && !/^\/(en|guide|news)\/$/.test(s)) s = s.slice(0, -1);
  return s || "/";
};

loaders["seo:pages"] = async function () {
  if (!SETTINGS) await loaders.seo();
  const box = $("[data-seo-pages]");
  box.innerHTML = "";
  box.append(el("p", "small", "페이지를 읽는 중…"));
  const paths = (await sitemapUrls()).filter((p) => !p.startsWith("/legal/"));
  const rows = [];
  box.innerHTML = "";
  for (const p of paths) {
    const key = norm(p);
    const ov = (SETTINGS.seo.pages || {})[key] || {};
    const row = el("div", "seo-row");
    row.dataset.path = key;
    const head = el("div", "seo-row__path");
    const a = el("a", null, key); a.href = p; a.target = "_blank"; a.rel = "noopener";
    head.append(a);
    if (ov.title || ov.description) head.append(el("span", "badge", "바꾼 문구 사용 중"));
    const now = el("div", "seo-now", "원래 문구 읽는 중…");
    const t = el("input", "adm-input"); t.placeholder = "검색 제목 (비우면 원래 제목)"; t.maxLength = 70; t.value = ov.title || ""; t.dataset.k = "title";
    const tc = el("span", "cnt");
    const d = el("textarea", "adm-input"); d.rows = 2; d.placeholder = "검색 설명 (비우면 원래 설명)"; d.maxLength = 200; d.value = ov.description || ""; d.dataset.k = "description";
    const dc = el("span", "cnt");
    const serp = el("div", "serp");
    const su = el("div", "serp__url", "hellomingle.kr" + (key === "/" ? "" : key));
    const st = el("div", "serp__t");
    const sd = el("div", "serp__d");
    serp.append(su, st, sd);
    const upd = () => {
      const T = t.value || t.dataset.orig || "";
      const D = d.value || d.dataset.orig || "";
      st.textContent = T; sd.textContent = D;
      tc.textContent = `제목 ${T.length}자`; tc.className = "cnt" + (T.length > 40 || T.length < 8 ? " cnt--warn" : "");
      dc.textContent = `설명 ${D.length}자`; dc.className = "cnt" + (D.length > 155 || D.length < 50 ? " cnt--warn" : "");
    };
    t.addEventListener("input", upd); d.addEventListener("input", upd);
    const counts = el("div", "adm-item__meta"); counts.append(tc, dc);
    row.append(head, now, t, d, counts, serp);
    box.append(row);
    rows.push({ p, row, now, t, d, upd });
  }
  if (!rows.length) box.append(el("div", "adm-empty", "사이트맵을 읽지 못했어요."));
  /* 원래 문구 읽기 (동시에 4개씩) */
  let i = 0;
  const worker = async () => {
    while (i < rows.length) {
      const r = rows[i++];
      try {
        const { doc } = await readPage(r.p);
        const ov = (SETTINGS.seo.pages || {})[r.row.dataset.path] || {};
        // 미들웨어가 바꾼 문구가 들어 있으면 원래 문구는 알 수 없으니, 바꾼 값과 같을 때는 표시만 합니다.
        const T = (doc.querySelector("title") || {}).textContent || "";
        const D = (doc.querySelector('meta[name="description"]') || {}).content || "";
        r.t.dataset.orig = ov.title ? "" : T;
        r.d.dataset.orig = ov.description ? "" : D;
        r.now.innerHTML = "";
        r.now.append(el("b", null, "지금 제목 "), document.createTextNode(T), el("br"), el("b", null, "지금 설명 "), document.createTextNode(D));
        if (!ov.title) r.t.placeholder = T;
        if (!ov.description) r.d.placeholder = D;
      } catch { r.now.textContent = "페이지를 읽지 못했어요."; }
      r.upd();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
};

$("[data-seo-pages-save]").addEventListener("click", async (e) => {
  const pages = {};
  $$("[data-seo-pages] .seo-row").forEach((row) => {
    const t = row.querySelector('[data-k="title"]').value.trim();
    const d = row.querySelector('[data-k="description"]').value.trim();
    if (t || d) pages[row.dataset.path] = { title: t, description: d };
  });
  const body = { ...SETTINGS.seo, pages };
  busy(e.target, true, "저장 중…");
  const { ok, data } = await post("/api/cms/seo", body);
  busy(e.target, false);
  if (!ok) return toast(data.message || "저장하지 못했어요.", true);
  SETTINGS.seo = data.seo;
  toast(`페이지 문구 ${Object.keys(pages).length}건을 저장했어요.`);
});

/* 점검 */
$("[data-audit-run]").addEventListener("click", async (e) => {
  busy(e.target, true, "점검 중…");
  const paths = await sitemapUrls();
  const table = $("[data-audit-table]");
  const tbody = $("tbody", table);
  tbody.innerHTML = "";
  table.hidden = false;
  const sum = { pages: 0, warn: 0, bad: 0 };
  const mark = (cls, text, small) => {
    const td = el("td");
    td.append(el("span", cls, text));
    if (small) td.append(el("small", null, small));
    return td;
  };
  let i = 0;
  const results = [];
  const worker = async () => {
    while (i < paths.length) {
      const p = paths[i++];
      const res = { p };
      try {
        const { status, doc } = await readPage(p);
        res.status = status;
        res.title = (doc.querySelector("title") || {}).textContent || "";
        res.desc = (doc.querySelector('meta[name="description"]') || {}).content || "";
        res.h1 = doc.querySelectorAll("h1").length;
        res.og = !!doc.querySelector('meta[property="og:image"]');
        res.ld = doc.querySelectorAll('script[type="application/ld+json"]').length;
        const imgs = $$("main img", doc);
        res.noAlt = imgs.filter((im) => !im.hasAttribute("alt")).length;
        const main = doc.querySelector("main");
        res.chars = main ? main.textContent.replace(/\s+/g, "").length : 0;
        res.noindex = /noindex/i.test((doc.querySelector('meta[name="robots"]') || {}).content || "");
      } catch { res.error = true; }
      results.push(res);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  results.sort((a, b) => a.p.localeCompare(b.p));
  for (const r of results) {
    sum.pages++;
    const tr = el("tr");
    const tdp = el("td"); const a = el("a", null, r.p); a.href = r.p; a.target = "_blank"; a.rel = "noopener"; tdp.append(a);
    if (r.status && r.status !== 200) tdp.append(el("small", null, "응답 " + r.status));
    if (r.noindex) tdp.append(el("small", null, "검색 제외(noindex)"));
    tr.append(tdp);
    if (r.error) { tr.append(mark("bad", "읽기 실패")); tbody.append(tr); sum.bad++; continue; }
    const tl = r.title.length, dl = r.desc.length;
    const tcls = tl >= 8 && tl <= 45 ? "ok" : tl ? "meh" : "bad";
    const dcls = dl >= 50 && dl <= 160 ? "ok" : dl ? "meh" : "bad";
    const hcls = r.h1 === 1 ? "ok" : r.h1 ? "meh" : "bad";
    const ccls = r.chars >= 600 ? "ok" : r.chars >= 250 ? "meh" : "bad";
    tr.append(
      mark(tcls, tl + "자", r.title.slice(0, 40)),
      mark(dcls, dl + "자"),
      mark(hcls, r.h1 + "개"),
      mark(r.og ? "ok" : "bad", r.og ? "있음" : "없음"),
      mark(r.ld ? "ok" : "meh", r.ld ? r.ld + "개" : "없음"),
      mark(r.noAlt ? "bad" : "ok", r.noAlt ? r.noAlt + "개 빠짐" : "모두 있음"),
      mark(ccls, r.chars.toLocaleString() + "자"),
    );
    const cls = [tcls, dcls, hcls, ccls, r.og ? "ok" : "bad", r.noAlt ? "bad" : "ok"];
    if (cls.includes("bad")) sum.bad++; else if (cls.includes("meh")) sum.warn++;
    tbody.append(tr);
  }
  const s = $("[data-audit-summary]");
  s.innerHTML = "";
  const box = el("div", "audit-sum");
  const item = (n, label) => { const d = el("div"); d.append(el("b", null, String(n)), document.createTextNode(label)); return d; };
  box.append(item(sum.pages, "페이지"), item(sum.pages - sum.warn - sum.bad, "문제 없음"), item(sum.warn, "확인 권장"), item(sum.bad, "고칠 것"));
  s.append(box);
  s.append(el("p", "small", "제목 8~45자, 설명 50~160자, H1 1개, 본문 600자 이상을 기준으로 봤어요. 주황은 꼭 고치지 않아도 되는 항목이에요."));
  busy(e.target, false);
});

/* ============================================================
   사이트 정보
   ============================================================ */
loaders.site = async function () {
  const { data } = await api("/api/cms/settings");
  SETTINGS = data;
  const f = $("[data-site-form]");
  for (const k of ["kakaoChannel", "supportEmail", "instagram", "naverPlace", "naverBlog", "youtube"]) f[k].value = data.site[k] || "";
};
$("[data-site-form]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {};
  for (const k of ["kakaoChannel", "supportEmail", "instagram", "naverPlace", "naverBlog", "youtube"]) body[k] = f[k].value.trim();
  for (const k of ["kakaoChannel", "instagram", "naverPlace", "naverBlog", "youtube"])
    if (body[k] && !/^https?:\/\//i.test(body[k])) return toast("주소는 http:// 또는 https:// 로 시작해야 해요.", true);
  const btn = $("button[type=submit]", f);
  busy(btn, true, "저장 중…");
  const { ok, data } = await post("/api/cms/site", body);
  busy(btn, false);
  if (!ok) return toast(data.message || "저장하지 못했어요.", true);
  toast("저장했어요. 1분 안에 모든 페이지에 반영돼요.");
});

window.addEventListener("hashchange", () => { if (!app.hidden) go(location.hash.slice(1)); });
