#!/usr/bin/env node
/* ============================================================
   밍글 홈페이지 빌드 스크립트
   실행: node tools/build.mjs   (저장소 맨 위 폴더에서, 설치할 것 없음)

   하는 일
   1) content/guides/*.md  →  site/guide/<slug>.html  (가이드 글)
   2) 가이드 모음(site/guide/index.html), 자주 묻는 질문(site/faq.html)
   3) 소식 페이지용 머리·꼬리 틀(site/_tpl/news.html)
   4) 모든 페이지의 머리(헤더)·메뉴·푸터·하단 탭을 같은 모양으로 맞춤
      + 내부 링크를 확장자 없는 주소로 정리(/store.html → /store)
      + CSS·JS 캐시 버전 갱신
   5) 메뉴 페이지에 기본 메뉴를 HTML로 미리 그려 둠(검색엔진용)
   6) sitemap.xml, rss.xml, robots.txt 생성

   Cloudflare 배포에는 빌드가 필요 없습니다. 이 스크립트로 만든 결과(site/)를 그대로 올립니다.
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { mdToHtml, mdToText, esc } from "../lib/md.js";
import { menuHtml, STATIC_VERIFICATION } from "../lib/cms.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const ORIGIN = "https://hellomingle.kr";
const VER = "20261026";
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const KAKAO = "http://pf.kakao.com/_AxgYMn/friend";
const NAVER_MAP = "https://map.naver.com/p/search/%EC%84%9C%EC%9A%B8%20%EA%B4%91%EC%A7%84%EA%B5%AC%20%EB%8A%A5%EB%8F%99%EB%A1%9C13%EA%B8%B8%2039";
const KAKAO_MAP = "https://map.kakao.com/?q=%EC%84%9C%EC%9A%B8%20%EA%B4%91%EC%A7%84%EA%B5%AC%20%EB%8A%A5%EB%8F%99%EB%A1%9C13%EA%B8%B8%2039";

/* 사이트 소유 확인 메타 태그 — 모든 페이지 <head>에 들어갑니다 (값은 lib/cms.js 의 STATIC_VERIFICATION) */
const VERIFY_META = [
  STATIC_VERIFICATION.naver && `<meta name="naver-site-verification" content="${STATIC_VERIFICATION.naver}">`,
  STATIC_VERIFICATION.google && `<meta name="google-site-verification" content="${STATIC_VERIFICATION.google}">`,
].filter(Boolean);

function withVerify(html) {
  let s = html.replace(/\s*<meta name="(naver|google)-site-verification"[^>]*>/g, "");
  if (!VERIFY_META.length) return s;
  return s.replace(/(<meta name="viewport"[^>]*>)/, `$1\n  ${VERIFY_META.join("\n  ")}`);
}

const read = (p) => fs.readFileSync(p, "utf8");
const write = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, p.endsWith(".html") ? withVerify(s) : s);
};
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
const log = (...a) => console.log("  ·", ...a);

/* ============================================================
   공통 조각 (헤더·메뉴·푸터·탭바)
   ============================================================ */
const ICON = {
  menuBtn: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 5h14M3 10h14M3 15h14"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-7h6v7"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/></svg>`,
  scan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M16 4h3a1 1 0 0 1 1 1v3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M4 12h16"/></svg>`,
  people: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="3.5"/><path d="M22 20v-2a4 4 0 0 0-3-3.9"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 14.5 9H21l-5 4 2 7-6-4-6 4 2-7-5-4h6.5z"/></svg>`,
  kakao: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3C6.9 3 2.8 6.3 2.8 10.3c0 2.6 1.7 4.9 4.3 6.2-.2.7-.7 2.5-.8 2.9 0 0-.1.2 0 .3.1.1.3 0 .3 0 .4-.1 2.7-1.8 3.7-2.5.6.1 1.1.1 1.7.1 5.1 0 9.2-3.3 9.2-7.3S17.1 3 12 3z"/></svg>`,
};

const cur = (on) => (on ? ' aria-current="page"' : "");

function header(lang, active) {
  const en = lang === "en";
  const nav = [
    ["menu", "/menu", "메뉴"],
    ["community", "/community", "커뮤니티"],
    ["global", "/global", "글로벌"],
    ["store", "/store", "매장"],
    ["guide", "/guide/", "가이드"],
    ["startup", "/startup", "창업·제휴"],
  ];
  return `<header class="site-header">
  <div class="wrap">
    <a class="logo" href="${en ? "/en/" : "/"}" aria-label="${en ? "Mingle home" : "밍글 홈으로"}">
      <img src="/img/logo.png?v=${VER}" alt="Mingle 밍글" width="106" height="50">
    </a>
    <nav class="gnb" aria-label="${en ? "Main menu" : "주요 메뉴"}">
${nav.map(([k, h, t]) => `      <a href="${h}"${cur(active === k)}>${t}</a>`).join("\n")}
    </nav>
    <div class="header-cta">
      <a class="lang-btn" href="${en ? "/" : "/en/"}">${en ? "KO" : "EN"}</a>
      <a class="btn btn--ghost btn--sm" data-auth-link href="/account/login">로그인</a>
      <a class="btn btn--primary btn--sm" href="/pass">밍글패스</a>
    </div>
    <button class="menu-btn" aria-label="${en ? "Open menu" : "메뉴 열기"}" aria-expanded="false">
      ${ICON.menuBtn}
    </button>
  </div>
</header>`;
}

