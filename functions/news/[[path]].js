/**
 * 밍글 소식 — /news/*   (서버에서 HTML을 만들어 보냅니다. 검색엔진이 그대로 읽을 수 있어요)
 *  /news/               목록  (?cat=notice|menu|event|story)
 *  /news/<slug>         글 하나 (관리자는 ?preview=1 로 임시 저장 글도 볼 수 있어요)
 *  /news/rss.xml        RSS (네이버 서치어드바이저에 제출)
 *  /news/sitemap.xml    사이트맵 (robots.txt 에 등록돼 있어요)
 * 머리·꼬리(헤더·푸터)는 빌드가 만든 /_tpl/news.html 을 그대로 씁니다.
 */
import { getJSON, isAdmin, NEWS_CATS, newsUrl, SITE_ORIGIN, kstDate } from "../../lib/cms.js";
import { esc, mdToHtml, mdToText } from "../../lib/md.js";

const fmtDate = (ts) => (ts ? kstDate(ts).replace(/-/g, ".") : "");
const isoDate = (ts) => new Date(ts || Date.now()).toISOString();

/** 정적 파일 읽기. Pages는 .html 주소를 확장자 없는 주소로 넘기므로 둘 다 시도합니다. */
async function asset(env, request, paths) {
  for (const p of paths) {
    try {
      const r = await env.ASSETS.fetch(new URL(p, request.url));
      if (r.ok) return await r.text();
    } catch {}
  }
  return null;
}

async function loadTemplate(env, request) {
  const t = await asset(env, request, ["/_tpl/news", "/_tpl/news.html"]);
  if (t && t.includes("<!--MAIN-->")) return t;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><!--HEAD--><link rel="stylesheet" href="/css/main.css"></head><body><main id="main"><!--MAIN--></main></body></html>`;
}

function page(tpl, head, main) {
  return tpl.replace("<!--HEAD-->", head).replace("<!--MAIN-->", main);
}

function headTags({ title, description, path, image, type = "website", jsonld = [], robots }) {
  const url = SITE_ORIGIN + path;
  const img = SITE_ORIGIN + (image || "/img/store-exterior.webp");
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    robots ? `<meta name="robots" content="${esc(robots)}">` : "",
    `<meta property="og:site_name" content="MINGLE 밍글">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    `<meta property="og:locale" content="ko_KR">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="alternate" type="application/rss+xml" title="밍글 소식" href="${SITE_ORIGIN}/news/rss.xml">`,
    ...jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`),
  ].join("\n  ");
}

const coverPath = (c) => (c ? `/img/${c}.webp` : null);

function card(n) {
  const cover = coverPath(n.cover);
  return `<a class="ncard" href="${newsUrl(n)}">` +
    (cover ? `<span class="ncard__img"><img src="${cover}" alt="" loading="lazy" width="600" height="400"></span>` : "") +
    `<span class="ncard__b"><span class="ncard__meta"><span class="badge">${esc(NEWS_CATS[n.category] || "소식")}</span>` +
    (n.pinned ? `<span class="badge badge--navy">고정</span>` : "") +
    `<time datetime="${isoDate(n.publishedAt)}">${fmtDate(n.publishedAt)}</time></span>` +
    `<strong class="ncard__t">${esc(n.title)}</strong>` +
    (n.summary ? `<span class="ncard__s">${esc(n.summary)}</span>` : "") +
    `</span></a>`;
}

function breadcrumbLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it[0], item: SITE_ORIGIN + it[1] })),
  };
}

const xml = (body, type = "application/xml") =>
  new Response(body, { headers: { "Content-Type": type + "; charset=utf-8", "Cache-Control": "public, max-age=600" } });

const html = (body, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" } });

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  if (url.pathname === "/news") return Response.redirect(url.origin + "/news/" + url.search, 301);
  const parts = (Array.isArray(params.path) ? params.path : params.path ? [params.path] : []).filter(Boolean);
  const seg = parts.join("/");

  const index = ((await getJSON(env, "news:index", [], 60)) || []);
  const published = index
    .filter((n) => n.status === "published")
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));

  /* ---------- RSS ---------- */
  if (seg === "rss.xml") {
    const items = published.slice(0, 30);
    const fulls = await Promise.all(items.map((n) => getJSON(env, "news:" + n.id, null, 60)));
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>밍글 소식</title>
<link>${SITE_ORIGIN}/news/</link>
<description>건대·화양동 24시간 무인 디저트카페 밍글의 공지, 새 메뉴, 모임 소식</description>
<language>ko</language>
<atom:link href="${SITE_ORIGIN}/news/rss.xml" rel="self" type="application/rss+xml"/>
${items.map((n, i) => {
  const f = fulls[i];
  const desc = n.summary || (f ? mdToText(f.body).slice(0, 200) : "");
  return `<item><title>${esc(n.title)}</title><link>${SITE_ORIGIN}${newsUrl(n)}</link><guid isPermaLink="true">${SITE_ORIGIN}${newsUrl(n)}</guid><pubDate>${new Date(n.publishedAt || Date.now()).toUTCString()}</pubDate><category>${esc(NEWS_CATS[n.category] || "소식")}</category><description>${esc(desc)}</description></item>`;
}).join("\n")}
</channel>
</rss>`;
    return xml(body, "application/rss+xml");
  }

  /* ---------- 사이트맵 ---------- */
  if (seg === "sitemap.xml") {
    const latest = published[0];
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_ORIGIN}/news/</loc>${latest ? `<lastmod>${kstDate(latest.updatedAt || latest.publishedAt)}</lastmod>` : ""}</url>
${published.map((n) => `  <url><loc>${SITE_ORIGIN}${esc(newsUrl(n))}</loc><lastmod>${kstDate(n.updatedAt || n.publishedAt)}</lastmod></url>`).join("\n")}
</urlset>`;
    return xml(body);
  }

  const tpl = await loadTemplate(env, request);

  /* ---------- 목록 ---------- */
  if (!seg) {
    const cat = url.searchParams.get("cat");
    const list = (NEWS_CATS[cat] ? published.filter((n) => n.category === cat) : published);
    const pinned = list.filter((n) => n.pinned);
    const rest = list.filter((n) => !n.pinned);
    const chips = [`<a class="chip" href="/news/"${!NEWS_CATS[cat] ? ' aria-pressed="true"' : ""}>전체</a>`]
      .concat(Object.entries(NEWS_CATS).map(([k, v]) => `<a class="chip" href="/news/?cat=${k}"${cat === k ? ' aria-pressed="true"' : ""}>${v}</a>`))
      .join("");
    const main = `
