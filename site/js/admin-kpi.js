/* ============================================================
   밍글 관리자 — KPI 화면
   admin.js 가 setupKpi()로 불러 씁니다. 데이터는 /api/kpi/* 에서 옵니다.
   차트는 외부 라이브러리 없이 SVG로 그립니다. (사이트 보안 정책상 외부 스크립트 금지)
   ============================================================ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/* ---------- 색 (밝은 바탕 + 오렌지 포인트) ---------- */
const C = {
  accent: "#F46A1F",
  accentWash: "rgba(244,106,31,.10)",
  track: "#FCE3D3",
  muted: "#9AA3B2",
  grid: "#EEF0F3",
  ink: "#17263F",
  ink2: "#5B6578",
  surface: "#FFFFFF",
  heat: ["#F3F4F6", "#FCD9C2", "#F8AE80", "#F46A1F", "#C24E0F", "#7E300A"],
};

/* ---------- 이름표 ---------- */
const L = {
  source: {
    naver_search: "네이버 검색", naver_map: "네이버 지도·플레이스", naver_blog: "네이버 블로그", naver_cafe: "네이버 카페",
    naver: "네이버(기타)", google: "구글", daum: "다음 검색", kakao: "카카오톡·카카오 채널", kakao_map: "카카오맵",
    instagram: "인스타그램", sns: "기타 SNS", search_other: "기타 검색엔진", ai: "AI 검색·챗봇", direct: "직접 방문·북마크",
    qr: "매장 QR", campaign: "캠페인 링크(UTM)", other: "기타 사이트",
  },
  target: {
    kakao: "카카오 문의", map: "길찾기(지도)", tel: "전화", mail: "이메일", outbound: "외부 링크", banner: "상단 공지 배너",
    tabbar: "하단 탭", nav: "상단·전체 메뉴", footer: "푸터 링크", cta: "버튼", link: "본문 링크", button: "기타 버튼",
  },
  section: {
    home: "홈", menu: "메뉴", store: "매장 안내", guide: "가이드", news: "소식", community: "커뮤니티", global: "글로벌",
    pass: "밍글패스", brand: "브랜드", business: "창업·제휴", faq: "자주 묻는 질문", en: "영문 페이지", qr: "매장 QR",
    account: "회원(로그인·가입)", legal: "약관", etc: "기타",
  },
  device: { mobile: "휴대폰", desktop: "컴퓨터", tablet: "태블릿" },
  lang: { ko: "한국어", en: "영어", zh: "중국어", ja: "일본어", vi: "베트남어", th: "태국어", fr: "프랑스어", de: "독일어", es: "스페인어", ru: "러시아어", mn: "몽골어", id: "인도네시아어", "": "알 수 없음" },
  country: { KR: "한국", US: "미국", CN: "중국", JP: "일본", VN: "베트남", TW: "대만", HK: "홍콩", MN: "몽골", TH: "태국", ID: "인도네시아", PH: "필리핀", GB: "영국", FR: "프랑스", DE: "독일", CA: "캐나다", AU: "호주", "": "알 수 없음" },
  provider: { email: "이메일", kakao: "카카오", google: "구글" },
  category: { study: "스터디", project: "프로젝트", cowork: "모각작·코워킹", global: "글로벌·언어교환", hobby: "취미" },
  status: { pending: "검수 대기", open: "공개 중", closed: "마감", done: "끝남", blocked: "비공개" },
  checkin: { entrance: "출입문 QR", kiosk: "키오스크 옆 QR", table: "테이블 QR", event: "이벤트", etc: "기타" },
  qr: { "/go/entrance": "출입문 QR", "/go/kiosk": "키오스크 옆 QR", "/go/table": "테이블 QR", "/go": "QR 안내 페이지" },
};
const lab = (group, key) => (L[group] && L[group][key]) || key || "-";