function sheet() {
  return `<div class="sheet" role="dialog" aria-modal="true" aria-label="메뉴">
  <div class="sheet__bg"></div>
  <div class="sheet__panel">
    <button class="sheet__close" aria-label="메뉴 닫기">×</button>
    <img src="/img/logo.png?v=${VER}" alt="" width="84" height="40">
    <nav aria-label="전체 메뉴">
      <a href="/">홈</a>
      <a href="/menu">오늘의 메뉴</a>
      <a href="/community">커뮤니티 · 밍글보드</a>
      <a href="/global">글로벌 · 언어교환</a>
      <a href="/pass">밍글패스 · 스탬프</a>
      <a href="/store">매장 안내</a>
      <a href="/guide/">밍글 가이드</a>
      <a href="/news/">밍글 소식</a>
      <a href="/faq">자주 묻는 질문</a>
      <a href="/brand">브랜드 이야기</a>
      <a href="/startup">창업 안내</a>
      <a href="/partner">제휴 · 협업</a>
    </nav>
    <a class="btn btn--ghost" data-auth-link href="/account/login">로그인 · 회원가입</a>
    <a class="btn btn--primary" href="/store">오늘 밍글 가기</a>
    <p class="small" style="margin-top:16px">
      <a href="/en/">English</a> · <a href="/legal/community">커뮤니티 가이드</a>
    </p>
  </div>
</div>`;
}

function footer() {
  return `<footer class="site-footer">
  <div class="wrap">
    <div class="cols">
      <div>
        <img src="/img/logo-white.png?v=${VER}" alt="Mingle 밍글" width="106" height="50">
        <p>커피만 파는 무인카페를 넘어, 디저트와 머무름을 함께 제공하는 24시간 공간.<br>
           건대·화양동에서 동네 사람과 관심사를 잇는 커뮤니티를 만들어 갑니다.</p>
        <p class="small">밍글 무인카페 건대화양점<br>서울 광진구 능동로13길 39 (화양동 10-1)<br>24시간 · 연중무휴 · 무인 운영</p>
        <p class="small">문의 <a href="${KAKAO}" target="_blank" rel="noopener">카카오톡 채널</a> · <a data-site="supportEmail" href="#">이메일</a></p>
      </div>
      <div>
        <h4>커뮤니티</h4>
        <ul>
          <li><a href="/community">밍글보드 · 동네 이야기</a></li>
          <li><a href="/community#meetups">모임 · 스터디</a></li>
          <li><a href="/global">글로벌 · 언어교환</a></li>
          <li><a href="/pass">밍글패스 · 스탬프</a></li>
          <li><a href="/news/">밍글 소식</a></li>
        </ul>
      </div>
      <div>
        <h4>밍글</h4>
        <ul>
          <li><a href="/menu">오늘의 메뉴</a></li>
          <li><a href="/store">건대화양점</a></li>
          <li><a href="/brand">브랜드 이야기</a></li>
          <li><a href="/startup">창업 안내</a></li>
          <li><a href="/partner">제휴 · 협업</a></li>
          <li><a data-sns="instagram" href="#">인스타그램</a></li>
          <li><a data-sns="kakaoChannel" href="#">카카오톡 문의</a></li>
        </ul>
      </div>
      <div>
        <h4>가이드</h4>
        <ul>
          <li><a href="/guide/">밍글 가이드 전체</a></li>
          <li><a href="/guide/kondae-24h-cafe">건대 24시간 카페 이용 안내</a></li>
          <li><a href="/guide/kondae-study-cafe">건대 카공 자리 고르기</a></li>
          <li><a href="/guide/how-to-use-unmanned-cafe">무인카페 이용 방법</a></li>
          <li><a href="/guide/unmanned-cafe-startup-cost">무인카페 창업 비용 구조</a></li>
          <li><a href="/faq">자주 묻는 질문</a></li>
        </ul>
      </div>
    </div>
    <div class="fineprint">
      <p><a href="/legal/terms">이용약관</a> · <a href="/legal/privacy">개인정보처리방침</a> · <a href="/legal/community">커뮤니티 가이드</a></p>
      <p>대표 최시준 · 밍글 무인카페 건대화양점</p>
      <p>이 사이트의 일부 공간·패키지 이미지는 브랜드 적용을 보여 드리기 위한 콘셉트 이미지로, 실제 매장과 다를 수 있습니다.
         “국내 최초 무인디저트카페”는 밍글이 표방하는 브랜드 포지셔닝 문구입니다.</p>
      <p>© 2026 MINGLE. Sweeten your day, connect your neighborhood.</p>
    </div>
  </div>
</footer>`;
}

function tabbar(lang, active) {
  return `<nav class="tabbar" aria-label="${lang === "en" ? "Quick menu" : "빠른 메뉴"}">
  <a href="/"${cur(active === "home")}>${ICON.home}<span>홈</span></a>
  <a href="/menu"${cur(active === "menu")}>${ICON.menu}<span>메뉴</span></a>
  <a class="tabbar__scan" href="/go/" aria-label="매장 QR 스캔 안내">
    <span class="tabbar__scan-circle">
      ${ICON.scan}
    </span>
    <span>스캔</span>
  </a>
  <a href="/community"${cur(active === "community")}>${ICON.people}<span>커뮤니티</span></a>
  <a href="/pass"${cur(active === "pass")}>${ICON.star}<span>마이밍글</span></a>
</nav>`;
}

const fab = (lang) =>
  `<a class="kakao-fab" href="${KAKAO}" target="_blank" rel="noopener" aria-label="${lang === "en" ? "Ask us on KakaoTalk" : "카카오톡으로 문의하기"}">${ICON.kakao}<span class="kakao-fab__txt">${lang === "en" ? "Ask us" : "문의하기"}</span></a>`;