<section class="page-head">
  <div class="wrap">
    <nav class="crumbs" aria-label="현재 위치"><a href="/">홈</a><span aria-hidden="true">›</span><span>밍글 소식</span></nav>
    <span class="eyebrow">News</span>
    <h1>밍글 소식</h1>
    <p class="lead">건대화양점의 공지, 새로 들어온 디저트, 모임 일정을 여기에 올립니다. 점검이나 품절처럼 급한 소식은 홈 화면 맨 위 공지에도 함께 띄워요.</p>
    <div class="chip-row" style="margin-top:14px">${chips}</div>
  </div>
</section>
<section class="section" style="padding-top:24px">
  <div class="wrap">
    ${list.length
      ? `<div class="ngrid">${pinned.concat(rest).map(card).join("")}</div>`
      : `<div class="empty">아직 올라온 소식이 없어요. 매장 이야기는 <a href="/guide/">밍글 가이드</a>에서 먼저 읽어 보실 수 있어요.</div>`}
    <p class="small" style="margin-top:22px">새 글을 받아 보고 싶으시면 <a href="/news/rss.xml">RSS</a>를 구독하거나 <a href="http://pf.kakao.com/_AxgYMn/friend" target="_blank" rel="noopener">카카오톡 채널</a>을 추가해 주세요.</p>
  </div>
