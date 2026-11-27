/* ============================================================
   밍글 사이트 검색 — /search 페이지
   빌드가 만든 /search-index.json 을 읽어 브라우저 안에서 찾습니다. (서버로 검색어를 보내 저장하는 건 통계용 한 줄뿐)
   ============================================================ */
(function () {
  "use strict";
  var input = document.getElementById("q");
  var list = document.querySelector("[data-search-results]");
  var status = document.querySelector("[data-search-status]");
  var empty = document.querySelector("[data-search-empty]");
  var hot = document.querySelector("[data-search-hot]");
  if (!input || !list) return;

  var KIND = { guide: "가이드", faq: "자주 묻는 질문", term: "용어 사전", page: "페이지" };
  var index = null;
  var lastSent = "";

  function norm(s) { return String(s || "").toLowerCase().replace(/[\s·,.\-_/()?!'"“”‘’~:;|]+/g, " ").trim(); }
  function squash(s) { return norm(s).replace(/ /g, ""); }
  function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function prepare(items) {
    return items.map(function (it) {
      return { it: it, t: squash(it.t), k: squash(it.k), d: squash(it.d), x: squash(it.x) };
    });
  }

  function search(q) {
    var words = norm(q).split(" ").filter(Boolean);
    var whole = squash(q);
    if (!whole) return [];
    var out = [];
    index.forEach(function (row) {
      var score = 0, matched = 0;
      if (row.t.indexOf(whole) >= 0) score += 30;
      if (row.k.indexOf(whole) >= 0) score += 14;
      words.forEach(function (w) {
        var hit = 0;
        if (row.t.indexOf(w) >= 0) hit += 10;
        if (row.k.indexOf(w) >= 0) hit += 6;
        if (row.d.indexOf(w) >= 0) hit += 3;
        if (row.x.indexOf(w) >= 0) hit += 1;
        if (hit) matched++;
        score += hit;
      });
      if (!score) return;
      if (matched === words.length) score += 12;       // 모든 낱말이 들어 있으면 위로
      if (row.it.c === "guide" && row.it.l && row.it.l !== "ko" && !/[a-z]/.test(whole)) score -= 4;
      out.push({ it: row.it, score: score, all: matched === words.length });
    });
    var strict = out.filter(function (r) { return r.all; });
    return (strict.length ? strict : out).sort(function (a, b) { return b.score - a.score; }).slice(0, 30);
  }

  function mark(text, q) {
    var safe = esc(text);
    norm(q).split(" ").filter(function (w) { return w.length > 1; }).forEach(function (w) {
      var re = new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
      safe = safe.replace(re, "<mark>$1</mark>");
    });
    return safe;
  }

  function render(q) {
    q = String(q || "").trim();
    if (!q) {
      list.innerHTML = "";
      status.textContent = "";
      if (empty) empty.hidden = true;
      if (hot) hot.hidden = false;
      return;
    }
    var res = search(q);
    status.textContent = res.length ? "‘" + q + "’ 검색 결과 " + res.length + "개" : "‘" + q + "’에 맞는 내용을 찾지 못했어요. 낱말을 줄이거나 다른 말로 찾아보세요.";
    list.innerHTML = res.map(function (r) {
      var it = r.it;
      return '<li><a href="' + esc(it.u) + '"><span class="sr__meta"><span class="badge' + (it.c === "guide" ? "" : " badge--navy") + '">' + KIND[it.c] + "</span></span>" +
        '<span class="sr__t">' + mark(it.t, q) + "</span>" +
        (it.d ? '<span class="sr__d">' + mark(it.d, q) + "</span>" : "") + "</a></li>";
    }).join("");
    if (empty) empty.hidden = res.length > 0;
    if (hot) hot.hidden = res.length > 0;

    /* 어떤 말을 찾는지 통계에 남깁니다 (누가 찾았는지는 남기지 않아요) */
    var key = q.toLowerCase();
    if (key !== lastSent && window.MINGLE_TRACK && q.length <= 40) {
      lastSent = key;
      window.MINGLE_TRACK.search(q, res.length);
    }
  }

  function setUrl(q) {
    try {
      var u = new URL(location.href);
      if (q) u.searchParams.set("q", q); else u.searchParams.delete("q");
      history.replaceState(null, "", u.pathname + u.search);
    } catch (e) {}
  }

  var initial = "";
  try { initial = new URL(location.href).searchParams.get("q") || ""; } catch (e) {}
  input.value = initial;

  var form = input.form;
  if (form) form.addEventListener("submit", function (e) {
    e.preventDefault();
    setUrl(input.value.trim());
    if (index) render(input.value);
    input.blur();
  });
  if (hot) hot.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a") : null;
    if (!a || !index) return;
    e.preventDefault();
    input.value = a.textContent;
    setUrl(input.value);
    render(input.value);
  });

  status.textContent = initial ? "찾는 중…" : "";
  fetch("/search-index.json", { credentials: "omit" })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      index = prepare(data.items || []);
      render(input.value);
      if (!initial) input.focus();
    })
    .catch(function () {
      status.textContent = "검색 목록을 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.";
    });
})();