function headCommon({ lang = "ko", title, description, canonical, image = "/img/store-exterior.webp", type = "website", robots, alternates = true, extra = "" }) {
  const en = lang === "en";
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${ORIGIN}${canonical}">
${robots ? `  <meta name="robots" content="${robots}">\n` : `  <meta name="robots" content="index, follow, max-image-preview:large">\n`}  <meta property="og:site_name" content="MINGLE 밍글">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="${type}">
  <meta property="og:url" content="${ORIGIN}${canonical}">
  <meta property="og:image" content="${ORIGIN}${image}">
  <meta property="og:locale" content="${en ? "en_US" : "ko_KR"}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#FFFFFF">
${alternates ? `  <link rel="alternate" hreflang="ko" href="${ORIGIN}/">
  <link rel="alternate" hreflang="en" href="${ORIGIN}/en/">
  <link rel="alternate" hreflang="x-default" href="${ORIGIN}/">
` : ""}  <link rel="alternate" type="application/rss+xml" title="밍글 가이드" href="${ORIGIN}/rss.xml">
  <link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32.png">
  <link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
  <link rel="stylesheet" href="/css/main.css?v=${VER}">
${extra}</head>`;
}

function shell({ head, lang = "ko", active, tab, main, scripts = [] }) {
  return `${head}
<body class="body-pad">

<a class="skip-link" href="#main">${lang === "en" ? "Skip to content" : "본문으로 건너뛰기"}</a>

${header(lang, active)}

${sheet()}

<main id="main">
${main}
</main>

${footer()}

${tabbar(lang, tab)}

${scripts.map((s) => `<script src="${s}?v=${VER}" defer></script>`).join("\n")}
<script src="/js/main.js?v=${VER}" defer></script>
  ${fab(lang)}
</body>
</html>
`;
}

const breadcrumb = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: ORIGIN + url })),
});

const crumbsHtml = (items, lang = "ko") =>
  `<nav class="crumbs" aria-label="${lang === "en" ? "Breadcrumb" : "현재 위치"}">` +
  items.map(([name, url], i) => (i < items.length - 1 ? `<a href="${url}">${esc(name)}</a><span aria-hidden="true">›</span>` : `<span>${esc(name)}</span>`)).join("") +
  `</nav>`;

const faqLd = (faq) =>
  faq.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: mdToText(f.a).replace(/\s*\n\s*/g, " ") },
        })),
      }
    : null;

const faqHtml = (faq) =>
  `<div class="faq">` +
  faq.map((f) => `<details><summary>${esc(f.q)}</summary><div class="a">${mdToHtml(f.a).html}</div></details>`).join("") +
  `</div>`;

/* ============================================================
   가이드 글 읽기
   ============================================================ */
const CAT = {
  visit: { ko: "방문·이용", en: "Visiting", desc: "처음 오는 분을 위한 이용 방법과 동선" },
  study: { ko: "공부·작업", en: "Study & work", desc: "밤늦게까지 공부하고 작업하는 분들을 위해" },
  community: { ko: "동네·커뮤니티", en: "Community", desc: "화양동 이웃, 모임, 언어교환" },
  business: { ko: "창업·제휴", en: "Business", desc: "무인 매장을 준비하는 분과 함께할 분들께" },
};

const IMG = {
  "store-exterior": [1200, 900], "store-kiosk": [1200, 900], "store-fridge": [1200, 900], "store-seat": [1200, 900],
  "store-shelf": [1200, 900], "store-package": [1200, 900], "store-night": [1600, 900],
  "interior-wide": [1500, 900], "night-study": [1200, 800], showcase: [1200, 800], "space-cozy": [1200, 800],
  "space-kiosk": [1200, 800], "space-night": [1200, 800], storefront: [1500, 940], "brand-set": [1200, 800],
  packaging: [1200, 800], drink: [1200, 800], hero: [1500, 1000], fridge: [1200, 800],
};

/* 실제 매장 모습이 아닌 콘셉트 이미지 — 화면에 그렇다고 적어 둡니다 */
const CONCEPT = new Set(["interior-wide", "night-study", "showcase", "space-cozy", "space-kiosk", "space-night", "storefront", "brand-set", "packaging", "drink", "hero", "fridge"]);

function parseGuide(file) {
  const raw = read(file).replace(/\r\n?/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("머리말(---)이 없습니다: " + file);
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  let body = m[2].trim();
  const faq = [];
  const fm = body.match(/\n##\s+(자주 묻는 질문|FAQ|Frequently asked questions)\s*\n([\s\S]*)$/i);
  if (fm) {
    body = body.slice(0, fm.index).trim();
    const chunks = fm[2].split(/\n(?=###\s)/);
    for (const c of chunks) {
      const q = c.match(/^###\s+(.+)\n([\s\S]*)$/);
      if (q && q[2].trim()) faq.push({ q: q[1].trim(), a: q[2].trim() });
    }
  }
  const lang = meta.lang === "en" ? "en" : "ko";
  const text = mdToText(body);
  const minutes = lang === "en"
    ? Math.max(2, Math.round(text.split(/\s+/).length / 200))
    : Math.max(2, Math.round(text.replace(/\s/g, "").length / 450));
  const image = IMG[meta.image] ? meta.image : "store-exterior";
  return {
    slug: meta.slug || path.basename(file, ".md"),
    lang,
    category: CAT[meta.category] ? meta.category : "visit",
    title: meta.title,
    seoTitle: meta.seoTitle || "",
    description: meta.description || text.slice(0, 140),
    keywords: (meta.keywords || "").split(",").map((s) => s.trim()).filter(Boolean),
    date: /^\d{4}-\d{2}-\d{2}$/.test(meta.date || "") ? meta.date : TODAY,
    updated: /^\d{4}-\d{2}-\d{2}$/.test(meta.updated || "") ? meta.updated : (meta.date || TODAY),
    image,
    imageAlt: meta.imageAlt || meta.title,
    related: (meta.related || "").split(",").map((s) => s.trim()).filter(Boolean),
    cta: meta.cta || "store",
    body,
    faq,
    minutes,
    chars: text.replace(/\s/g, "").length,
  };
}

/* ============================================================
   가이드 글 페이지
   ============================================================ */
function ctaBlock(kind, lang) {
  if (lang === "en") {
    const map = {
      global: ["Say hi on the neighborhood board", "Korean or English, both are welcome. Programs are being prepared — tell us what you'd join.", [["/global", "Global page", "primary"], ["/en/visit", "How to visit", "ghost"]]],
      default: ["Mingle Konkuk-Hwayang, open 24/7", "39 Neungdong-ro 13-gil, Gwangjin-gu, Seoul. Card and mobile pay only.", [["/en/visit", "How to visit", "primary"], [NAVER_MAP, "Open in Naver Map", "ghost"]]],
    };
    return map[kind] || map.default;
  }
  const map = {
    store: ["밍글 건대화양점은 지금도 열려 있어요", "서울 광진구 능동로13길 39 · 24시간 · 카드와 간편결제만 받아요.", [["/store", "매장 안내 보기", "primary"], [NAVER_MAP, "네이버 지도로 길찾기", "ghost"]]],
    menu: ["오늘 있는 메뉴부터 확인해 보세요", "품절 표시는 운영자가 매장을 보고 직접 올립니다.", [["/menu", "오늘의 메뉴", "primary"], ["/store", "매장 안내", "ghost"]]],
    community: ["같이 할 사람은 밍글보드에서 찾아요", "동네 소식부터 스터디 멤버 모집까지, 닉네임으로 편하게 남겨 주세요.", [["/community", "밍글보드 가기", "primary"], ["/community#meetups", "모임 보기", "ghost"]]],
    global: ["언어교환에 관심 있다면 손부터 들어 주세요", "Korean Table은 첫 회를 준비 중이에요. 관심을 남겨 주시면 인원이 모이는 대로 날짜를 잡습니다.", [["/global", "글로벌 페이지", "primary"], ["/community#board", "밍글보드에 남기기", "ghost"]]],
    pass: ["오신 날엔 도장 하나", "매장 QR을 찍으면 하루 한 번 적립돼요. 열 개면 음료 한 잔입니다.", [["/pass", "밍글패스 보기", "primary"], ["/store", "매장 안내", "ghost"]]],
    startup: ["창업 상담은 현장을 먼저 봅니다", "예상 수익표 대신 상권과 비용 구조를 같이 계산해 드려요.", [["/startup#inquiry", "창업 상담 신청", "primary"], [KAKAO, "카카오톡으로 묻기", "ghost"]]],
    partner: ["제안은 짧게 보내셔도 괜찮아요", "확인 후 1~2일 안에 답을 드립니다. 첫 미팅은 건대화양점에서 하는 걸 좋아해요.", [["/partner#proposal", "제휴 제안 보내기", "primary"], [KAKAO, "카카오톡으로 묻기", "ghost"]]],
  };
  return map[kind] || map.store;
}

function ctaHtml(kind, lang) {
  const [title, text, btns] = ctaBlock(kind, lang);
  return `<div class="cta-band">
  <div><h2>${esc(title)}</h2><p>${esc(text)}</p></div>
  <div class="chip-row">${btns.map(([href, label, type]) => `<a class="btn btn--${type === "primary" ? "primary" : "ghost"}" href="${href}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ""}>${esc(label)}</a>`).join("")}</div>
</div>`;
}

function gcard(g, opts = {}) {
  const [w, h] = IMG[g.image] || [1200, 900];
  const L = g.lang === "en";
  return `<a class="gcard" href="/guide/${g.slug}"${g.lang === "en" ? ' hreflang="en"' : ""}>
  <span class="gcard__img"><img src="/img/${g.image}.webp" alt="" width="${w}" height="${h}" loading="lazy"></span>
  <span class="gcard__b">
    <span class="gcard__meta"><span class="badge${g.category === "business" ? " badge--navy" : ""}">${L ? "English" : CAT[g.category].ko}</span><span>${L ? g.minutes + " min read" : g.minutes + "분 읽기"}</span></span>
    <h3>${esc(g.title)}</h3>
    ${opts.noDesc ? "" : `<p>${esc(g.description)}</p>`}
  </span>
</a>`;
}

function guidePage(g, all) {
  const L = g.lang === "en";
  const url = `/guide/${g.slug}`;
  const { html, headings } = mdToHtml(g.body);
  const toc = headings.filter((h) => h.level === 2);
  const related = g.related.map((s) => all.find((x) => x.slug === s)).filter(Boolean).slice(0, 3);
  while (related.length < 3) {
    const extra = all.find((x) => x.slug !== g.slug && !related.includes(x) && x.category === g.category && x.lang === g.lang)
      || all.find((x) => x.slug !== g.slug && !related.includes(x));
    if (!extra) break;
    related.push(extra);
  }
  const [w, h] = IMG[g.image];
  const title = (g.seoTitle || g.title) + (L ? " | Mingle" : " | 밍글");
  const crumbs = L
    ? [["Home", "/en/"], ["Guide", "/guide/"], [g.title, url]]
    : [["홈", "/"], ["밍글 가이드", "/guide/"], [CAT[g.category].ko, `/guide/#${g.category}`], [g.title, url]];
  const crumbsLd = L ? crumbs : [["홈", "/"], ["밍글 가이드", "/guide/"], [g.title, url]];

  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: g.title,
      description: g.description,
      image: `${ORIGIN}/img/${g.image}.webp`,
      datePublished: g.date,
      dateModified: g.updated,
      inLanguage: L ? "en" : "ko-KR",
      keywords: g.keywords.join(", "),
      mainEntityOfPage: ORIGIN + url,
      author: { "@type": "Organization", name: "밍글 MINGLE", url: ORIGIN + "/" },
      publisher: { "@type": "Organization", name: "밍글 MINGLE", logo: { "@type": "ImageObject", url: ORIGIN + "/img/logo.png" } },
    },
    breadcrumb(crumbsLd),
    faqLd(g.faq),
  ].filter(Boolean);

  const head = headCommon({
    lang: g.lang,
    title,
    description: g.description,
    canonical: url,
    image: `/img/${g.image}.webp`,
    type: "article",
    alternates: false,
    extra: [
      `  <meta property="article:published_time" content="${g.date}">`,
      `  <meta property="article:modified_time" content="${g.updated}">`,
      g.keywords.length ? `  <meta name="keywords" content="${esc(g.keywords.join(", "))}">` : "",
      ...jsonld.map((o) => "  " + ld(o)),
    ].filter(Boolean).join("\n") + "\n",
  });

  const main = `
<article>
  <header class="article__head">
    <div class="wrap">
      ${crumbsHtml(crumbs, g.lang)}
      <div class="article__meta">
        <span class="badge${g.category === "business" ? " badge--navy" : ""}">${L ? "Guide" : CAT[g.category].ko}</span>
        <span>${L ? "Updated" : "업데이트"} <time datetime="${g.updated}">${g.updated.replace(/-/g, ".")}</time></span>
        <span>${L ? g.minutes + " min read" : g.minutes + "분 읽기"}</span>
      </div>
      <h1>${esc(g.title)}</h1>
      <p class="lead">${esc(g.description)}</p>
    </div>
  </header>

  <div class="wrap">
    <div class="article-layout">
      <aside class="article-aside" aria-label="${L ? "On this page" : "이 글의 순서"}">
        ${toc.length >= 2 ? `<details class="toc" data-open-desktop>
          <summary>${L ? "On this page" : "이 글의 순서"}</summary>
          <ol>${toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join("")}${g.faq.length ? `<li><a href="#faq">${L ? "FAQ" : "자주 묻는 질문"}</a></li>` : ""}</ol>
        </details>` : ""}
        <div class="aside-cta">
          <h3>${L ? "Mingle Konkuk-Hwayang" : "밍글 건대화양점"}</h3>
          <p>${L ? "Open 24/7 · 39 Neungdong-ro 13-gil, Gwangjin-gu" : "24시간 · 서울 광진구 능동로13길 39"}</p>
          <a class="btn btn--primary btn--sm" href="${L ? "/en/visit" : "/store"}">${L ? "How to visit" : "매장 안내"}</a>
        </div>
      </aside>

      <div class="article-main">
        <figure class="figure article__cover">
          <img src="/img/${g.image}.webp" alt="${esc(g.imageAlt)}" width="${w}" height="${h}" fetchpriority="high">
          ${CONCEPT.has(g.image) ? `<figcaption>${L ? "Concept image" : "브랜드 콘셉트 이미지"}</figcaption>` : ""}
        </figure>
        <div class="prose">
${html}
        </div>
${g.faq.length ? `
        <section class="faq-block" id="faq" aria-labelledby="faq-h">
          <h2 id="faq-h">${L ? "FAQ" : "자주 묻는 질문"}</h2>
          ${faqHtml(g.faq)}
        </section>` : ""}

        ${ctaHtml(g.cta, g.lang)}
      </div>
    </div>
  </div>
</article>

<div class="scallop scallop--beige-up" aria-hidden="true" style="margin-top:40px"></div>
<section class="section section--beige" style="padding-top:20px">
  <div class="wrap">
    <div class="row-between">
      <div>
        <span class="eyebrow">${L ? "Keep reading" : "이어서 읽기"}</span>
        <h2 style="margin:0">${L ? "Related guides" : "함께 보면 좋은 글"}</h2>
      </div>
      <a class="btn btn--ghost btn--sm" href="/guide/">${L ? "All guides" : "가이드 전체"}</a>
    </div>
    <div class="grid grid--3" style="margin-top:18px">
${related.map((r) => gcard(r)).join("\n")}
    </div>
  </div>
</section>`;

  return shell({ head, lang: g.lang, active: "guide", main });
}