</section>`;
    const head = headTags({
      title: (NEWS_CATS[cat] ? NEWS_CATS[cat] + " — " : "") + "밍글 소식 | 건대 24시간 무인 디저트카페",
      description: "밍글 건대화양점의 공지, 새 메뉴, 이벤트·모임 소식을 모았습니다. 매장 점검이나 품절 같은 운영 소식도 여기서 확인하세요.",
      path: "/news/" + (NEWS_CATS[cat] ? `?cat=${cat}` : ""),
      jsonld: [breadcrumbLd([["홈", "/"], ["밍글 소식", "/news/"]])],
      robots: NEWS_CATS[cat] ? "noindex, follow" : "",
    });
    return html(page(tpl, head, main));
  }

  /* ---------- 글 하나 ---------- */
  let slug = seg.replace(/\/$/, "");
  try { slug = decodeURIComponent(slug); } catch {}
  const preview = url.searchParams.get("preview") === "1" && (await isAdmin(request, env));
  const entry = index.find((n) => n.slug === slug || n.id === slug);
  if (!entry || (entry.status !== "published" && !preview)) {
    const t = await asset(env, request, ["/404", "/404.html"]);
    return html(t || "<h1>404</h1>", 404);
  }
  const item = await getJSON(env, "news:" + entry.id, null, preview ? undefined : 60);
  if (!item) return html("<h1>404</h1>", 404);

  const { html: bodyHtml } = mdToHtml(item.body);
  const desc = item.summary || mdToText(item.body).replace(/\s+/g, " ").slice(0, 140);
  const cover = coverPath(item.cover);
  const more = published.filter((n) => n.id !== item.id).slice(0, 3);
  const path = newsUrl(item);

  const main = `
<article class="article">
  <header class="article__head">
    <div class="wrap wrap--read">
      <nav class="crumbs" aria-label="현재 위치"><a href="/">홈</a><span aria-hidden="true">›</span><a href="/news/">밍글 소식</a><span aria-hidden="true">›</span><span>${esc(NEWS_CATS[item.category] || "소식")}</span></nav>
      ${preview && item.status !== "published" ? `<p class="notice" style="margin-bottom:14px">임시 저장 글 미리보기예요. 손님에게는 아직 보이지 않습니다.</p>` : ""}
      <div class="article__meta"><span class="badge">${esc(NEWS_CATS[item.category] || "소식")}</span><time datetime="${isoDate(item.publishedAt || item.updatedAt)}">${fmtDate(item.publishedAt || item.updatedAt)}</time></div>
      <h1>${esc(item.title)}</h1>
      ${item.summary ? `<p class="lead">${esc(item.summary)}</p>` : ""}
    </div>
  </header>
  ${cover ? `<div class="wrap wrap--read"><figure class="figure article__cover"><img src="${cover}" alt="${esc(item.title)}" width="1200" height="800"></figure></div>` : ""}
  <div class="wrap wrap--read">
    <div class="prose">${bodyHtml}</div>
    <div class="article__foot">
      <a class="btn btn--ghost" href="/news/">소식 목록으로</a>
      <a class="btn btn--primary" href="/store">매장 안내 보기</a>
    </div>
  </div>
</article>
${more.length ? `<section class="section section--beige">
  <div class="wrap">
    <span class="eyebrow">More</span>
    <h2>다른 소식</h2>
    <div class="ngrid" style="margin-top:16px">${more.map(card).join("")}</div>
  </div>
</section>` : ""}`;

  const head = headTags({
    title: `${item.title} | 밍글 소식`,
    description: desc,
    path,
    image: cover,
    type: "article",
    robots: preview && item.status !== "published" ? "noindex, nofollow" : "",
    jsonld: [
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: item.title,
        description: desc,
        datePublished: isoDate(item.publishedAt || item.createdAt),
        dateModified: isoDate(item.updatedAt),
        image: SITE_ORIGIN + (cover || "/img/store-exterior.webp"),
        mainEntityOfPage: SITE_ORIGIN + path,
        inLanguage: "ko-KR",
        author: { "@type": "Organization", name: "밍글", url: SITE_ORIGIN },
        publisher: { "@type": "Organization", name: "밍글", logo: { "@type": "ImageObject", url: SITE_ORIGIN + "/img/logo.png" } },
      },
      breadcrumbLd([["홈", "/"], ["밍글 소식", "/news/"], [item.title, path]]),
    ],
  });
  return html(page(tpl, head, main));
}