/* ---------- 숫자 ---------- */
const fmt = {
  n: (v) => Math.round(Number(v) || 0).toLocaleString("ko-KR"),
  pct: (v, d = 1) => (v == null || !isFinite(v) ? "-" : (v * 100).toFixed(d).replace(/\.0$/, "") + "%"),
  dec: (v, d = 1) => (Number(v) || 0).toFixed(d),
  dur: (ms) => {
    const s = Math.round((Number(ms) || 0) / 1000);
    if (s <= 0) return "-";
    if (s < 60) return s + "초";
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}분 ${r}초` : `${m}분`;
  },
  axis: (v) => (v >= 10000 ? (v / 10000).toFixed(v % 10000 ? 1 : 0) + "만" : Math.round(v).toLocaleString("ko-KR")),
  secAxis: (s) => (s >= 120 ? (s / 60).toFixed(s % 60 ? 1 : 0).replace(/\.0$/, "") + "분" : Math.round(s) + "초"),
  day: (d) => (d ? d.slice(5).replace("-", ".") : ""),
  date: (ts) => {
    if (!ts) return "-";
    const d = new Date(Number(ts) + 9 * 3600e3).toISOString();
    return d.slice(2, 10).replace(/-/g, ".");
  },
  datetime: (ts) => {
    if (!ts) return "-";
    const d = new Date(Number(ts) + 9 * 3600e3).toISOString();
    return d.slice(2, 10).replace(/-/g, ".") + " " + d.slice(11, 16);
  },
};

/* ---------- 날짜 (한국 시간) ---------- */
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const shift = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400e3).toISOString().slice(0, 10);
const PRESETS = [
  ["today", "오늘"], ["yesterday", "어제"], ["7d", "최근 7일"], ["30d", "최근 30일"], ["90d", "최근 90일"],
  ["month", "이번 달"], ["lastmonth", "지난달"], ["all", "전체"],
];
function rangeOf(preset, since) {
  const t = kstToday();
  switch (preset) {
    case "today": return [t, t];
    case "yesterday": return [shift(t, -1), shift(t, -1)];
    case "30d": return [shift(t, -29), t];
    case "90d": return [shift(t, -89), t];
    case "month": return [t.slice(0, 8) + "01", t];
    case "lastmonth": {
      const first = t.slice(0, 8) + "01";
      const end = shift(first, -1);
      return [end.slice(0, 8) + "01", end];
    }
    case "all": return [since && since < t ? (since < shift(t, -399) ? shift(t, -399) : since) : shift(t, -29), t];
    default: return [shift(t, -6), t];
  }
}

/* ============================================================
   공통 부품
   ============================================================ */
let tip;
function tooltip() {
  if (!tip) { tip = el("div", "kt-tip"); tip.setAttribute("role", "status"); document.body.append(tip); }
  return tip;
}
function showTip(x, y, title, rows) {
  const t = tooltip();
  t.innerHTML = "";
  if (title) t.append(el("div", "kt-tip__t", title));
  for (const r of rows) {
    const row = el("div", "kt-tip__r");
    if (r.color) { const k = el("i", "kt-tip__k"); k.style.background = r.color; row.append(k); }
    row.append(el("b", null, r.value), el("span", null, r.name || ""));
    t.append(row);
  }
  t.style.display = "block";
  const w = t.offsetWidth, h = t.offsetHeight;
  let left = x + 14, top = y - h - 12;
  if (left + w > window.innerWidth - 8) left = x - w - 14;
  if (left < 8) left = 8;
  if (top < 8) top = y + 16;
  t.style.left = left + "px";
  t.style.top = top + "px";
}
const hideTip = () => { if (tip) tip.style.display = "none"; };

function niceTicks(max, count = 4, integer = true) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  let step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  if (integer && step < 1) step = 1;
  const top = Math.ceil(max / step) * step;
  const out = [];
  for (let v = 0; v <= top + step / 1e6; v += step) out.push(+v.toFixed(6));
  return out;
}

/** 이번 기간과 이전 기간 비교 표시 */
function delta(cur, prev, { goodUp = true, isRate = false } = {}) {
  const box = el("span", "kt__delta");
  if (prev == null || cur == null) { box.textContent = ""; return box; }
  if (!isRate && prev === 0) {
    box.classList.add("kt__delta--flat");
    box.textContent = cur ? "이전 기간 기록 없음" : "변화 없음";
    return box;
  }
  const diff = isRate ? (cur - prev) * 100 : ((cur - prev) / prev) * 100;
  const flat = Math.abs(diff) < 0.5;
  const up = diff > 0;
  const good = flat ? null : up === goodUp;
  box.classList.add(flat ? "kt__delta--flat" : good ? "kt__delta--good" : "kt__delta--bad");
  const arrow = flat ? "–" : up ? "▲" : "▼";
  const val = isRate ? Math.abs(diff).toFixed(1).replace(/\.0$/, "") + "%p" : Math.abs(diff).toFixed(diff > -10 && diff < 10 ? 1 : 0).replace(/\.0$/, "") + "%";
  box.append(el("span", "kt__arrow", arrow), document.createTextNode(flat ? " 비슷함" : " " + val));
  box.title = "이전 같은 기간과 비교";
  return box;
}

/** 지표 카드 */
function tile({ label, value, cur, prev, goodUp = true, isRate = false, hint, go, warn }) {
  const t = el(go ? "button" : "div", "kt" + (warn ? " kt--warn" : ""));
  if (go) { t.type = "button"; t.dataset.go = go; }
  t.append(el("span", "kt__label", label), el("b", "kt__value", value));
  t.append(delta(cur, prev, { goodUp, isRate }));
  if (hint) t.append(el("span", "kt__hint", hint));
  return t;
}

function card(title, sub, opts = {}) {
  const c = el("section", "adm-card kc" + (opts.cls ? " " + opts.cls : ""));
  const head = el("div", "kc__head");
  const titles = el("div", "kc__titles");
  titles.append(el("h2", null, title));
  if (sub) titles.append(el("p", "kc__sub", sub));
  head.append(titles);
  c.append(head);
  return c;
}

function empty(text) { return el("div", "adm-empty", text); }

/** 이름 · 막대 · 숫자 목록 */
function meterList(rows, { max, fmtValue = fmt.n, share, total, empty: emptyText = "아직 기록이 없어요." } = {}) {
  const box = el("div", "ml");
  if (!rows.length) { box.append(empty(emptyText)); return box; }
  const top = max || Math.max(...rows.map((r) => r.value), 1);
  for (const r of rows) {
    const row = el(r.href ? "a" : "div", "ml__row");
    if (r.href) { row.href = r.href; row.target = "_blank"; row.rel = "noopener"; }
    const name = el("span", "ml__name");
    name.append(el("span", "ml__label", r.label));
    if (r.sub) name.append(el("span", "ml__sub", r.sub));
    const v = el("span", "ml__val", fmtValue(r.value));
    if (share && total) v.append(el("small", null, " " + fmt.pct(r.value / total)));
    const bar = el("span", "ml__bar");
    const fill = el("i");
    fill.style.width = Math.max(r.value > 0 ? 1.5 : 0, (r.value / top) * 100) + "%";
    bar.append(fill);
    row.append(name, v, bar);
    row.title = `${r.label}: ${fmtValue(r.value)}`;
    box.append(row);
  }
  return box;
}

/** 정렬되는 표 */
function table(cols, rows, { sortable = true, initial, emptyText = "아직 기록이 없어요.", rowClass } = {}) {
  const wrap = el("div", "kt-tablewrap");
  if (!rows.length) { wrap.append(empty(emptyText)); return wrap; }
  const t = el("table", "kt-table");
  const thead = el("thead");
  const tr = el("tr");
  const tbody = el("tbody");
  let sortKey = initial ? initial[0] : null;
  let sortDir = initial ? initial[1] : -1;
  const draw = () => {
    const list = rows.slice();
    if (sortKey) {
      const col = cols.find((c) => c.key === sortKey);
      const get = col.sort || ((r) => r[sortKey]);
      list.sort((a, b) => {
        const x = get(a), y = get(b);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === "string" ? x.localeCompare(y, "ko") : x - y) * sortDir;
      });
    }
    tbody.innerHTML = "";
    for (const r of list) {
      const row = el("tr");
      if (rowClass) { const rc = rowClass(r); if (rc) row.className = rc; }
      for (const c of cols) {
        const td = el("td", c.num ? "num" : null);
        const v = c.render ? c.render(r) : r[c.key];
        if (v instanceof Node) td.append(v); else td.textContent = v == null ? "-" : String(v);
        row.append(td);
      }
      tbody.append(row);
    }
    $$("th", tr).forEach((th) => {
      th.setAttribute("aria-sort", th.dataset.key === sortKey ? (sortDir > 0 ? "ascending" : "descending") : "none");
    });
  };
  for (const c of cols) {
    const th = el("th", c.num ? "num" : null);
    th.dataset.key = c.key;
    if (sortable && c.key && c.sortable !== false) {
      const b = el("button", "kt-sort", c.label);
      b.type = "button";
      b.addEventListener("click", () => {
        if (sortKey === c.key) sortDir = -sortDir;
        else { sortKey = c.key; sortDir = c.num ? -1 : 1; }
        draw();
      });
      th.append(b);
    } else th.textContent = c.label;
    tr.append(th);
  }
  thead.append(tr);
  t.append(thead, tbody);
  wrap.append(t);
  draw();
  return wrap;
}

/** 페이지 주소 링크 */
function pathLink(path, title) {
  const a = el("a", "kt-path");
  a.href = path;
  a.target = "_blank";
  a.rel = "noopener";
  a.append(el("span", "kt-path__t", title || path));
  if (title && title !== path) a.append(el("span", "kt-path__p", path));
  return a;
}

/* ---------- 선 그래프 (추이) ---------- */
function lineChart(host, { labels, series, yfmt = fmt.axis, vfmt = fmt.n, xfmt = (s) => s, tipTitle }) {
  const render = () => {
    host.innerHTML = "";
    const W = Math.max(280, host.clientWidth || 600);
    const H = W < 500 ? 200 : 240;
    const m = { l: 46, r: 14, t: 14, b: 28 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const n = labels.length;
    const max = Math.max(1, ...series.flatMap((s) => s.values));
    const ticks = niceTicks(max, 4, series.every((s) => s.values.every((v) => Number.isInteger(v))));
    const top = ticks[ticks.length - 1];
    const x = (i) => m.l + (n === 1 ? pw / 2 : (i / (n - 1)) * pw);
    const y = (v) => m.t + ph - (v / top) * ph;

    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": series.map((s) => s.name).join(", ") + " 추이" });
    for (const tv of ticks) {
      svg.append(svgEl("line", { x1: m.l, x2: W - m.r, y1: y(tv), y2: y(tv), stroke: C.grid, "stroke-width": 1 }));
      const tx = svgEl("text", { x: m.l - 8, y: y(tv) + 4, "text-anchor": "end", class: "kt-axis" });
      tx.textContent = yfmt(tv);
      svg.append(tx);
    }
    const every = Math.max(1, Math.ceil(n / (W < 500 ? 4 : 7)));
    labels.forEach((lb, i) => {
      if (i % every !== 0 && i !== n - 1) return;
      if (i !== n - 1 && x(n - 1) - x(i) < 52) return;
      const tx = svgEl("text", { x: x(i), y: H - 8, "text-anchor": i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle", class: "kt-axis" });
      tx.textContent = xfmt(lb);
      svg.append(tx);
    });

    const paths = [...series].reverse();
    for (const s of paths) {
      const pts = s.values.map((v, i) => [x(i), y(v)]);
      if (s.area && n > 1) {
        const d = `M${pts[0][0]},${m.t + ph}` + pts.map((p) => `L${p[0]},${p[1]}`).join("") + `L${pts[pts.length - 1][0]},${m.t + ph}Z`;
        svg.append(svgEl("path", { d, fill: C.accentWash }));
      }
      if (n > 1) svg.append(svgEl("path", { d: "M" + pts.map((p) => p.join(",")).join("L"), fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      if (s.endDot || n === 1) {
        const p = pts[pts.length - 1];
        svg.append(svgEl("circle", { cx: p[0], cy: p[1], r: 4, fill: s.color, stroke: C.surface, "stroke-width": 2 }));
      }
    }

    const cross = svgEl("line", { y1: m.t, y2: m.t + ph, stroke: C.ink2, "stroke-width": 1, opacity: 0 });
    svg.append(cross);
    const dots = series.map((s) => { const d = svgEl("circle", { r: 4, fill: s.color, stroke: C.surface, "stroke-width": 2, opacity: 0 }); svg.append(d); return d; });
    const hit = svgEl("rect", { x: m.l - 10, y: 0, width: pw + 20, height: H, fill: "transparent", tabindex: 0, class: "kt-hit" });
    svg.append(hit);
    let idx = n - 1;
    const show = (i, cx, cy) => {
      idx = Math.max(0, Math.min(n - 1, i));
      cross.setAttribute("x1", x(idx)); cross.setAttribute("x2", x(idx)); cross.setAttribute("opacity", 1);
      series.forEach((s, k) => { dots[k].setAttribute("cx", x(idx)); dots[k].setAttribute("cy", y(s.values[idx])); dots[k].setAttribute("opacity", 1); });
      const r = svg.getBoundingClientRect();
      const px = cx != null ? cx : r.left + (x(idx) / W) * r.width;
      const py = cy != null ? cy : r.top + (y(series[0].values[idx]) / H) * r.height;
      showTip(px, py, tipTitle ? tipTitle(idx) : xfmt(labels[idx]), series.map((s) => ({ color: s.color, value: vfmt(s.values[idx]), name: s.tipName ? s.tipName(idx) : s.name })));
    };
    const hide = () => { cross.setAttribute("opacity", 0); dots.forEach((d) => d.setAttribute("opacity", 0)); hideTip(); };
    hit.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect();
      const sx = ((e.clientX - r.left) / r.width) * W;
      const i = n === 1 ? 0 : Math.round(((sx - m.l) / pw) * (n - 1));
      show(i, e.clientX, e.clientY);
    });
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("focus", () => show(idx));
    hit.addEventListener("blur", hide);
    hit.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { show(idx + 1); e.preventDefault(); }
      if (e.key === "ArrowLeft") { show(idx - 1); e.preventDefault(); }
    });
    host.append(svg);
  };
  host._render = render;
  render();
}

/* ---------- 세로 막대 (가입·체크인 추이) ---------- */
function columnChart(host, { labels, values, name, xfmt = fmt.day, vfmt = fmt.n }) {
  const render = () => {
    host.innerHTML = "";
    const W = Math.max(280, host.clientWidth || 600);
    const H = 200;
    const m = { l: 40, r: 10, t: 12, b: 28 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const n = labels.length;
    const ticks = niceTicks(Math.max(1, ...values), 4, true);
    const top = ticks[ticks.length - 1];
    const band = pw / Math.max(1, n);
    const bw = Math.max(2, Math.min(24, band - 2));
    const y = (v) => m.t + ph - (v / top) * ph;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": name + " 막대 그래프" });
    for (const tv of ticks) {
      svg.append(svgEl("line", { x1: m.l, x2: W - m.r, y1: y(tv), y2: y(tv), stroke: C.grid, "stroke-width": 1 }));
      const tx = svgEl("text", { x: m.l - 8, y: y(tv) + 4, "text-anchor": "end", class: "kt-axis" });
      tx.textContent = fmt.axis(tv);
      svg.append(tx);
    }
    const every = Math.max(1, Math.ceil(n / (W < 500 ? 4 : 7)));
    values.forEach((v, i) => {
      const cx = m.l + band * i + band / 2;
      if (v > 0) {
        const h = Math.max(2, (v / top) * ph);
        const bx = cx - bw / 2, by = m.t + ph - h, r = Math.min(4, bw / 2, h);
        svg.append(svgEl("path", { d: `M${bx},${by + h}V${by + r}Q${bx},${by} ${bx + r},${by}H${bx + bw - r}Q${bx + bw},${by} ${bx + bw},${by + r}V${by + h}Z`, fill: C.accent, class: "kt-bar" }));
      }
      const hit = svgEl("rect", { x: m.l + band * i, y: m.t, width: band, height: ph, fill: "transparent", tabindex: -1 });
      hit.addEventListener("pointermove", (e) => showTip(e.clientX, e.clientY, xfmt(labels[i]), [{ color: C.accent, value: vfmt(v), name }]));
      hit.addEventListener("pointerleave", hideTip);
      svg.append(hit);
      if (i % every === 0 || i === n - 1) {
        if (i !== n - 1 && band * (n - 1 - i) < 52) return;
        const tx = svgEl("text", { x: cx, y: H - 8, "text-anchor": "middle", class: "kt-axis" });
        tx.textContent = xfmt(labels[i]);
        svg.append(tx);
      }
    });
    host.append(svg);
  };
  host._render = render;
  render();
}

/* ---------- 요일 × 시간 ---------- */
function heatmap(host, cells) {
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const order = [1, 2, 3, 4, 5, 6, 0];
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const c of cells) grid[c.dow][c.hour] = Number(c.c) || 0;
  const max = Math.max(0, ...grid.flat());
  const bin = (v) => (v <= 0 || !max ? 0 : Math.min(5, Math.ceil((v / max) * 5)));
  const box = el("div", "hm");
  const head = el("div", "hm__row hm__row--head");
  head.append(el("span", "hm__dow"));
  for (let h = 0; h < 24; h++) head.append(el("span", "hm__h", h % 3 === 0 ? String(h) : ""));
  box.append(head);
  for (const d of order) {
    const row = el("div", "hm__row");
    row.append(el("span", "hm__dow", DOW[d]));
    for (let h = 0; h < 24; h++) {
      const v = grid[d][h];
      const c = el("span", "hm__c");
      c.style.background = C.heat[bin(v)];
      c.dataset.tip = `${DOW[d]}요일 ${h}시`;
      c.dataset.v = v;
      row.append(c);
    }
    box.append(row);
  }
  box.addEventListener("pointermove", (e) => {
    const c = e.target.closest(".hm__c");
    if (!c) return hideTip();
    showTip(e.clientX, e.clientY, c.dataset.tip, [{ color: C.accent, value: fmt.n(c.dataset.v) + "회", name: "페이지 조회" }]);
  });
  box.addEventListener("pointerleave", hideTip);
  const legend = el("div", "hm__legend");
  legend.append(el("span", null, "적음"));
  for (let i = 1; i <= 5; i++) { const s = el("i"); s.style.background = C.heat[i]; legend.append(s); }
  legend.append(el("span", null, "많음"));
  host.innerHTML = "";
  host.append(box, legend);

  /* 가장 붐비는 시간 한 줄 요약 */
  let best = null;
  for (const d of order) for (let h = 0; h < 24; h++) if (!best || grid[d][h] > best.v) best = { d, h, v: grid[d][h] };
  if (best && best.v > 0) host.append(el("p", "kc__note", `가장 많이 보는 때: ${DOW[best.d]}요일 ${best.h}시대 (${fmt.n(best.v)}회)`));
  return grid;
}

/* ---------- 전환 흐름 ---------- */
function funnel(steps) {
  const box = el("div", "fn");
  const first = Math.max(1, steps[0][1] || 0);
  steps.forEach(([label, v], i) => {
    const row = el("div", "fn__row");
    const name = el("span", "fn__label", label);
    const val = el("b", "fn__val", v == null ? "-" : fmt.n(v));
    const bar = el("span", "fn__bar");
    const fill = el("i");
    fill.style.width = Math.max(v > 0 ? 1.5 : 0, ((v || 0) / first) * 100) + "%";
    bar.append(fill);
    row.append(name, val, bar);
    if (i > 0) {
      const prev = steps[i - 1][1];
      row.append(el("span", "fn__rate", prev ? `이전 단계의 ${fmt.pct((v || 0) / prev)}` : "-"));
    }
    box.append(row);
  });
  return box;
}

/** 그래프 ↔ 표 전환 */
function withTable(chartHost, makeTable) {
  const wrap = el("div", "kt-viz");
  const btn = el("button", "kt-toggle", "표로 보기");
  btn.type = "button";
  const tbl = el("div", "kt-viz__table");
  tbl.hidden = true;
  btn.addEventListener("click", () => {
    const on = tbl.hidden;
    tbl.hidden = !on;
    chartHost.hidden = on;
    btn.textContent = on ? "그래프로 보기" : "표로 보기";
    if (on && !tbl.childNodes.length) tbl.append(makeTable());
    if (!on && chartHost._render) chartHost._render();
  });
  wrap.append(btn, chartHost, tbl);
  /* 버튼은 카드 제목 줄 오른쪽으로 옮깁니다 */
  requestAnimationFrame(() => {
    const head = wrap.closest(".kc") && wrap.closest(".kc").querySelector(".kc__head");
    if (head) head.append(btn);
  });
  return wrap;
}

/* ============================================================
   화면
   ============================================================ */
export function setupKpi({ api, loaders, loaded, toast }) {
  const RKEY = "mg-kpi-range";
  let state = { preset: "7d", from: null, to: null };
  try { Object.assign(state, JSON.parse(localStorage.getItem(RKEY) || "{}")); } catch {}
  let since = null;
  let current = null;

  /* 이 브라우저는 통계에서 빼기 (관리자 본인 방문 제외) */
  try { localStorage.setItem("mg_notrack", "1"); } catch {}

  const bar = $("[data-kpi-bar]");
  const chips = $("[data-kpi-presets]", bar);
  const fromIn = $("[data-kpi-from]", bar);
  const toIn = $("[data-kpi-to]", bar);
  const label = $("[data-kpi-range]", bar);

  function resolve() {
    if (state.preset !== "custom" || !state.from || !state.to) [state.from, state.to] = rangeOf(state.preset, since);
    fromIn.value = state.from;
    toIn.value = state.to;
    fromIn.max = toIn.max = kstToday();
    $$("button", chips).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.preset === state.preset)));
    const days = Math.round((Date.parse(state.to) - Date.parse(state.from)) / 86400e3) + 1;
    label.textContent = `${state.from.replace(/-/g, ".")} ~ ${state.to.replace(/-/g, ".")} · ${days}일 · 이전 ${days}일과 비교`;
    try { localStorage.setItem(RKEY, JSON.stringify(state)); } catch {}
  }

  for (const [k, t] of PRESETS) {
    const b = el("button", "chip", t);
    b.type = "button";
    b.dataset.preset = k;
    b.addEventListener("click", () => { state.preset = k; state.from = state.to = null; resolve(); reload(); });
    chips.append(b);
  }
  $("[data-kpi-apply]", bar).addEventListener("click", () => {
    if (!fromIn.value || !toIn.value) return toast("시작일과 종료일을 모두 골라 주세요.", true);
    let [f, t] = [fromIn.value, toIn.value];
    if (f > t) [f, t] = [t, f];
    state = { preset: "custom", from: f, to: t };
    resolve();
    reload();
  });
  $("[data-kpi-refresh]", bar).addEventListener("click", () => reload());
  resolve();

  const qs = () => `from=${state.from}&to=${state.to}`;

  function reload() {
    for (const v of VIEWS) loaded.delete(v);
    if (current && loaders[current]) { loaded.add(current); loaders[current](); }
  }

  async function fetchKpi(route, extra = "") {
    const { ok, data } = await api(`/api/kpi/${route}?${qs()}${extra}`);
    if (data && data.since !== undefined && data.since !== since) {
      since = data.since;
      /* '전체'는 집계 시작일을 알아야 기간이 정해지므로 한 번 더 불러옵니다 */
      if (state.preset === "all" && since && rangeOf("all", since)[0] !== state.from) {
        resolve();
        return fetchKpi(route, extra);
      }
    }
    return ok ? data : { error: true, message: (data && data.message) || "통계를 불러오지 못했어요." };
  }

  /** 화면 틀: 불러오는 동안 이전 화면을 흐리게 유지합니다 */
  async function paint(view, route, build, extra) {
    current = view;
    const root = $(`[data-kpi-root="${view}"]`);
    root.classList.add("is-loading");
    const data = await fetchKpi(route, extra);
    root.classList.remove("is-loading");
    root.innerHTML = "";
    if (data.error) { root.append(empty(data.message)); return; }
    if (data.noDb) { root.append(empty(data.message)); return; }
    if (!data.since && view !== "kpi-members" && view !== "kpi-community") root.append(noDataNote());
    build(root, data);
  }

  function noDataNote() {
    const n = el("div", "notice kt-note");
    n.append(el("b", null, "아직 모인 방문 기록이 없어요. "),
      document.createTextNode("이 기능을 배포한 뒤 손님이 홈페이지를 열 때부터 숫자가 쌓입니다. 관리자로 로그인한 이 브라우저의 방문은 집계에서 빠지니, 확인하려면 다른 휴대폰으로 홈페이지를 열어 보세요."));
    return n;
  }

  function sectionTitle(root, text, sub) {
    const h = el("div", "kt-group");
    h.append(el("h3", null, text));
    if (sub) h.append(el("span", null, sub));
    root.append(h);
  }

  /* ---------------- KPI 한눈에 ---------------- */
  let trendMetric = "u";
  loaders.kpi = () => paint("kpi", "overview", (root, d) => {
    const c = d.cur, p = d.prev;
    const rt = el("p", "kt-live");
    rt.append(el("i"), document.createTextNode(`최근 30분 동안 ${fmt.n(d.realtime)}명이 홈페이지를 봤어요`));
    if (d.since) rt.append(el("span", null, ` · 집계 시작 ${d.since.replace(/-/g, ".")}`));
    root.append(rt);

    const groups = [
      ["유입", "얼마나 찾아왔나", [
        { label: "방문자", value: fmt.n(c.visitors), cur: c.visitors, prev: p.visitors, hint: "브라우저 기준 순 방문자", go: "kpi-traffic" },
        { label: "신규 방문자", value: fmt.n(c.newVisitors), cur: c.newVisitors, prev: p.newVisitors, hint: `방문자의 ${fmt.pct(c.visitors ? c.newVisitors / c.visitors : 0, 0)}`, go: "kpi-traffic" },
        { label: "검색으로 들어온 비율", value: fmt.pct(c.searchShare), cur: c.searchShare, prev: p.searchShare, isRate: true, hint: "네이버·구글·다음 검색", go: "kpi-traffic" },
        { label: "매장 QR 스캔", value: fmt.n(c.qr), cur: c.qr, prev: p.qr, hint: "출입문·키오스크·테이블 QR", go: "kpi-pages" },
      ]],
      ["참여", "얼마나 머물렀나", [
        { label: "페이지뷰", value: fmt.n(c.views), cur: c.views, prev: p.views, go: "kpi-pages" },
        { label: "방문당 페이지", value: fmt.dec(c.pagesPerSession) + "쪽", cur: c.pagesPerSession, prev: p.pagesPerSession, go: "kpi-pages" },
        { label: "방문당 머문 시간", value: fmt.dur(c.durSession), cur: c.durSession, prev: p.durSession, hint: `페이지당 ${fmt.dur(c.durView)}`, go: "kpi-pages" },
        { label: "바로 나간 비율", value: fmt.pct(c.bounce), cur: c.bounce, prev: p.bounce, isRate: true, goodUp: false, hint: "한 페이지만 10초 안에", go: "kpi-pages" },
      ]],
      ["전환", "행동으로 이어졌나", [
        { label: "카카오 문의 클릭", value: fmt.n(c.kakao), cur: c.kakao, prev: p.kakao, go: "kpi-clicks" },
        { label: "길찾기 클릭", value: fmt.n(c.map), cur: c.map, prev: p.map, hint: "네이버·카카오 지도", go: "kpi-clicks" },
        { label: "창업·제휴 문의", value: c.inquiries == null ? "-" : fmt.n(c.inquiries), cur: c.inquiries, prev: p.inquiries, go: "kpi-clicks" },
        { label: "매장 체크인", value: c.checkins == null ? "-" : fmt.n(c.checkins), cur: c.checkins, prev: p.checkins, hint: "밍글패스 도장(회원)", go: "kpi-community" },
      ]],
      ["커뮤니티", "관계로 남았나", [
        { label: "신규 가입", value: c.signups == null ? "-" : fmt.n(c.signups), cur: c.signups, prev: p.signups, go: "kpi-members" },
        { label: "모임 개설", value: c.meetups == null ? "-" : fmt.n(c.meetups), cur: c.meetups, prev: p.meetups, go: "kpi-community" },
        { label: "모임 참여 신청", value: c.applications == null ? "-" : fmt.n(c.applications), cur: c.applications, prev: p.applications, go: "kpi-community" },
        { label: "밍글보드 새 글", value: fmt.n(c.posts), cur: c.posts, prev: p.posts, go: "kpi-community" },
      ]],
    ];
    for (const [g, sub, tiles] of groups) {
      sectionTitle(root, g, sub);
      const row = el("div", "kt-row");
      for (const t of tiles) row.append(tile(t));
      root.append(row);
    }

    /* 추이 */
    const tc = card("방문 추이", d.series.cur.unit === "hour" ? "시간대별 · 이전 같은 날과 비교" : "날짜별 · 이전 같은 기간과 비교");
    const metricBar = el("div", "chip-row kt-metric");
    const METRICS = [["u", "방문자"], ["v", "페이지뷰"], ["d", "페이지당 머문 시간"]];
    const legend = el("div", "kt-legend");
    const lg = (color, text) => { const s = el("span"); const k = el("i"); k.style.background = color; s.append(k, document.createTextNode(text)); return s; };
    legend.append(lg(C.accent, "이번 기간"), lg(C.muted, "이전 기간"));
    const host = el("div", "kt-chart");
    const drawTrend = () => {
      const isDur = trendMetric === "d";
      const conv = (arr) => arr.map((v) => (isDur ? Math.round(v / 1000) : v));
      const sc = d.series.cur, sp = d.series.prev;
      lineChart(host, {
        labels: sc.labels,
        xfmt: sc.unit === "hour" ? (s) => s : fmt.day,
        yfmt: isDur ? fmt.secAxis : fmt.axis,
        vfmt: isDur ? (s) => fmt.dur(s * 1000) : fmt.n,
        tipTitle: (i) => (sc.unit === "hour" ? sc.labels[i] : sc.labels[i].replace(/-/g, ".")),
        series: [
          { name: "이번 기간", values: conv(sc[trendMetric]), color: C.accent, area: true, endDot: true },
          { name: "이전 기간", values: conv(sp[trendMetric]), color: C.muted, tipName: (i) => "이전 · " + (sp.unit === "hour" ? sp.labels[i] : (sp.labels[i] || "").replace(/-/g, ".")) },
        ],
      });
    };
    for (const [k, t] of METRICS) {
      const b = el("button", "chip", t);
      b.type = "button";
      b.setAttribute("aria-pressed", String(k === trendMetric));
      b.addEventListener("click", () => { trendMetric = k; $$("button", metricBar).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); drawTrend(); });
      metricBar.append(b);
    }
    const tools = el("div", "kc__tools");
    tools.append(metricBar, legend);
    tc.append(tools);
    tc.append(withTable(host, () => table(
      [{ key: "label", label: d.series.cur.unit === "hour" ? "시간" : "날짜" }, { key: "u", label: "방문자", num: true, render: (r) => fmt.n(r.u) }, { key: "v", label: "페이지뷰", num: true, render: (r) => fmt.n(r.v) }, { key: "d", label: "페이지당 머문 시간", num: true, render: (r) => fmt.dur(r.d) }],
      d.series.cur.labels.map((lb, i) => ({ label: lb, u: d.series.cur.u[i], v: d.series.cur.v[i], d: d.series.cur.d[i] })),
      { initial: ["label", -1] }
    )));
    root.append(tc);
    requestAnimationFrame(drawTrend);

    /* 많이 본 페이지 · 유입 경로 */
    const two = el("div", "kt-two");
    const pc = card("많이 본 페이지", "조회수 기준");
    pc.append(meterList(d.topPages.map((r) => ({ label: r.title || r.path, sub: r.path, value: r.views, href: r.path }))));
    const more1 = el("button", "btn btn--ghost btn--sm kc__more", "페이지 전체 보기"); more1.dataset.go = "kpi-pages"; pc.append(more1);
    const sc = card("어디서 들어왔나", "방문(세션) 기준");
    const totalS = d.sources.reduce((s, r) => s + r.sessions, 0);
    sc.append(meterList(d.sources.slice(0, 7).map((r) => ({ label: lab("source", r.source), value: r.sessions })), { share: true, total: totalS }));
    const more2 = el("button", "btn btn--ghost btn--sm kc__more", "유입 경로 자세히"); more2.dataset.go = "kpi-traffic"; sc.append(more2);
    two.append(pc, sc);
    root.append(two);

    root.append(glossary());
  });

  function glossary() {
    const g = el("details", "adm-card kt-gloss");
    g.append(el("summary", null, "숫자 읽는 법"));
    const dl = el("dl");
    const items = [
      ["방문자", "같은 브라우저는 여러 번 와도 한 명으로 셉니다. 휴대폰과 컴퓨터로 각각 들어오면 두 명이에요."],
      ["방문(세션)", "한 번 들어와서 나갈 때까지. 30분 넘게 아무것도 안 하면 다음 방문으로 셉니다."],
      ["머문 시간", "화면을 실제로 보고 있던 시간만 셉니다. 다른 탭에 가 있거나 2분 넘게 손을 대지 않은 시간은 빠져요."],
      ["바로 나간 비율", "한 페이지만 보고 10초 안에 나간 방문의 비율. 낮을수록 좋습니다."],
      ["끝까지 읽은 비율", "페이지를 90% 넘게 내려 본 조회의 비율. 가이드 글이 실제로 읽히는지 봅니다."],
      ["전환 흐름", "같은 기간의 숫자를 단계별로 나란히 놓은 것입니다. 가입·문의는 방문 기록과 같은 사람으로 묶지 않아서, 단계 사이 비율은 대략적인 흐름으로 보세요."],
      ["빠지는 방문", "관리자로 로그인한 브라우저, 검색 로봇, '추적 안 함'을 켠 브라우저, 광고 차단기가 막은 경우는 집계되지 않습니다."],
    ];
    for (const [t, d] of items) { dl.append(el("dt", null, t), el("dd", null, d)); }
    g.append(dl);
    return g;
  }

  /* ---------------- 페이지 · 인기 정보 ---------------- */
  loaders["kpi-pages"] = () => paint("kpi-pages", "pages", (root, d) => {
    const top = el("div", "kt-two");
    const secCard = card("영역별 조회", "어느 메뉴가 많이 읽히나");
    const totalV = d.sections.reduce((s, r) => s + r.views, 0);
    secCard.append(meterList(d.sections.map((r) => ({ label: lab("section", r.section), value: r.views })), { share: true, total: totalV }));
    const qrCard = card("매장 QR 스캔", "매장 안 QR로 들어온 조회");
    qrCard.append(meterList(d.qr.map((r) => ({ label: L.qr[r.path] || r.path, value: r.views, sub: `방문자 ${fmt.n(r.visitors)}명` })), { empty: "아직 QR 스캔 기록이 없어요." }));
    top.append(secCard, qrCard);
    root.append(top);

    sectionTitle(root, "가장 인기 있는 정보", "손님이 실제로 찾아 읽은 것");
    const three = el("div", "kt-three");
    const gc = card("가이드 글", "조회 · 머문 시간 · 끝까지 읽은 비율");
    gc.append(meterList(d.guides.map((r) => ({ label: r.title || r.path, sub: `${fmt.dur(r.dur)} · 끝까지 ${fmt.pct(r.fullRead, 0)}`, value: r.views, href: r.path })), { empty: "아직 가이드 조회가 없어요." }));
    const nc = card("밍글 소식", "조회수 기준");
    nc.append(meterList(d.news.map((r) => ({ label: r.title || r.path, sub: fmt.dur(r.dur), value: r.views, href: r.path })), { empty: "아직 소식 조회가 없어요." }));
    const fc = card("많이 펼쳐 본 질문", "자주 묻는 질문 · 홈 화면 질문");
    fc.append(meterList(d.faq.map((r) => ({ label: r.label, sub: `${fmt.n(r.visitors)}명`, value: r.count })), { empty: "아직 펼쳐 본 질문이 없어요." }));
    three.append(gc, nc, fc);
    root.append(three);

    const sc = card("사이트 안에서 찾은 말", "검색 페이지에서 손님이 입력한 낱말. ‘결과 없음’이 많은 말은 글이나 질문으로 채워 주면 좋아요.");
    sc.append(table([
      { key: "label", label: "검색어" },
      { key: "count", label: "횟수", num: true, render: (r) => fmt.n(r.count) },
      { key: "visitors", label: "사람", num: true, render: (r) => fmt.n(r.visitors) },
      { key: "none", label: "결과 없음", num: true, render: (r) => (r.none ? fmt.n(r.none) : "–") },
    ], d.searches || [], { initial: ["count", -1], emptyText: "아직 사이트 안에서 검색한 기록이 없어요." }));
    root.append(sc);

    /* 전체 페이지 표 */
    const tc = card("페이지별 자세히", "제목을 누르면 새 탭에서 열려요. 머리글을 누르면 정렬됩니다.");
    const tools = el("div", "kc__tools");
    const search = el("input", "adm-input kt-search");
    search.type = "search";
    search.placeholder = "주소나 제목으로 찾기";
    const csv = el("a", "btn btn--ghost btn--sm", "엑셀(CSV) 내려받기");
    csv.href = `/api/kpi/pages.csv?${qs()}`;
    tools.append(search, csv);
    tc.append(tools);
    const holder = el("div");
    const cols = [
      { key: "title", label: "페이지", render: (r) => pathLink(r.path, r.title), sort: (r) => r.title || r.path },
      { key: "views", label: "조회", num: true, render: (r) => fmt.n(r.views) },
      { key: "visitors", label: "방문자", num: true, render: (r) => fmt.n(r.visitors) },
      { key: "dur", label: "머문 시간", num: true, render: (r) => fmt.dur(r.dur) },
      { key: "scroll", label: "스크롤", num: true, render: (r) => (r.scroll ? Math.round(r.scroll) + "%" : "-") },
      { key: "fullRead", label: "끝까지", num: true, render: (r) => fmt.pct(r.fullRead, 0) },
      { key: "entries", label: "첫 페이지", num: true, render: (r) => fmt.n(r.entries) },
      { key: "exitRate", label: "나간 비율", num: true, render: (r) => fmt.pct(r.exitRate, 0) },
    ];
    const drawTable = () => {
      const kw = search.value.trim().toLowerCase();
      const rows = kw ? d.pages.filter((r) => (r.path + " " + (r.title || "")).toLowerCase().includes(kw)) : d.pages;
      holder.innerHTML = "";
      holder.append(table(cols, rows, { initial: ["views", -1] }));
    };
    search.addEventListener("input", drawTable);
    drawTable();
    tc.append(holder);
    root.append(tc);

    const nf = card("찾을 수 없는 주소 (404)", "깨진 링크나 예전 주소로 들어온 경우. 많이 나오면 해당 링크를 고쳐 주세요.");
    nf.append(table([
      { key: "path", label: "들어온 주소" },
      { key: "count", label: "횟수", num: true, render: (r) => fmt.n(r.count) },
      { key: "from", label: "어디서 눌렀나", render: (r) => r.prev || r.ref || "직접 입력·알 수 없음", sortable: false },
    ], d.notFound, { initial: ["count", -1], emptyText: "찾을 수 없는 주소로 들어온 기록이 없어요." }));
    root.append(nf);
  });

  /* ---------------- 유입 경로 ---------------- */
  loaders["kpi-traffic"] = () => paint("kpi-traffic", "traffic", (root, d) => {
    const row = el("div", "kt-row");
    const ret = Math.max(0, d.visitors - d.newVisitors);
    row.append(
      tile({ label: "방문자", value: fmt.n(d.visitors) }),
      tile({ label: "처음 온 방문자", value: fmt.n(d.newVisitors), hint: fmt.pct(d.visitors ? d.newVisitors / d.visitors : 0, 0) }),
      tile({ label: "다시 온 방문자", value: fmt.n(ret), hint: fmt.pct(d.visitors ? ret / d.visitors : 0, 0) }),
      tile({ label: "로그인한 회원 방문자", value: fmt.n(d.memberVisitors), hint: fmt.pct(d.visitors ? d.memberVisitors / d.visitors : 0, 0) }),
    );
    root.append(row);

    const two = el("div", "kt-two");
    const sc = card("유입 경로", "첫 페이지로 들어온 방문(세션) 기준");
    const totalS = d.sources.reduce((s, r) => s + r.sessions, 0);
    sc.append(meterList(d.sources.map((r) => ({ label: lab("source", r.source), sub: `방문자 ${fmt.n(r.visitors)}명`, value: r.sessions })), { share: true, total: totalS }));
    const dc = card("기기 · 언어", "방문자 기준");
    const totalD = d.devices.reduce((s, r) => s + r.u, 0);
    dc.append(meterList(d.devices.map((r) => ({ label: lab("device", r.device), value: r.u })), { share: true, total: totalD }));
    dc.append(el("h4", "kc__h4", "브라우저 언어"));
    const totalL = d.langs.reduce((s, r) => s + r.u, 0);
    dc.append(meterList(d.langs.map((r) => ({ label: lab("lang", r.lang), value: r.u })), { share: true, total: totalL }));
    two.append(sc, dc);
    root.append(two);

    const two2 = el("div", "kt-two");
    const kc = card("검색어", "검색엔진이 알려 준 경우만 보입니다 (주로 네이버). 구글은 검색어를 넘겨주지 않아요.");
    kc.append(table([
      { key: "keyword", label: "검색어" },
      { key: "source", label: "검색엔진", render: (r) => lab("source", r.source) },
      { key: "c", label: "방문", num: true, render: (r) => fmt.n(r.c) },
    ], d.keywords, { initial: ["c", -1], emptyText: "아직 전달된 검색어가 없어요." }));
    const rc = card("외부 사이트", "링크를 눌러 들어온 사이트");
    rc.append(table([
      { key: "host", label: "사이트" },
      { key: "source", label: "분류", render: (r) => lab("source", r.source) },
      { key: "c", label: "방문", num: true, render: (r) => fmt.n(r.c) },
    ], d.refs, { initial: ["c", -1], emptyText: "아직 외부 사이트에서 들어온 기록이 없어요." }));
    two2.append(kc, rc);
    root.append(two2);

    const ac = card("AI 검색·챗봇에서 들어온 페이지", "ChatGPT·Perplexity·Gemini·Claude 같은 AI 답변 속 링크를 누르고 들어온 방문이에요. 어떤 글이 AI 답변에 인용되는지 가늠할 수 있습니다.");
    ac.append(table([
      { key: "title", label: "페이지", render: (r) => pathLink(r.path, r.title), sort: (r) => r.title || r.path },
      { key: "host", label: "어디서", render: (r) => r.host || "–" },
      { key: "c", label: "방문", num: true, render: (r) => fmt.n(r.c) },
    ], d.aiLanding || [], { initial: ["c", -1], emptyText: "아직 AI 검색·챗봇에서 들어온 방문이 없어요. 글이 쌓이고 색인되면 조금씩 생깁니다." }));
    root.append(ac);

    const hc = card("요일 · 시간대별 조회", "언제 홈페이지를 많이 보나 (한국 시간)");
    const hm = el("div", "kt-heat");
    hc.append(withTable(hm, () => {
      const DOW = ["일", "월", "화", "수", "목", "금", "토"];
      const rows = d.heat.map((r) => ({ when: `${DOW[r.dow]}요일 ${r.hour}시`, dow: (r.dow + 6) % 7, hour: r.hour, c: Number(r.c) }));
      return table([
        { key: "when", label: "때", sort: (r) => r.dow * 100 + r.hour },
        { key: "c", label: "조회", num: true, render: (r) => fmt.n(r.c) },
      ], rows, { initial: ["c", -1] });
    }));
    heatmap(hm, d.heat);
    root.append(hc);

    const two3 = el("div", "kt-two");
    const lc = card("첫 페이지", "방문이 시작된 페이지");
    lc.append(meterList(d.landing.map((r) => ({ label: r.title || r.path, sub: r.path, value: Number(r.c), href: r.path }))));
    const cc = card("나라", "접속 위치 기준 (대략)");
    const totalC = d.countries.reduce((s, r) => s + r.u, 0);
    cc.append(meterList(d.countries.map((r) => ({ label: lab("country", r.country), value: r.u })), { share: true, total: totalC }));
    two3.append(lc, cc);
    root.append(two3);

    const uc = card("캠페인 링크 (UTM)", "인스타그램·전단지·QR 링크 뒤에 ?utm_source=... 를 붙이면 여기서 따로 셉니다.");
    uc.append(table([
      { key: "s", label: "출처(source)" }, { key: "m", label: "매체(medium)" }, { key: "c", label: "캠페인" },
      { key: "n", label: "방문", num: true, render: (r) => fmt.n(r.n) }, { key: "u", label: "방문자", num: true, render: (r) => fmt.n(r.u) },
    ], d.utm, { initial: ["n", -1], emptyText: "아직 캠페인 링크로 들어온 방문이 없어요. 예: https://hellomingle.kr/?utm_source=instagram&utm_medium=bio" }));
    root.append(uc);
  });

  /* ---------------- 클릭 · 전환 ---------------- */
  loaders["kpi-clicks"] = () => paint("kpi-clicks", "clicks", (root, d) => {
    const by = Object.fromEntries(d.byTarget.map((r) => [r.target, r]));
    const pb = Object.fromEntries(d.byTargetPrev.map((r) => [r.target, r]));
    const v = d.visitors || 0;
    const t = (key, label) => {
      const c = by[key] || { c: 0, u: 0 };
      const p = pb[key] || { c: 0, u: 0 };
      return tile({ label, value: fmt.n(c.c), cur: Number(c.c), prev: Number(p.c), hint: `방문자 ${fmt.pct(v ? c.u / v : 0)}가 눌렀어요 (${fmt.n(c.u)}명)` });
    };
    const row = el("div", "kt-row");
    row.append(t("kakao", "카카오 문의"), t("map", "길찾기(지도)"), t("tel", "전화"), t("banner", "상단 공지 배너"));
    root.append(row);

    sectionTitle(root, "전환 흐름", "같은 기간 숫자를 단계별로 나란히 놓았어요");
    const grid = el("div", "kt-two");
    for (const f of d.funnels) {
      const fc = card(f.title);
      fc.append(funnel(f.steps));
      grid.append(fc);
    }
    root.append(grid);

    const two = el("div", "kt-two");
    const kc = card("클릭 종류", "무엇을 누르나");
    kc.append(meterList(d.byTarget.slice().sort((a, b) => b.c - a.c).map((r) => ({ label: lab("target", r.target), sub: `${fmt.n(r.u)}명`, value: Number(r.c) }))));
    const ic = card("많이 누른 항목", "상위 60개");
    ic.append(table([
      { key: "label", label: "항목", render: (r) => { const s = el("span", "kt-path"); s.append(el("span", "kt-path__t", r.label || "(이름 없음)"), el("span", "kt-path__p", r.href || "")); return s; } },
      { key: "target", label: "종류", render: (r) => lab("target", r.target) },
      { key: "c", label: "클릭", num: true, render: (r) => fmt.n(r.c) },
      { key: "u", label: "누른 사람", num: true, render: (r) => fmt.n(r.u) },
      { key: "pages", label: "누른 페이지", num: true, render: (r) => (Number(r.pages) > 1 ? `${fmt.n(r.pages)}개 페이지` : r.path) },
    ], d.items, { initial: ["c", -1] }));
    two.append(kc, ic);
    two.classList.add("kt-two--wide");
    root.append(two);
  });

  /* ---------------- 회원 ---------------- */
  let mState = { q: "", sort: "recent", page: 1 };
  loaders["kpi-members"] = () => paint("kpi-members", "members", (root, d) => {
    if (d.noUsers) { root.append(empty(d.message)); return; }
    const row = el("div", "kt-row kt-row--5");
    row.append(
      tile({ label: "전체 회원", value: fmt.n(d.total) + "명" }),
      tile({ label: "기간 신규 가입", value: fmt.n(d.newCur), cur: d.newCur, prev: d.newPrev }),
      tile({ label: "활동한 회원", value: fmt.n(d.activeCur), cur: d.activeCur, prev: d.activePrev, hint: "로그인·체크인·모임 신청" }),
      tile({ label: "소식 수신 동의", value: fmt.n(d.marketing), hint: fmt.pct(d.total ? d.marketing / d.total : 0, 0) }),
      tile({ label: "기간 탈퇴", value: fmt.n(d.withdrawn || 0), warn: (d.withdrawn || 0) > 0 }),
    );
    root.append(row);

    const two = el("div", "kt-two");
    const sc = card("가입 추이", "날짜별 신규 가입");
    const host = el("div", "kt-chart");
    sc.append(withTable(host, () => table([{ key: "d", label: "날짜" }, { key: "c", label: "가입", num: true, render: (r) => fmt.n(r.c) }], d.signups.labels.map((lb, i) => ({ d: lb, c: d.signups.values[i] })), { initial: ["d", -1] })));
    requestAnimationFrame(() => columnChart(host, { labels: d.signups.labels, values: d.signups.values, name: "신규 가입" }));
    const pc = card("가입 방법", "전체 회원 · 괄호는 이번 기간");
    const curMap = Object.fromEntries(d.providersCur.map((r) => [r.provider, Number(r.c)]));
    pc.append(meterList(d.providers.map((r) => ({ label: lab("provider", r.provider), sub: `이번 기간 ${fmt.n(curMap[r.provider] || 0)}명`, value: Number(r.c) })), { share: true, total: d.total }));
    two.append(sc, pc);
    root.append(two);

    /* 회원 목록 */
    const lc = card("회원 목록", "기간과 관계없이 전체 회원을 보여 줍니다. 이메일은 운영 목적 외에 쓰지 말아 주세요.");
    const tools = el("form", "kc__tools");
    const search = el("input", "adm-input kt-search");
    search.type = "search"; search.placeholder = "닉네임·이메일로 찾기"; search.value = mState.q;
    const sort = el("select", "adm-input kt-select");
    for (const [k, t] of [["recent", "최근 가입 순"], ["login", "최근 로그인 순"], ["checkins", "체크인 많은 순"], ["joined", "모임 참여 많은 순"], ["name", "닉네임 순"]]) {
      const o = el("option", null, t); o.value = k; if (k === mState.sort) o.selected = true; sort.append(o);
    }
    const go = el("button", "btn btn--primary btn--sm", "찾기"); go.type = "submit";
    const csv = el("a", "btn btn--ghost btn--sm", "엑셀(CSV) 내려받기");
    csv.href = `/api/kpi/members.csv?${qs()}&q=${encodeURIComponent(mState.q)}&sort=${mState.sort}`;
    csv.addEventListener("click", (e) => { if (!confirm("회원 이메일이 들어 있는 파일이에요. 내려받은 파일은 외부에 공유하지 말아 주세요.")) e.preventDefault(); });
    tools.append(search, sort, go, csv);
    tools.addEventListener("submit", (e) => { e.preventDefault(); mState = { q: search.value.trim(), sort: sort.value, page: 1 }; loaders["kpi-members"](); });
    sort.addEventListener("change", () => { mState = { q: search.value.trim(), sort: sort.value, page: 1 }; loaders["kpi-members"](); });
    lc.append(tools);
    lc.append(table([
      { key: "nickname", label: "닉네임", render: (r) => { const s = el("span", "kt-path"); s.append(el("span", "kt-path__t", r.nickname)); if (r.role === "host" || r.level > 1) s.append(el("span", "kt-path__p", r.role === "host" ? "호스트" : `Lv.${r.level}`)); return s; } },
      { key: "email", label: "이메일", render: (r) => r.email || "-" },
      { key: "provider", label: "가입", render: (r) => lab("provider", r.provider) },
      { key: "createdAt", label: "가입일", num: true, render: (r) => fmt.date(r.createdAt) },
      { key: "lastLogin", label: "최근 로그인", num: true, render: (r) => fmt.date(r.lastLogin) },
      { key: "checkins", label: "체크인", num: true, render: (r) => (r.checkins ? `${fmt.n(r.checkins)}회` : "-") },
      { key: "joined", label: "모임 참여", num: true, render: (r) => (r.joined || r.hosted ? `${r.joined}${r.hosted ? ` · 개설 ${r.hosted}` : ""}` : "-") },
      { key: "marketing", label: "수신", render: (r) => (r.marketing ? "동의" : "-"), sort: (r) => (r.marketing ? 1 : 0) },
    ], d.list, { sortable: true, emptyText: mState.q ? "찾는 회원이 없어요." : "아직 회원이 없어요." }));
    const pages = Math.max(1, Math.ceil(d.count / d.pageSize));
    const pager = el("div", "kt-pager");
    const prevB = el("button", "btn btn--ghost btn--sm", "이전"); prevB.type = "button"; prevB.disabled = d.page <= 1;
    const nextB = el("button", "btn btn--ghost btn--sm", "다음"); nextB.type = "button"; nextB.disabled = d.page >= pages;
    prevB.addEventListener("click", () => { mState.page = d.page - 1; loaders["kpi-members"](); });
    nextB.addEventListener("click", () => { mState.page = d.page + 1; loaders["kpi-members"](); });
    const from = d.count ? (d.page - 1) * d.pageSize + 1 : 0;
    pager.append(prevB, el("span", null, `${fmt.n(from)}–${fmt.n(Math.min(d.count, d.page * d.pageSize))} / ${fmt.n(d.count)}명`), nextB);
    lc.append(pager);
    root.append(lc);
  }, `&q=${encodeURIComponent(mState.q)}&sort=${mState.sort}&page=${mState.page}`);

  /* ---------------- 모임 · 커뮤니티 ---------------- */
  let meetupFilter = "all";
  loaders["kpi-community"] = () => paint("kpi-community", "community", (root, d) => {
    if (d.noMeetups) root.append(el("div", "notice kt-note", "모임 테이블을 읽지 못했어요. D1에 schema.sql이 적용됐는지 확인해 주세요."));
    const row = el("div", "kt-row");
    row.append(
      tile({ label: "모임 개설", value: fmt.n(d.meetupCount), cur: d.meetupCount, prev: d.meetupsPrev, hint: `지금 공개 중 ${fmt.n(d.openNow)}개` }),
      tile({ label: "모임 참여 신청", value: fmt.n(d.applications), cur: d.applications, prev: d.applicationsPrev, hint: `취소 ${fmt.n(d.cancelled)}건` }),
      tile({ label: "참여한 회원", value: fmt.n(d.participants) + "명", hint: "중복 없이" }),
      tile({ label: "평균 정원 충족률", value: d.fillRate == null ? "-" : fmt.pct(d.fillRate, 0), hint: "이 기간에 열린 모임" }),
    );
    root.append(row);
    const row2 = el("div", "kt-row");
    const rep = d.reports || {};
    row2.append(
      tile({ label: "밍글보드 새 글", value: fmt.n(d.posts), cur: d.posts, prev: d.postsPrev }),
      tile({ label: "댓글", value: fmt.n(d.comments) }),
      tile({ label: "신고 접수", value: fmt.n((rep.open || 0) + (rep.done || 0)), hint: `처리 대기 ${fmt.n(rep.open || 0)}건`, warn: (rep.open || 0) > 0, go: "community" }),
      tile({ label: "매장 체크인", value: fmt.n(d.checkins.total), cur: d.checkins.total, prev: d.checkins.prev, hint: `회원 ${fmt.n(d.checkins.users)}명 · 리워드 ${fmt.n(d.checkins.rewards)}회` }),
    );
    root.append(row2);

    const two = el("div", "kt-two");
    const cc = card("매장 체크인 추이", "밍글패스 도장 (회원만)");
    const host = el("div", "kt-chart");
    cc.append(withTable(host, () => table([{ key: "d", label: "날짜" }, { key: "c", label: "체크인", num: true, render: (r) => fmt.n(r.c) }], d.checkins.labels.map((lb, i) => ({ d: lb, c: d.checkins.values[i] })), { initial: ["d", -1] })));
    requestAnimationFrame(() => columnChart(host, { labels: d.checkins.labels, values: d.checkins.values, name: "체크인" }));
    const sc = card("체크인한 QR 위치");
    const totalQ = d.checkins.bySource.reduce((s, r) => s + Number(r.c), 0);
    sc.append(meterList(d.checkins.bySource.map((r) => ({ label: lab("checkin", r.source), value: Number(r.c) })), { share: true, total: totalQ }));
    sc.append(el("h4", "kc__h4", "모임 분류"));
    sc.append(meterList(d.byCategory.map((r) => ({ label: lab("category", r.category), sub: `신청 ${fmt.n(r.taken)}명`, value: r.meetups })), { fmtValue: (v) => fmt.n(v) + "개", empty: "이 기간에 열린 모임이 없어요." }));
    two.append(cc, sc);
    root.append(two);

    const mc = card("모임 목록", "이 기간에 개설된 모임 · 신청 인원과 정원");
    const filters = el("div", "chip-row");
    const statuses = ["all", "pending", "open", "closed", "done", "blocked"];
    const listHost = el("div");
    const drawList = () => {
      const rows = meetupFilter === "all" ? d.meetups : d.meetups.filter((m) => m.status === meetupFilter);
      listHost.innerHTML = "";
      listHost.append(table([
        { key: "title", label: "모임", render: (m) => { const s = el("span", "kt-path"); s.append(el("span", "kt-path__t", m.title), el("span", "kt-path__p", `${lab("category", m.category)} · 호스트 ${m.host}${m.lang === "en" ? " · 한/영" : ""}`)); return s; }, sort: (m) => m.title },
        { key: "startsAt", label: "모임 날짜", num: true, render: (m) => (m.startsAt ? fmt.datetime(m.startsAt) : "조율 중") },
        { key: "status", label: "상태", render: (m) => { const s = el("span", "st st--" + ({ pending: "open", open: "published", closed: "contacted", done: "done", blocked: "hidden" }[m.status] || "done"), lab("status", m.status)); return s; } },
        { key: "taken", label: "신청 / 정원", num: true, render: (m) => {
          const w = el("span", "kt-fill");
          const b = el("span", "kt-fill__bar"); const f = el("i"); f.style.width = (m.capacity ? Math.min(100, (m.taken / m.capacity) * 100) : 0) + "%"; b.append(f);
          w.append(el("span", null, `${m.taken} / ${m.capacity || "-"}`), b);
          return w;
        } },
        { key: "attended", label: "참석", num: true, render: (m) => (m.attended ? fmt.n(m.attended) : "-") },
        { key: "cancelled", label: "취소", num: true, render: (m) => (m.cancelled ? fmt.n(m.cancelled) : "-") },
        { key: "createdAt", label: "개설일", num: true, render: (m) => fmt.date(m.createdAt) },
      ], rows, { initial: ["createdAt", -1], emptyText: "해당하는 모임이 없어요." }));
    };
    for (const s of statuses) {
      const n = s === "all" ? d.meetups.length : d.byStatus[s] || 0;
      const b = el("button", "chip", `${s === "all" ? "전체" : lab("status", s)} ${n}`);
      b.type = "button";
      b.setAttribute("aria-pressed", String(meetupFilter === s));
      b.addEventListener("click", () => { meetupFilter = s; $$("button", filters).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); drawList(); });
      filters.append(b);
    }
    mc.append(filters, listHost);
    drawList();
    root.append(mc);
  });

  const VIEWS = ["kpi", "kpi-pages", "kpi-traffic", "kpi-clicks", "kpi-members", "kpi-community"];

  /* 화면 크기가 바뀌면 그래프를 다시 그립니다 */
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => $$(".kt-chart").forEach((h) => { if (h._render && h.offsetParent) h._render(); }), 150);
  });

  return {
    titles: {
      kpi: "KPI 한눈에", "kpi-pages": "페이지 · 인기 정보", "kpi-traffic": "유입 경로",
      "kpi-clicks": "클릭 · 전환", "kpi-members": "회원", "kpi-community": "모임 · 커뮤니티",
    },
    /** 오늘 할 일 화면용 오늘 숫자 */
    today: async () => {
      const { ok, data } = await api("/api/kpi/today");
      return ok && !data.noDb ? data : null;
    },
  };
}