/* ============================================================
   가이드 모음
   ============================================================ */
function hubPage(all) {
  const ko = all.filter((g) => g.lang === "ko");
  const en = all.filter((g) => g.lang === "en");
  const order = ["visit", "study", "community", "business"];
  const featured = ["kondae-24h-cafe", "kondae-study-cafe", "how-to-use-unmanned-cafe", "unmanned-cafe-startup-cost"]
    .map((s) => all.find((g) => g.slug === s)).filter(Boolean);

  const head = headCommon({
    title: "밍글 가이드 | 건대 24시간 카페 이용부터 무인카페 창업까지",
    description: "건대·화양동 24시간 무인 디저트카페 밍글이 직접 운영하며 정리한 가이드. 카공 자리 고르기, 무인카페 이용 방법, 언어교환, 무인카페 창업 비용과 상권까지 한곳에 모았습니다.",
    canonical: "/guide/",
    image: "/img/store-night.webp",
    extra: [
      "  " + ld({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "밍글 가이드",
        url: ORIGIN + "/guide/",
        inLanguage: "ko-KR",
        mainEntity: {
          "@type": "ItemList",
          itemListElement: all.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: `${ORIGIN}/guide/${g.slug}`, name: g.title })),
        },
      }),
      "  " + ld(breadcrumb([["홈", "/"], ["밍글 가이드", "/guide/"]])),
    ].join("\n") + "\n",
  });

  const main = `
<section class="hub-hero">
  <div class="wrap">
    ${crumbsHtml([["홈", "/"], ["밍글 가이드", "/guide/"]])}
    <span class="eyebrow">Mingle Guide</span>
    <h1>밍글 가이드</h1>
    <p class="lead">새벽까지 머물 곳을 찾는 분, 무인카페가 처음인 분, 무인 매장을 차려 볼까 고민하는 분. 건대화양점을 직접 운영하면서 자주 받은 질문과 알게 된 것들을 글로 정리했습니다.</p>
    <div class="chip-row" style="margin-top:16px">
${order.map((c) => `      <a class="chip" href="#${c}">${CAT[c].ko}</a>`).join("\n")}
      <a class="chip" href="#english">English</a>
      <a class="chip" href="/faq">자주 묻는 질문</a>
    </div>
  </div>
</section>

<section class="section" style="padding-top:28px">
  <div class="wrap">
    <div class="hub-section">
      <div class="hub-section__head"><h2>먼저 읽어 보세요</h2><p>가장 많이 묻는 네 가지</p></div>
      <div class="home-guides">
${featured.map((g) => gcard(g, { noDesc: true })).join("\n")}
      </div>
    </div>
${order.map((c) => {
  const list = ko.filter((g) => g.category === c);
  if (!list.length) return "";
  return `
    <div class="hub-section" id="${c}">
      <div class="hub-section__head"><h2>${CAT[c].ko}</h2><p>${CAT[c].desc}</p></div>
      <div class="grid grid--3">
