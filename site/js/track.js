/* ============================================================
   밍글 방문 통계 (관리자 > KPI 에서 봅니다)
   - 쿠키를 쓰지 않습니다. 이 브라우저용 무작위 번호만 저장합니다.
   - 이름·연락처·IP 같은 개인정보는 보내지 않습니다.
   - "추적 안 함(Do Not Track)"이나 GPC를 켠 브라우저는 집계하지 않습니다.
   - 관리자 화면에 한 번 로그인한 브라우저는 집계에서 빠집니다.
   ============================================================ */
(function () {
  "use strict";
  try {
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl) return;
    if (navigator.webdriver) return;
    if (/^\/(admin|api)(\/|$)/.test(location.pathname)) return;
  } catch (e) { return; }

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  if (store.get("mg_notrack") === "1") return;

  function rid() {
    try {
      var a = new Uint8Array(10);
      crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    } catch (e) {
      return (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).slice(0, 20);
    }
  }

  function send(obj) {
    var body = JSON.stringify(obj);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon("/api/t", new Blob([body], { type: "text/plain" }))) return;
    } catch (e) {}
    try {
      fetch("/api/t", { method: "POST", body: body, keepalive: true, credentials: "same-origin", headers: { "Content-Type": "text/plain" } });
    } catch (e) {}
  }

  /* ---------- 방문자 · 방문(세션) ---------- */
  var now = Date.now();
  var vid = store.get("mg_vid");
  var isNew = 0;
  if (!vid) { vid = rid(); store.set("mg_vid", vid); isNew = 1; }

  var sid = store.get("mg_sid");
  var last = Number(store.get("mg_sid_t")) || 0;
  var entry = 0;
  if (!sid || now - last > 30 * 60 * 1000) { sid = rid(); store.set("mg_sid", sid); entry = 1; }
  store.set("mg_sid_t", String(now));

  var pvid = rid();
  var path = location.pathname;

  /* ---------- 페이지 조회 ---------- */
  var ref = document.referrer || "";
  var prev = null;
  try {
    if (ref) {
      var ru = new URL(ref);
      if (ru.host === location.host) { prev = ru.pathname; ref = ""; }
    }
  } catch (e) { ref = ""; }

  var q = new URLSearchParams(location.search);
  var title = (document.title || "").replace(/\s*[|]\s*(밍글|Mingle|MINGLE).*$/, "").trim();

  send({
    t: "pv", id: pvid, vid: vid, sid: sid, n: isNew, e: entry,
    p: path, ti: title, r: entry ? ref : "", pr: prev,
    nf: document.documentElement.getAttribute("data-status") === "404" ? 1 : 0,
    l: (navigator.language || "").slice(0, 12),
    us: entry ? q.get("utm_source") : null,
    um: entry ? q.get("utm_medium") : null,
    uc: entry ? q.get("utm_campaign") : null,
  });

  /* ---------- 실제로 머문 시간 (화면을 보고 있고, 2분 안에 움직임이 있었던 시간만) ---------- */
  var IDLE = 2 * 60 * 1000;
  var engaged = 0;
  var since = document.visibilityState === "visible" ? Date.now() : 0;
  var lastAct = Date.now();
  var maxScroll = 0;
  var sent = { d: -1, s: -1 };

  function tick() {
    if (!since) return;
    var n = Date.now();
    var upto = Math.min(n, lastAct + IDLE);
    if (upto > since) engaged += upto - since;
    since = n;
  }

  function measureScroll() {
    var doc = document.documentElement;
    var h = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
    var seen = (window.scrollY || doc.scrollTop || 0) + window.innerHeight;
    var pct = h > 0 ? Math.min(100, Math.round((seen / h) * 100)) : 100;
    if (pct > maxScroll) maxScroll = pct;
  }

  function flush() {
    tick();
    if (engaged === sent.d && maxScroll === sent.s) return;
    sent = { d: engaged, s: maxScroll };
    send({ t: "end", id: pvid, d: engaged, s: maxScroll });
  }

  function activity() {
    if (document.visibilityState !== "visible") return;
    if (!since) since = Date.now();
    tick();
    lastAct = Date.now();
  }

  var moveAt = 0;
  ["pointerdown", "keydown", "touchstart", "wheel"].forEach(function (ev) {
    window.addEventListener(ev, activity, { passive: true });
  });
  window.addEventListener("mousemove", function () {
    var n = Date.now();
    if (n - moveAt > 5000) { moveAt = n; activity(); }
  }, { passive: true });
  window.addEventListener("scroll", function () { activity(); measureScroll(); }, { passive: true });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { flush(); since = 0; }
    else { since = Date.now(); lastAct = Date.now(); }
  });
  /* 페이지를 떠나는 순간의 전송은 브라우저에 따라 빠질 수 있어서, 여러 시점에 나눠 보냅니다 */
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  setInterval(function () {
    if (document.visibilityState === "visible" && Date.now() - lastAct < IDLE) flush();
  }, 20000);
  setTimeout(flush, 10000);
  window.addEventListener("load", measureScroll);
  setTimeout(measureScroll, 1500);

  /* ---------- 클릭 ---------- */
  var clicks = 0;

  function clean(s, max) {
    return String(s || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function classify(el) {
    var a = el.closest("a");
    var href = "";
    var external = false;
    var host = "";
    if (a && a.getAttribute("href")) {
      try {
        var u = new URL(a.getAttribute("href"), location.href);
        if (u.protocol === "tel:") return { g: "tel", h: "tel" };
        if (u.protocol === "mailto:") return { g: "mail", h: "mailto" };
        host = u.host;
        external = u.host !== location.host;
        href = external ? u.host + u.pathname : u.pathname + (u.hash || "");
      } catch (e) {}
    }
    if (/(^|\.)pf\.kakao\.com$/.test(host) || el.closest(".kakao-fab, .btn--kakao")) return { g: "kakao", h: href };
    if (/(map\.naver\.com|naver\.me|map\.kakao\.com|kko\.to)$/.test(host) || /map\.(naver|kakao)\.com/.test(host)) return { g: "map", h: href };
    if (external) return { g: "outbound", h: href };
    if (el.closest(".topbar")) return { g: "banner", h: href };
    if (el.closest(".tabbar")) return { g: "tabbar", h: href };
    if (el.closest(".site-header, .sheet")) return { g: "nav", h: href };
    if (el.closest(".site-footer")) return { g: "footer", h: href };
    if (el.classList.contains("btn") || el.closest(".btn")) return { g: "cta", h: href };
    if (a) return { g: "link", h: href };
    return { g: "button", h: "" };
  }

  document.addEventListener("click", function (e) {
    try {
      var el = e.target && e.target.closest ? e.target.closest("a, button, [data-track]") : null;
      if (!el || clicks >= 80) return;
      clicks++;
      var c = classify(el);
      /* 사이트 안 다른 페이지로 넘어가기 직전 — 지금까지 머문 시간을 먼저 보냅니다 */
      if (c.g !== "button" && el.closest("a") && !el.closest("a").target) flush();
      var img = el.querySelector && el.querySelector("img[alt]");
      var label = el.getAttribute("data-track") || el.getAttribute("aria-label") || clean(el.textContent, 60) || (img ? img.getAttribute("alt") : "");
      send({ t: "ev", id: pvid, vid: vid, sid: sid, p: path, k: "click", g: c.g, lb: clean(label, 60), h: c.h });
    } catch (err) {}
  }, true);

  /* ---------- 사이트 안 검색 (search.js 가 부릅니다) ---------- */
  var searches = 0;
  window.MINGLE_TRACK = {
    search: function (q, count) {
      try {
        if (searches >= 20) return;
        searches++;
        send({ t: "ev", id: pvid, vid: vid, sid: sid, p: path, k: "search", g: count > 0 ? "hit" : "none", lb: clean(q, 40).toLowerCase(), h: "" });
      } catch (err) {}
    },
  };

  /* ---------- 자주 묻는 질문 펼침 ---------- */
  document.addEventListener("toggle", function (e) {
    try {
      var d = e.target;
      if (!d || d.tagName !== "DETAILS" || !d.open || !d.closest(".faq")) return;
      var s = d.querySelector("summary");
      send({ t: "ev", id: pvid, vid: vid, sid: sid, p: path, k: "faq", g: "faq", lb: clean(s ? s.textContent : "", 80), h: "" });
    } catch (err) {}
  }, true);
})();
