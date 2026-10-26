/* ============================================================
   밍글 미니 마크다운 — 가이드 글(빌드)과 소식 글(서버)이 함께 씁니다.
   지원: ## / ### 제목, 문단, - 목록, 1. 목록, > 팁 상자,
         **굵게**, [링크](주소), 줄바꿈(문단 안 두 칸 띄우기 없이 그대로 이어 붙임)
   HTML은 먼저 전부 이스케이프하므로 글 안에 태그를 넣어도 실행되지 않습니다.
   ============================================================ */

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 링크로 허용하는 주소: 사이트 안 경로, http(s), mailto, tel */
function safeHref(href) {
  const h = String(href || "").trim();
  if (/^\/(?!\/)/.test(h)) return h;
  if (/^https?:\/\//i.test(h)) return h;
  if (/^mailto:/i.test(h) || /^tel:/i.test(h)) return h;
  if (/^#[\w-]+$/.test(h)) return h;
  return null;
}

/** 한 줄 안의 꾸밈 (이미 이스케이프된 텍스트를 받습니다) */
function inline(text) {
  let t = text;
  // [라벨](주소)
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
    const raw = href.replace(/&amp;/g, "&");
    const ok = safeHref(raw);
    if (!ok) return label;
    const ext = /^https?:\/\//i.test(ok);
    return `<a href="${esc(ok)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`;
  });
  // **굵게**
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return t;
}

/** 제목에서 id 만들기 (목차 링크용) */
export function slugifyHeading(s, used) {
  let base = String(s)
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40) || "section";
  let id = base, n = 2;
  while (used && used.has(id)) id = base + "-" + n++;
  if (used) used.add(id);
  return id;
}

/**
 * 마크다운 → HTML
 * @returns {{ html: string, headings: {level:number, text:string, id:string}[] }}
 */
export function mdToHtml(md, opts = {}) {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  const headings = [];
  const used = new Set();
  let para = [];
  let list = null; // { type: 'ul'|'ol', items: [] }
  let quote = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(esc(para.join(" ")))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.type}>` + list.items.map((i) => `<li>${inline(esc(i))}</li>`).join("") + `</${list.type}>`);
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      const body = quote.join("\n").split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean)
        .map((p) => `<p>${inline(esc(p))}</p>`).join("");
      out.push(`<aside class="tip">${body}</aside>`);
      quote = [];
    }
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^\s*$/.test(line)) { flushPara(); flushList(); if (quote.length) quote.push(""); continue; }

    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      flushAll();
      const level = Math.min(h[1].length, 4);
      const text = h[2].trim();
      const id = slugifyHeading(text, used);
      headings.push({ level, text, id });
      out.push(`<h${level} id="${esc(id)}">${inline(esc(text))}</h${level}>`);
      continue;
    }

    const q = line.match(/^>\s?(.*)$/);
    if (q) { flushPara(); flushList(); quote.push(q[1]); continue; }
    else if (quote.length) flushQuote();

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const type = ul ? "ul" : "ol";
      if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
      list.items.push((ul || ol)[1]);
      continue;
    }

    // 목록 항목이 다음 줄로 이어지는 경우
    if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += " " + line.trim(); continue; }

    flushList();
    para.push(line.trim());
  }
  flushAll();

  let html = out.join("\n");
  if (opts.headingOffset) {
    html = html.replace(/<(\/?)h([2-4])/g, (m, s, n) => `<${s}h${Math.min(6, Number(n) + opts.headingOffset)}`);
  }
  return { html, headings };
}

/** 마크다운에서 꾸밈 기호를 걷어낸 순수 텍스트 (요약·글자 수 계산용) */
export function mdToText(md) {
  return String(md || "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