${list.map((g) => gcard(g)).join("\n")}
      </div>
    </div>`;
}).join("")}
${en.length ? `
    <div class="hub-section" id="english" lang="en">
      <div class="hub-section__head"><h2>English guides</h2><p>For international students and visitors around Konkuk University</p></div>
      <div class="grid grid--3">
${en.map((g) => gcard(g)).join("\n")}
      </div>
    </div>` : ""}
  </div>
</section>

<section class="section section--beige">
  <div class="wrap two-col">
    <div>
      <span class="eyebrow">FAQ</span>
      <h2>짧게 궁금한 건 여기서</h2>
      <p>결제 방법, 콘센트 자리, 밍글패스 도장, 창업 상담 방식까지. 글로 쓰기엔 짧은 질문들은 자주 묻는 질문에 모아 두었어요.</p>
      <a class="btn btn--primary" href="/faq">자주 묻는 질문 보기</a>
    </div>
    <div>
      <span class="eyebrow">News</span>
      <h2>매장 소식은 따로 올려요</h2>
      <p>기기 점검, 새로 들어온 디저트, 모임 일정처럼 날짜가 있는 이야기는 밍글 소식에서 확인해 주세요.</p>
      <a class="btn btn--ghost" href="/news/">밍글 소식 보기</a>
    </div>
  </div>
</section>`;

  return shell({ head, active: "guide", main });
}

/* ============================================================
   자주 묻는 질문
   ============================================================ */
function faqPage() {
  const raw = read(path.join(ROOT, "content/faq.md")).replace(/\r\n?/g, "\n");
  const groups = [];
  for (const block of raw.split(/\n(?=##\s)/)) {
    const m = block.match(/^##\s+(.+)\n([\s\S]*)$/);
    if (!m) continue;
    const items = [];
    for (const c of m[2].split(/\n(?=###\s)/)) {
      const q = c.match(/^###\s+(.+)\n([\s\S]*)$/);
      if (q && q[2].trim()) items.push({ q: q[1].trim(), a: q[2].trim() });
    }
    groups.push({ title: m[1].trim(), id: "faq-" + (groups.length + 1), items });
  }
  const all = groups.flatMap((g) => g.items);

  const head = headCommon({
    title: "자주 묻는 질문 | 밍글 건대화양점 24시간 무인카페",
    description: "밍글 건대화양점 이용, 결제, 콘센트 자리, 메뉴와 품절, 밍글보드·모임, 밍글패스 도장, 창업·제휴 상담까지 자주 받는 질문에 답했습니다.",
    canonical: "/faq",
    image: "/img/store-seat.webp",
    extra: "  " + ld(faqLd(all)) + "\n  " + ld(breadcrumb([["홈", "/"], ["자주 묻는 질문", "/faq"]])) + "\n",
  });

  const main = `
<section class="page-head">
  <div class="wrap">
    ${crumbsHtml([["홈", "/"], ["자주 묻는 질문", "/faq"]])}
    <span class="eyebrow">FAQ</span>
    <h1>자주 묻는 질문</h1>
    <p>무인 매장이라 직원에게 바로 물어볼 수 없으니, 자주 받는 질문을 먼저 모아 두었어요. 여기 없는 건 카카오톡으로 편하게 물어봐 주세요.</p>
  </div>
</section>
<div class="faq-nav">
  <div class="wrap">
    <div class="chip-row">
${groups.map((g) => `      <a class="chip" href="#${g.id}">${esc(g.title)}</a>`).join("\n")}
    </div>
  </div>
</div>
<section class="section" style="padding-top:30px">
  <div class="wrap" style="max-width:860px">
${groups.map((g) => `    <div class="faq-group" id="${g.id}">
      <h2>${esc(g.title)}</h2>
      ${faqHtml(g.items)}
    </div>`).join("\n")}
  </div>
</section>
<section class="section section--beige">
  <div class="wrap">
    <div class="ask-box" style="max-width:780px;margin:0 auto;text-align:center;justify-items:center">
      <span class="eyebrow">고객센터</span>
      <h3 style="font-size:1.3rem">찾는 답이 없나요?</h3>
      <p style="max-width:520px">매장 이용, 커뮤니티, 창업·제휴까지 카카오톡 채널 하나로 받고 있어요. 무인 매장이라 전화는 어렵지만, 확인하는 대로 답을 드립니다.</p>
      <div><a class="btn btn--kakao" href="${KAKAO}" target="_blank" rel="noopener">${ICON.kakao}카카오톡으로 문의하기</a></div>
      <p class="small" style="margin:0">자세한 이야기는 <a href="/guide/">밍글 가이드</a>에도 정리돼 있어요.</p>
    </div>
  </div>
</section>`;

  return { html: shell({ head, active: "guide", main }), count: all.length };
}

/* ============================================================
   소식 페이지 틀 (functions/news 가 <!--HEAD--> <!--MAIN--> 을 채웁니다)
   ============================================================ */
function newsTemplate() {
  const head = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!--HEAD-->
  <meta name="theme-color" content="#FFFFFF">
  <link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32.png">
  <link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
  <link rel="stylesheet" href="/css/main.css?v=${VER}">
</head>`;
  return shell({ head, active: null, main: "<!--MAIN-->" });
}

/* ============================================================
   기존 페이지 정리
   ============================================================ */
function activeFor(rel) {
  const p = rel.replace(/\\/g, "/");
  const nav =
    p === "menu.html" ? "menu" :
    p === "community.html" ? "community" :
    p === "global.html" ? "global" :
    p === "store.html" ? "store" :
    p === "startup.html" || p === "partner.html" ? "startup" :
    p.startsWith("guide/") || p === "faq.html" ? "guide" :
    p === "en/community.html" ? "community" :
    p === "en/visit.html" ? "store" :
    p === "en/business.html" ? "startup" : null;
  const tab =
    p === "index.html" ? "home" :
    p === "menu.html" ? "menu" :
    p === "community.html" ? "community" :
    p === "pass.html" || p === "account/me.html" ? "pass" : null;
  return { nav, tab };
}

/** .html 주소를 확장자 없는 주소로 */
function cleanLinks(s) {
  // href="/x.html" / href="/x.html#a" / href="/x.html?b"  (사이트 안 경로만)
  s = s.replace(/(href|action)="(\/(?!\/)[^"#?]*?)(?:\/index)?\.html([#?][^"]*)?"/g, (m, attr, p, rest) => {
    const clean = p === "" ? "/" : p;
    return `${attr}="${clean}${rest || ""}"`;
  });
  // 정식 주소·공유 주소
  s = s.replace(new RegExp(`(${ORIGIN.replace(/\./g, "\\.")}/[^"\\s<]*?)(?:/index)?\\.html`, "g"), "$1");
  return s;
}

function syncPage(file) {
  const rel = path.relative(SITE, file);
  let s = read(file);
  const before = s;
  const lang = rel.startsWith("en" + path.sep) ? "en" : "ko";
  const { nav, tab } = activeFor(rel);

  const swap = (re, next, label) => {
    if (!re.test(s)) { log(`(건너뜀) ${rel}: ${label} 없음`); return; }
    s = s.replace(re, () => next);
  };
  swap(/<header class="site-header">[\s\S]*?<\/header>/, header(lang, nav), "헤더");
  swap(/<div class="sheet"[\s\S]*?<\/nav>[\s\S]*?<\/div>\n<\/div>/, sheet(), "모바일 메뉴");
  swap(/<footer class="site-footer">[\s\S]*?<\/footer>/, footer(), "푸터");
  swap(/<nav class="tabbar"[\s\S]*?<\/nav>/, tabbar(lang, tab), "하단 탭");

  s = cleanLinks(s);
  s = s.replace(/\?v=\d{8}[a-z]?/g, `?v=${VER}`);

  /* 구조화 데이터가 하나도 없는 공개 페이지에는 현재 위치(BreadcrumbList)를 붙입니다 */
  const robotsMeta = (s.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || "";
  const canon = (s.match(/<link rel="canonical" href="https:\/\/hellomingle\.kr([^"]*)"/) || [])[1];
  if (!s.includes("application/ld+json") && canon && canon !== "/" && canon !== "/en/" && !/noindex/.test(robotsMeta)) {
    const t = ((s.match(/<title>([^<]*)<\/title>/) || [])[1] || "").split(/\s[|—–-]\s/)[0].trim();
    if (t) {
      const items = lang === "en" ? [["Home", "/en/"], [t, canon]] : [["홈", "/"], [t, canon]];
      s = s.replace("</head>", `  ${ld(breadcrumb(items))}\n</head>`);
    }
  }

  if (s !== before || withVerify(s) !== s) write(file, s);
  return rel;
}

/* ---------- 페이지 안 가이드 카드 자리 채우기 ----------
   기존 페이지에 <!--GUIDES:slug1,slug2,slug3--> ... <!--/GUIDES--> 를 두면
   그 사이를 가이드 카드로 채웁니다. 글이 없으면 그 카드는 건너뜁니다. */
function fillGuideSlots(guides) {
  let n = 0;
  for (const f of walk(SITE)) {
    let s = read(f);
    if (!s.includes("<!--GUIDES:")) continue;
    const next = s.replace(/<!--GUIDES:([^>]*?)-->[\s\S]*?<!--\/GUIDES-->/g, (m, list) => {
      const picks = list.split(",").map((x) => guides.find((g) => g.slug === x.trim())).filter(Boolean);
      n++;
      return `<!--GUIDES:${list}-->\n${picks.map((g) => gcard(g, { noDesc: picks.length > 3 })).join("\n")}\n<!--/GUIDES-->`;
    });
    if (next !== s) write(f, next);
  }
  return n;
}

/* ---------- 메뉴 미리 그리기 ---------- */
function loadDefaultMenu() {
  const code = read(path.join(SITE, "js/menu-data.js"));
  const ctx = { window: {} };
  vm.runInNewContext(code, ctx);
  return ctx.window.MINGLE_MENU;
}

function prerenderMenu() {
  const file = path.join(SITE, "menu.html");
  let s = read(file);
  const menu = loadDefaultMenu();
  const markup = menuHtml(menu);
  const re = /(<div data-menu[^>]*>)[\s\S]*?(<\/div>\s*<div class="notice notice--gray")/;
  if (!re.test(s)) { log("(건너뜀) menu.html: data-menu 영역 없음"); return; }
  s = s.replace(re, (m, open, close) => `${open}\n${markup}\n    ${close}`);
  write(file, s);
  log(`메뉴 미리 그림: ${menu.groups.reduce((n, g) => n + g.items.length, 0)}개`);
}

/* ============================================================
   사이트맵 · RSS · robots
   ============================================================ */
function sitemap(guides) {
  const fixed = [
    ["/", "1.0"], ["/menu", "0.9"], ["/store", "0.9"], ["/community", "0.8"], ["/guide/", "0.9"],
    ["/faq", "0.8"], ["/global", "0.7"], ["/pass", "0.6"], ["/brand", "0.6"], ["/startup", "0.8"],
    ["/partner", "0.7"], ["/en/", "0.7"], ["/en/visit", "0.6"], ["/en/community", "0.5"], ["/en/business", "0.5"],
    ["/legal/community", "0.3"], ["/legal/terms", "0.2"], ["/legal/privacy", "0.2"],
  ];
  const urls = [
    ...fixed.map(([u, p]) => `  <url><loc>${ORIGIN}${u}</loc><lastmod>${TODAY}</lastmod><priority>${p}</priority></url>`),
    ...guides.map((g) => `  <url><loc>${ORIGIN}/guide/${g.slug}</loc><lastmod>${g.updated}</lastmod><priority>${g.lang === "en" ? "0.6" : "0.7"}</priority></url>`),
  ];
  write(path.join(SITE, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`);
  return urls.length;
}

function rss(guides) {
  const items = guides.filter((g) => g.lang === "ko").sort((a, b) => (a.updated < b.updated ? 1 : -1));
  const rfc = (d) => new Date(d + "T09:00:00+09:00").toUTCString();
  write(path.join(SITE, "rss.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>밍글 가이드</title>
<link>${ORIGIN}/guide/</link>
<description>건대·화양동 24시간 무인 디저트카페 밍글이 정리한 이용 가이드와 무인카페 창업·제휴 이야기</description>
<language>ko</language>
<lastBuildDate>${rfc(TODAY)}</lastBuildDate>
<atom:link href="${ORIGIN}/rss.xml" rel="self" type="application/rss+xml"/>
${items.map((g) => `<item><title>${esc(g.title)}</title><link>${ORIGIN}/guide/${g.slug}</link><guid isPermaLink="true">${ORIGIN}/guide/${g.slug}</guid><pubDate>${rfc(g.date)}</pubDate><category>${esc(CAT[g.category].ko)}</category><description>${esc(g.description)}</description></item>`).join("\n")}
</channel>
</rss>
`);
}

function robots() {
  write(path.join(SITE, "robots.txt"), `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Disallow: /account/
Disallow: /go/
Disallow: /_tpl/

Sitemap: ${ORIGIN}/sitemap.xml
Sitemap: ${ORIGIN}/news/sitemap.xml
`);
}

/* ============================================================
   실행
   ============================================================ */
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (f.name.endsWith(".html")) out.push(p);
  }
  return out;
}

function main() {
  console.log("밍글 빌드 시작");

  // 1) 가이드
  const dir = path.join(ROOT, "content/guides");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : [];
  const guides = files.map((f) => parseGuide(path.join(dir, f)));
  const order = ["visit", "study", "community", "business"];
  guides.sort((a, b) => (a.lang === b.lang ? 0 : a.lang === "ko" ? -1 : 1) || order.indexOf(a.category) - order.indexOf(b.category));

  const gdir = path.join(SITE, "guide");
  if (fs.existsSync(gdir)) for (const f of fs.readdirSync(gdir)) if (f.endsWith(".html")) fs.unlinkSync(path.join(gdir, f));
  for (const g of guides) {
    if (!g.title) throw new Error("제목이 없습니다: " + g.slug);
    write(path.join(gdir, `${g.slug}.html`), cleanLinks(guidePage(g, guides)));
  }
  write(path.join(gdir, "index.html"), cleanLinks(hubPage(guides)));
  log(`가이드 ${guides.length}편 + 모음 페이지`);

  // 2) 자주 묻는 질문
  const faq = faqPage();
  write(path.join(SITE, "faq.html"), cleanLinks(faq.html));
  log(`자주 묻는 질문 ${faq.count}개`);

  // 3) 소식 틀, 관리자 미리보기용 마크다운 변환기
  write(path.join(SITE, "_tpl/news.html"), newsTemplate());
  write(path.join(SITE, "js/md.js"), "/* 자동 생성 — 원본은 lib/md.js 입니다. 여기서 고치지 마세요. */\n" + read(path.join(ROOT, "lib/md.js")));

  // 4) 기존 페이지 머리·꼬리 맞추기 (관리자·새로 만든 페이지 제외)
  const skip = new Set(["admin/index.html", "faq.html", "_tpl/news.html"].map((p) => path.join(SITE, p)));
  let synced = 0;
  for (const f of walk(SITE)) {
    if (skip.has(f) || f.startsWith(gdir + path.sep)) continue;
    syncPage(f);
    synced++;
  }
  log(`기존 페이지 ${synced}개 머리·꼬리 정리`);

  // 5) 메뉴, 가이드 카드 자리
  prerenderMenu();
  log(`가이드 카드 자리 ${fillGuideSlots(guides)}곳 채움`);

  // 6) 사이트맵 · RSS · robots
  const n = sitemap(guides);
  rss(guides);
  robots();
  log(`sitemap.xml ${n}개 주소, rss.xml, robots.txt`);

  // 점검용 요약
  const short = guides.filter((g) => (g.lang === "ko" ? g.chars < 1500 : false));
  if (short.length) log("짧은 글:", short.map((g) => `${g.slug}(${g.chars}자)`).join(", "));
  console.log("완료");
}

main();
