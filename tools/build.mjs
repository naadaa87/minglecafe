#!/usr/bin/env node
/* ============================================================
   밍글 홈페이지 빌드 스크립트
   실행: node tools/build.mjs   (저장소 맨 위 폴더에서, 설치할 것 없음)

   하는 일
   1) content/guides/*.md  →  site/guide/<slug>.html  (가이드 글, 한국어·영어·중국어·일본어)
   2) 가이드 모음(site/guide/index.html), 자주 묻는 질문(site/faq.html),
      용어 사전(site/glossary.html), 밍글 한눈에 보기(site/about.html), 사이트 검색(site/search.html)
   3) 소식 페이지용 머리·꼬리 틀(site/_tpl/news.html)
   4) 모든 페이지의 머리(헤더)·메뉴·푸터·하단 탭을 같은 모양으로 맞춤
      + 내부 링크를 확장자 없는 주소로 정리(/store.html → /store)
      + CSS·JS 캐시 버전 갱신
      + 페이지별 구조화 데이터(JSON-LD), 언어별 주소(hreflang), 공유 이미지(1200×630) 정리
   5) 메뉴 페이지에 기본 메뉴를 HTML로 미리 그려 둠(검색엔진용)
   6) sitemap.xml(이미지 포함), rss.xml, robots.txt(AI 검색 로봇 허용)
   7) AI 검색·챗봇용 요약: llms.txt, llms-full.txt, /llms/*.md
   8) 사이트 검색용 색인(search-index.json), IndexNow 열쇠 파일

   Cloudflare 배포에는 빌드가 필요 없습니다. 이 스크립트로 만든 결과(site/)를 그대로 올립니다.
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { mdToHtml, mdToText, esc } from "../lib/md.js";
import { menuHtml, STATIC_VERIFICATION } from "../lib/cms.js";
import { STORE, ORG_ID, STORE_ID, SITE_ID, orgLd, siteLd, storeLd, menuLd, INDEXNOW_KEY } from "../lib/seo.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const ORIGIN = "https://hellomingle.kr";
const VER = "20261127";
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const KAKAO = "http://pf.kakao.com/_AxgYMn/friend";
const NAVER_MAP = STORE.naverMap;
const KAKAO_MAP = STORE.kakaoMap;
const GOOGLE_MAP = STORE.googleMap;

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
const ld = (o, id) => `<script type="application/ld+json"${id ? ` id="${id}"` : ""}>${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
const log = (...a) => console.log("  ·", ...a);
const oneLine = (s) => String(s || "").replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
const stripTags = (s) => oneLine(String(s || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " "));

/* ============================================================
   언어
   ============================================================ */
const LANGS = {
  ko: { html: "ko", og: "ko_KR", hreflang: "ko", ld: "ko-KR", name: "한국어" },
  en: { html: "en", og: "en_US", hreflang: "en", ld: "en", name: "English" },
  zh: { html: "zh-Hans", og: "zh_CN", hreflang: "zh-Hans", ld: "zh-Hans", name: "中文" },
  ja: { html: "ja", og: "ja_JP", hreflang: "ja", ld: "ja", name: "日本語" },
};

/* 가이드 글 화면에 쓰는 말 */
const T = {
  ko: {
    home: ["홈", "/"], guide: "밍글 가이드", updated: "업데이트", min: (m) => `${m}분 읽기`,
    toc: "이 글의 순서", faq: "자주 묻는 질문", answer: "한눈에 보기", concept: "브랜드 콘셉트 이미지",
    by: "글 · 밍글 운영팀", byNote: "건대화양점을 직접 운영하며 확인한 내용으로 씁니다.", aboutHref: "/about", aboutLabel: "밍글 소개",
    keep: "이어서 읽기", related: "함께 보면 좋은 글", all: "가이드 전체", other: "다른 언어로 읽기",
    asideT: "밍글 건대화양점", asideP: "24시간 · 서울 광진구 능동로13길 39", asideB: "매장 안내", asideHref: "/store",
    suffix: " | 밍글", crumb: "현재 위치", skip: "본문으로 건너뛰기",
  },
  en: {
    home: ["Home", "/en/"], guide: "Guide", updated: "Updated", min: (m) => `${m} min read`,
    toc: "On this page", faq: "FAQ", answer: "Quick answer", concept: "Concept image",
    by: "By the Mingle team", byNote: "Written from running the Konkuk-Hwayang store ourselves.", aboutHref: "/about#in-english", aboutLabel: "About Mingle",
    keep: "Keep reading", related: "Related guides", all: "All guides", other: "Read in another language",
    asideT: "Mingle Konkuk-Hwayang", asideP: "Open 24/7 · 39 Neungdong-ro 13-gil, Gwangjin-gu", asideB: "How to visit", asideHref: "/en/visit",
    suffix: " | Mingle", crumb: "Breadcrumb", skip: "Skip to content",
  },
  zh: {
    home: ["首页", "/en/"], guide: "指南", updated: "更新", min: (m) => `阅读约 ${m} 分钟`,
    toc: "本文目录", faq: "常见问题", answer: "要点速览", concept: "概念图",
    by: "撰文：Mingle 运营团队", byNote: "内容来自我们亲自运营建大华阳店的经验。", aboutHref: "/about#in-english", aboutLabel: "关于 Mingle（英文）",
    keep: "继续阅读", related: "相关指南", all: "全部指南", other: "其他语言版本",
    asideT: "Mingle 建大华阳店", asideP: "24小时营业 · 39 Neungdong-ro 13-gil, Gwangjin-gu", asideB: "到店指南（英文）", asideHref: "/en/visit",
    suffix: " | Mingle", crumb: "当前位置", skip: "Skip to content",
  },
  ja: {
    home: ["ホーム", "/en/"], guide: "ガイド", updated: "更新", min: (m) => `約${m}分で読めます`,
    toc: "目次", faq: "よくある質問", answer: "ポイント", concept: "コンセプトイメージ",
    by: "文：Mingle 運営チーム", byNote: "建大華陽店を自分たちで運営して確かめた内容をもとに書いています。", aboutHref: "/about#in-english", aboutLabel: "Mingleについて（英語）",
    keep: "続けて読む", related: "関連ガイド", all: "ガイド一覧", other: "他の言語で読む",
    asideT: "Mingle 建大華陽店", asideP: "24時間営業 · 39 Neungdong-ro 13-gil, Gwangjin-gu", asideB: "ご利用案内（英語）", asideHref: "/en/visit",
    suffix: " | Mingle", crumb: "現在位置", skip: "Skip to content",
  },
};

/* 서로 같은 내용을 다른 언어로 쓴 페이지 묶음 — 검색엔진이 언어에 맞는 페이지를 보여 주도록 알려 줍니다 */
const PAGE_ALTS = [
  { ko: "/", en: "/en/" },
  { ko: "/store", en: "/en/visit" },
  { ko: "/community", en: "/en/community" },
  { ko: "/startup", en: "/en/business" },
];
const GUIDE_ALTS = [
  { ko: "kondae-24h-cafe", en: "en-konkuk-24h-cafe", zh: "zh-konkuk-24h-cafe", ja: "ja-konkuk-24h-cafe" },
  { ko: "how-to-use-unmanned-cafe", en: "en-unmanned-cafe-korea" },
];

/** [[hreflang, 경로], ...] — 묶음에 없는 페이지는 null */
function alternatesFor(pathname, exists = () => true) {
  const sets = [
    ...PAGE_ALTS,
    ...GUIDE_ALTS.map((g) => Object.fromEntries(Object.entries(g).filter(([, slug]) => exists(slug)).map(([l, slug]) => [l, `/guide/${slug}`]))),
  ];
  const set = sets.find((s) => Object.values(s).includes(pathname));
  if (!set || Object.keys(set).length < 2) return null;
  const list = Object.entries(set).map(([l, p]) => [LANGS[l].hreflang, p]);
  list.push(["x-default", set.ko || set.en]);
  return list;
}

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
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>`,
};

const cur = (on) => (on ? ' aria-current="page"' : "");

function header(lang, active) {
  const foreign = lang !== "ko";
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
    <a class="logo" href="${foreign ? "/en/" : "/"}" aria-label="${foreign ? "Mingle home" : "밍글 홈으로"}">
      <img src="/img/logo.png?v=${VER}" alt="Mingle 밍글" width="106" height="50">
    </a>
    <nav class="gnb" aria-label="${foreign ? "Main menu" : "주요 메뉴"}">
${nav.map(([k, h, t]) => `      <a href="${h}"${cur(active === k)}>${t}</a>`).join("\n")}
    </nav>
    <div class="header-cta">
      <a class="icon-btn" href="/search" aria-label="${foreign ? "Search" : "검색"}">${ICON.search}</a>
      <a class="lang-btn" href="${foreign ? "/" : "/en/"}">${foreign ? "KO" : "EN"}</a>
      <a class="btn btn--ghost btn--sm" data-auth-link href="/account/login">로그인</a>
      <a class="btn btn--primary btn--sm" href="/pass">밍글패스</a>
    </div>
    <button class="menu-btn" aria-label="${foreign ? "Open menu" : "메뉴 열기"}" aria-expanded="false">
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
      <a href="/about">밍글 한눈에 보기</a>
      <a href="/brand">브랜드 이야기</a>
      <a href="/startup">창업 안내</a>
      <a href="/partner">제휴 · 협업</a>
      <a href="/search">검색</a>
    </nav>
    <a class="btn btn--ghost" data-auth-link href="/account/login">로그인 · 회원가입</a>
    <a class="btn btn--primary" href="/store">오늘 밍글 가기</a>
    <p class="small" style="margin-top:16px">
      <a href="/en/">English</a> · <a href="/glossary">용어 사전</a> · <a href="/legal/community">커뮤니티 가이드</a>
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
          <li><a href="/about">밍글 한눈에 보기</a></li>
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
          <li><a href="/glossary">용어 사전</a></li>
          <li><a href="/search">검색</a></li>
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
  return `<nav class="tabbar" aria-label="${lang !== "ko" ? "Quick menu" : "빠른 메뉴"}">
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
  `<a class="kakao-fab" href="${KAKAO}" target="_blank" rel="noopener" aria-label="${lang !== "ko" ? "Ask us on KakaoTalk" : "카카오톡으로 문의하기"}">${ICON.kakao}<span class="kakao-fab__txt">${lang !== "ko" ? "Ask us" : "문의하기"}</span></a>`;

/* ---------- 이미지 ---------- */
const IMG = {
  "store-exterior": [1200, 900], "store-kiosk": [1200, 900], "store-fridge": [1200, 900], "store-seat": [1200, 900],
  "store-shelf": [1200, 900], "store-package": [1200, 900], "store-night": [1600, 900],
  "interior-wide": [1500, 900], "night-study": [1200, 800], showcase: [1200, 800], "space-cozy": [1200, 800],
  "space-kiosk": [1200, 800], "space-night": [1200, 800], storefront: [1500, 940], "brand-set": [1200, 800],
  packaging: [1200, 800], drink: [1200, 800], hero: [1500, 1000], fridge: [1200, 800],
};

/* 실제 매장 모습이 아닌 콘셉트 이미지 — 화면에 그렇다고 적어 둡니다 */
const CONCEPT = new Set(["interior-wide", "night-study", "showcase", "space-cozy", "space-kiosk", "space-night", "storefront", "brand-set", "packaging", "drink", "hero", "fridge"]);

/* 공유용 이미지(1200×630 JPG) — 카카오톡·네이버·페이스북은 WebP를 못 읽는 경우가 있어 따로 둡니다 */
const ogOf = (name) => (fs.existsSync(path.join(SITE, "img/og", name + ".jpg")) ? `/img/og/${name}.jpg` : null);

function headCommon({ lang = "ko", title, description, canonical, image = "store-exterior", imageAlt = "", type = "website", robots, alternates = null, mdAlt = "", extra = "" }) {
  const L = LANGS[lang] || LANGS.ko;
  const og = ogOf(image);
  const imgUrl = ORIGIN + (og || `/img/${image}.webp`);
  const [iw, ih] = og ? [1200, 630] : IMG[image] || [1200, 900];
  return `<!doctype html>
<html lang="${L.html}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${ORIGIN}${canonical}">
  <meta name="robots" content="${robots || "index, follow, max-image-preview:large, max-snippet:-1"}">
  <meta property="og:site_name" content="MINGLE 밍글">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="${type}">
  <meta property="og:url" content="${ORIGIN}${canonical}">
  <meta property="og:image" content="${imgUrl}">
  <meta property="og:image:width" content="${iw}">
  <meta property="og:image:height" content="${ih}">
${imageAlt ? `  <meta property="og:image:alt" content="${esc(imageAlt)}">\n` : ""}  <meta property="og:locale" content="${L.og}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${imgUrl}">
  <meta name="theme-color" content="#FFFFFF">
${(alternates || []).map(([h, p]) => `  <link rel="alternate" hreflang="${h}" href="${ORIGIN}${p}">\n`).join("")}${mdAlt ? `  <link rel="alternate" type="text/markdown" href="${ORIGIN}${mdAlt}">\n` : ""}  <link rel="alternate" type="application/rss+xml" title="밍글 가이드" href="${ORIGIN}/rss.xml">
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

<a class="skip-link" href="#main">${(T[lang] || T.ko).skip}</a>

${header(lang, active)}

${sheet()}

<main id="main">
${main}
</main>

${footer()}

${tabbar(lang, tab)}

${scripts.map((s) => `<script src="${s}?v=${VER}" defer></script>`).join("\n")}
<script src="/js/track.js?v=${VER}" defer></script>
<script src="/js/main.js?v=${VER}" defer></script>
  ${fab(lang)}
<script defer src="https://choisijun.com/k1.js" integrity="sha384-E7Xl7wiU1vNu5AUY41kJB1uV52L+UEvqwYRzRj4zdaBGAeyRfCll926ETRo39Jm6" crossorigin="anonymous"></script>
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
  `<nav class="crumbs" aria-label="${(T[lang] || T.ko).crumb}">` +
  items.map(([name, url], i) => (i < items.length - 1 ? `<a href="${url}">${esc(name)}</a><span aria-hidden="true">›</span>` : `<span>${esc(name)}</span>`)).join("") +
  `</nav>`;

const faqLd = (faq, extra = {}) =>
  faq.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        ...extra,
        mainEntity: faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: oneLine(mdToText(f.a)) },
        })),
      }
    : null;

const faqHtml = (faq, attrs = "", idPrefix = "") =>
  `<div class="faq"${attrs}>` +
  faq.map((f, i) => `<details${idPrefix ? ` id="${idPrefix}${i + 1}"` : ""}><summary>${esc(f.q)}</summary><div class="a">${mdToHtml(f.a).html}</div></details>`).join("") +
  `</div>`;

/** 사이트 안 검색 상자 (검색 페이지로 넘어갑니다) */
const searchForm = (placeholder = "궁금한 것을 검색해 보세요", value = "") =>
  `<form class="search-form" action="/search" method="get" role="search">
      <label class="sr-only" for="q">검색어</label>
      <input id="q" name="q" type="search" placeholder="${esc(placeholder)}" value="${esc(value)}" autocomplete="off" enterkeyhint="search">
      <button class="btn btn--primary" type="submit">${ICON.search}<span>검색</span></button>
    </form>`;

/* ============================================================
   가이드 글 읽기
   ============================================================ */
const CAT = {
  visit: { ko: "방문·이용", en: "Visiting", desc: "처음 오는 분을 위한 이용 방법과 동선" },
  study: { ko: "공부·작업", en: "Study & work", desc: "밤늦게까지 공부하고 작업하는 분들을 위해" },
  community: { ko: "동네·커뮤니티", en: "Community", desc: "화양동 이웃, 모임, 언어교환" },
  business: { ko: "창업·제휴", en: "Business", desc: "무인 매장을 준비하는 분과 함께할 분들께" },
};
const CAT_ORDER = ["visit", "study", "community", "business"];
const LANG_ORDER = ["ko", "en", "zh", "ja"];

const FAQ_HEAD = /\n##\s+(자주 묻는 질문|FAQ|Frequently asked questions|常见问题|よくある質問)\s*\n([\s\S]*)$/i;

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
  const fm = ("\n" + body).match(FAQ_HEAD);
  if (fm) {
    body = ("\n" + body).slice(0, fm.index).trim();
    const chunks = fm[2].split(/\n(?=###\s)/);
    for (const c of chunks) {
      const q = c.match(/^###\s+(.+)\n([\s\S]*)$/);
      if (q && q[2].trim()) faq.push({ q: q[1].trim(), a: q[2].trim() });
    }
  }
  const lang = LANGS[meta.lang] ? meta.lang : "ko";
  const text = mdToText(body);
  const minutes = lang === "en"
    ? Math.max(2, Math.round(text.split(/\s+/).length / 200))
    : Math.max(2, Math.round(text.replace(/\s/g, "").length / 450));
  const image = IMG[meta.image] ? meta.image : "store-exterior";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(meta.date || "") ? meta.date : TODAY;
  return {
    slug: meta.slug || path.basename(file, ".md"),
    lang,
    category: CAT[meta.category] ? meta.category : "visit",
    title: meta.title,
    seoTitle: meta.seoTitle || "",
    description: meta.description || text.slice(0, 140),
    answer: meta.answer || "",
    points: (meta.points || "").split(/\s+\|\s+/).map((s) => s.trim()).filter(Boolean),
    keywords: (meta.keywords || "").split(",").map((s) => s.trim()).filter(Boolean),
    date,
    updated: /^\d{4}-\d{2}-\d{2}$/.test(meta.updated || "") && meta.updated >= date ? meta.updated : date,
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
  if (lang === "zh") {
    return ["Mingle 建大华阳店，24小时营业", "地址：39 Neungdong-ro 13-gil, Gwangjin-gu, Seoul（首尔广津区）。仅支持刷卡和手机支付。", [["/en/visit", "到店指南（英文）", "primary"], [GOOGLE_MAP, "在 Google 地图中打开", "ghost"]]];
  }
  if (lang === "ja") {
    return ["Mingle 建大華陽店は24時間営業です", "住所：39 Neungdong-ro 13-gil, Gwangjin-gu, Seoul（ソウル特別市広津区）。お支払いはカードとモバイル決済のみです。", [["/en/visit", "ご利用案内（英語）", "primary"], [GOOGLE_MAP, "Google マップで開く", "ghost"]]];
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
  const foreign = g.lang !== "ko";
  return `<a class="gcard" href="/guide/${g.slug}"${foreign ? ` hreflang="${LANGS[g.lang].hreflang}" lang="${LANGS[g.lang].html}"` : ""}>
  <span class="gcard__img"><img src="/img/${g.image}.webp" alt="" width="${w}" height="${h}" loading="lazy"></span>
  <span class="gcard__b">
    <span class="gcard__meta"><span class="badge${g.category === "business" ? " badge--navy" : ""}">${foreign ? LANGS[g.lang].name : CAT[g.category].ko}</span><span>${T[g.lang].min(g.minutes)}</span></span>
    <h3>${esc(g.title)}</h3>
    ${opts.noDesc ? "" : `<p>${esc(g.description)}</p>`}
  </span>
</a>`;
}

function guidePage(g, all) {
  const t = T[g.lang];
  const L = LANGS[g.lang];
  const foreign = g.lang !== "ko";
  const url = `/guide/${g.slug}`;
  const { html, headings } = mdToHtml(g.body);
  const toc = headings.filter((h) => h.level === 2);
  const related = g.related.map((s) => all.find((x) => x.slug === s)).filter(Boolean).slice(0, 3);
  while (related.length < 3) {
    const extra = all.find((x) => x.slug !== g.slug && !related.includes(x) && x.category === g.category && x.lang === g.lang)
      || all.find((x) => x.slug !== g.slug && !related.includes(x) && x.lang === g.lang)
      || all.find((x) => x.slug !== g.slug && !related.includes(x));
    if (!extra) break;
    related.push(extra);
  }
  const [w, h] = IMG[g.image];
  const title = (g.seoTitle || g.title) + t.suffix;
  const crumbs = foreign
    ? [t.home, [t.guide, "/guide/"], [g.title, url]]
    : [["홈", "/"], ["밍글 가이드", "/guide/"], [CAT[g.category].ko, `/guide/#${g.category}`], [g.title, url]];
  const crumbsLd = foreign ? crumbs : [["홈", "/"], ["밍글 가이드", "/guide/"], [g.title, url]];
  const alternates = alternatesFor(url, (slug) => all.some((x) => x.slug === slug));
  const others = (alternates || [])
    .filter(([hl, p]) => hl !== "x-default" && p !== url)
    .map(([hl, p]) => {
      const lang = Object.keys(LANGS).find((k) => LANGS[k].hreflang === hl);
      return `<a href="${p}" hreflang="${hl}" lang="${LANGS[lang].html}">${LANGS[lang].name}</a>`;
    });
  const og = ogOf(g.image);

  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "@id": ORIGIN + url + "#article",
      headline: g.title,
      description: g.description,
      ...(g.answer ? { abstract: g.answer } : {}),
      image: [og && ORIGIN + og, `${ORIGIN}/img/${g.image}.webp`].filter(Boolean),
      datePublished: g.date + "T09:00:00+09:00",
      dateModified: g.updated + "T09:00:00+09:00",
      inLanguage: L.ld,
      keywords: g.keywords.join(", "),
      articleSection: foreign ? CAT[g.category].en : CAT[g.category].ko,
      mainEntityOfPage: { "@type": "WebPage", "@id": ORIGIN + url },
      isPartOf: { "@id": SITE_ID },
      about: g.category === "business" ? { "@type": "Thing", name: "무인카페 창업·운영" } : { "@id": STORE_ID },
      author: { "@type": "Organization", "@id": ORG_ID, name: "밍글", url: ORIGIN + "/about" },
      publisher: { "@type": "Organization", "@id": ORG_ID, name: "밍글", logo: { "@type": "ImageObject", url: ORIGIN + "/img/logo.png" } },
      speakable: { "@type": "SpeakableSpecification", cssSelector: [".article__head h1", g.answer ? ".answer-box__a" : ".article__head .lead"] },
    },
    breadcrumb(crumbsLd),
    faqLd(g.faq, { "@id": ORIGIN + url + "#faq", inLanguage: L.ld }),
  ].filter(Boolean);

  const head = headCommon({
    lang: g.lang,
    title,
    description: g.description,
    canonical: url,
    image: g.image,
    imageAlt: g.imageAlt,
    type: "article",
    alternates,
    mdAlt: `/llms/guide-${g.slug}.md`,
    extra: [
      `  <meta property="article:published_time" content="${g.date}T09:00:00+09:00">`,
      `  <meta property="article:modified_time" content="${g.updated}T09:00:00+09:00">`,
      `  <meta property="article:section" content="${esc(foreign ? CAT[g.category].en : CAT[g.category].ko)}">`,
      g.keywords.length ? `  <meta name="keywords" content="${esc(g.keywords.join(", "))}">` : "",
      ...jsonld.map((o) => "  " + ld(o)),
    ].filter(Boolean).join("\n") + "\n",
  });

  const answerBox = g.answer || g.points.length ? `
        <section class="answer-box" aria-label="${t.answer}">
          <p class="answer-box__label">${t.answer}</p>
          ${g.answer ? `<p class="answer-box__a">${esc(g.answer)}</p>` : ""}
          ${g.points.length ? `<ul>${g.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
        </section>` : "";

  const main = `
<article>
  <header class="article__head">
    <div class="wrap">
      ${crumbsHtml(crumbs, g.lang)}
      <div class="article__meta">
        <span class="badge${g.category === "business" ? " badge--navy" : ""}">${foreign ? t.guide : CAT[g.category].ko}</span>
        <span>${t.updated} <time datetime="${g.updated}">${g.updated.replace(/-/g, ".")}</time></span>
        <span>${t.min(g.minutes)}</span>
      </div>
      <h1>${esc(g.title)}</h1>
      <p class="lead">${esc(g.description)}</p>
      <p class="byline"><span>${t.by}</span> · ${t.byNote} <a href="${t.aboutHref}">${t.aboutLabel}</a>${others.length ? ` <span class="byline__lang">${t.other}: ${others.join(" · ")}</span>` : ""}</p>
    </div>
  </header>

  <div class="wrap">
    <div class="article-layout">
      <aside class="article-aside" aria-label="${t.toc}">
        ${toc.length >= 2 ? `<details class="toc" data-open-desktop>
          <summary>${t.toc}</summary>
          <ol>${toc.map((x) => `<li><a href="#${x.id}">${esc(x.text)}</a></li>`).join("")}${g.faq.length ? `<li><a href="#faq">${t.faq}</a></li>` : ""}</ol>
        </details>` : ""}
        <div class="aside-cta">
          <h3>${t.asideT}</h3>
          <p>${t.asideP}</p>
          <a class="btn btn--primary btn--sm" href="${t.asideHref}">${t.asideB}</a>
        </div>
      </aside>

      <div class="article-main">${answerBox}
        <figure class="figure article__cover">
          <img src="/img/${g.image}.webp" alt="${esc(g.imageAlt)}" width="${w}" height="${h}" fetchpriority="high">
          ${CONCEPT.has(g.image) ? `<figcaption>${t.concept}</figcaption>` : ""}
        </figure>
        <div class="prose">
${html}
        </div>
${g.faq.length ? `
        <section class="faq-block" id="faq" aria-labelledby="faq-h">
          <h2 id="faq-h">${t.faq}</h2>
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
        <span class="eyebrow">${t.keep}</span>
        <h2 style="margin:0">${t.related}</h2>
      </div>
      <a class="btn btn--ghost btn--sm" href="/guide/">${t.all}</a>
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
  const foreign = all.filter((g) => g.lang !== "ko");
  const featured = ["kondae-24h-cafe", "kondae-study-cafe", "how-to-use-unmanned-cafe", "unmanned-cafe-startup-cost"]
    .map((s) => all.find((g) => g.slug === s)).filter(Boolean);

  const head = headCommon({
    title: "밍글 가이드 | 건대 24시간 카페 이용부터 무인카페 창업까지",
    description: `건대·화양동 24시간 무인 디저트카페 밍글이 직접 운영하며 정리한 가이드 ${all.length}편. 건대 카공 자리, 무인카페 이용 방법과 결제, 새벽 디저트, 언어교환, 무인카페 창업 비용·상권·운영까지 한곳에 모았습니다.`,
    canonical: "/guide/",
    image: "store-night",
    extra: [
      "  " + ld({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": ORIGIN + "/guide/#collection",
        name: "밍글 가이드",
        url: ORIGIN + "/guide/",
        inLanguage: "ko-KR",
        isPartOf: { "@id": SITE_ID },
        publisher: { "@id": ORG_ID },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: all.length,
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
    <h1><span class="h1-kicker">건대 24시간 카페 · 무인카페 이용 · 창업</span>밍글 가이드</h1>
    <p class="lead">새벽까지 머물 곳을 찾는 분, 무인카페가 처음인 분, 무인 매장을 차려 볼까 고민하는 분. 건대화양점을 직접 운영하면서 자주 받은 질문과 알게 된 것들을 글 ${all.length}편으로 정리했습니다.</p>
    ${searchForm("예: 콘센트, 첫차, 창업 비용")}
    <div class="chip-row" style="margin-top:14px">
${CAT_ORDER.map((c) => `      <a class="chip" href="#${c}">${CAT[c].ko} ${ko.filter((g) => g.category === c).length}</a>`).join("\n")}
      <a class="chip" href="#english">English · 中文 · 日本語</a>
      <a class="chip" href="/faq">자주 묻는 질문</a>
      <a class="chip" href="/glossary">용어 사전</a>
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
${CAT_ORDER.map((c) => {
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
${foreign.length ? `
    <div class="hub-section" id="english">
      <div class="hub-section__head"><h2 lang="en">English · 中文 · 日本語</h2><p lang="en">For international students and visitors around Konkuk University</p></div>
      <div class="grid grid--3">
${foreign.map((g) => gcard(g)).join("\n")}
      </div>
    </div>` : ""}
  </div>
</section>

<section class="section section--beige">
  <div class="wrap two-col">
    <div>
      <span class="eyebrow">FAQ · 용어</span>
      <h2>짧게 궁금한 건 여기서</h2>
      <p>결제 방법, 콘센트 자리, 밍글패스 도장, 창업 상담 방식까지. 글로 쓰기엔 짧은 질문들은 자주 묻는 질문에, 처음 듣는 말은 용어 사전에 모아 두었어요.</p>
      <div class="chip-row"><a class="btn btn--primary" href="/faq">자주 묻는 질문 보기</a><a class="btn btn--ghost" href="/glossary">용어 사전</a></div>
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
function parseFaq() {
  const raw = read(path.join(ROOT, "content/faq.md")).replace(/\r\n?/g, "\n");
  const groups = [];
  for (const block of ("\n" + raw).split(/\n(?=##\s)/)) {
    const m = block.match(/^##\s+(.+)\n([\s\S]*)$/);
    if (!m) continue;
    const items = [];
    for (const c of m[2].split(/\n(?=###\s)/)) {
      const q = c.match(/^###\s+(.+)\n([\s\S]*)$/);
      if (q && q[2].trim()) items.push({ q: q[1].trim(), a: q[2].trim() });
    }
    const n = groups.length + 1;
    items.forEach((it, i) => { it.id = `faq-${n}-${i + 1}`; });
    groups.push({ title: m[1].trim(), id: "faq-" + n, items });
  }
  return groups;
}

function faqPage(groups) {
  const all = groups.flatMap((g) => g.items);

  const head = headCommon({
    title: "자주 묻는 질문 | 밍글 건대화양점 24시간 무인카페",
    description: `밍글 건대화양점 이용, 결제, 콘센트 자리, 메뉴와 품절, 밍글보드·모임, 밍글패스 도장, 창업·제휴 상담까지 자주 받는 질문 ${all.length}개에 답했습니다.`,
    canonical: "/faq",
    image: "store-seat",
    mdAlt: "/llms/faq.md",
    extra: "  " + ld(faqLd(all, { "@id": ORIGIN + "/faq#faq", inLanguage: "ko-KR", isPartOf: { "@id": SITE_ID }, about: { "@id": STORE_ID } }), "ld-faq") + "\n  " + ld(breadcrumb([["홈", "/"], ["자주 묻는 질문", "/faq"]])) + "\n",
  });

  const main = `
<section class="page-head">
  <div class="wrap">
    ${crumbsHtml([["홈", "/"], ["자주 묻는 질문", "/faq"]])}
    <h1><span class="h1-kicker">밍글 건대화양점 · 24시간 무인카페</span>자주 묻는 질문</h1>
    <p>무인 매장이라 직원에게 바로 물어볼 수 없으니, 자주 받는 질문 ${all.length}개를 먼저 모아 두었어요. 여기 없는 건 카카오톡으로 편하게 물어봐 주세요.</p>
    ${searchForm("예: 현금, 콘센트, 도장")}
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
${groups.map((g, gi) => `    <div class="faq-group" id="${g.id}">
      <h2>${esc(g.title)}</h2>
      ${faqHtml(g.items, gi === 1 ? " data-faq-facts" : "", g.id + "-")}
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
      <p class="small" style="margin:0">자세한 이야기는 <a href="/guide/">밍글 가이드</a>에, 처음 듣는 말은 <a href="/glossary">용어 사전</a>에 정리돼 있어요.</p>
    </div>
  </div>
</section>`;

  return shell({ head, active: "guide", main });
}

/* ============================================================
   용어 사전
   ============================================================ */
function parseGlossary() {
  const raw = read(path.join(ROOT, "content/glossary.md")).replace(/\r\n?/g, "\n")
    .split("\n").filter((l) => !/^#(\s|$)/.test(l)).join("\n");
  const groups = [];
  for (const block of ("\n" + raw).split(/\n(?=##\s)/)) {
    const m = block.match(/^##\s+(.+)\n([\s\S]*)$/);
    if (!m) continue;
    const terms = [];
    for (const c of m[2].split(/\n(?=###\s)/)) {
      const q = c.match(/^###\s+(.+)\n([\s\S]*)$/);
      if (!q || !q[2].trim()) continue;
      const [name, alt = "", id = ""] = q[1].split("|").map((x) => x.trim());
      const lines = q[2].trim().split("\n");
      let more = null;
      const last = lines[lines.length - 1].match(/^→\s*\[([^\]]+)\]\(([^)]+)\)\s*$/);
      if (last) { more = { label: last[1], href: last[2] }; lines.pop(); }
      const body = lines.join("\n").trim();
      terms.push({ name, alt, id: id || "term-" + (terms.length + 1), body, text: oneLine(mdToText(body)), more });
    }
    groups.push({ title: m[1].trim(), id: "g" + (groups.length + 1), terms });
  }
  return groups;
}

function glossaryPage(groups) {
  const all = groups.flatMap((g) => g.terms);
  const url = "/glossary";
  const head = headCommon({
    title: "무인카페 용어 사전 | 카공·모각작·샵인샵 뜻 정리 — 밍글",
    description: `무인카페, 카공, 모각작, 키오스크, 샵인샵, 손익분기점까지. 무인카페를 이용하거나 창업을 알아볼 때 자주 나오는 말 ${all.length}개를 밍글이 한 문장씩 풀어 정리했습니다.`,
    canonical: url,
    image: "store-shelf",
    mdAlt: "/llms/glossary.md",
    extra: [
      "  " + ld({
        "@context": "https://schema.org",
        "@type": "DefinedTermSet",
        "@id": ORIGIN + url + "#terms",
        name: "밍글 용어 사전",
        description: "무인카페 이용·공부·커뮤니티·창업에서 자주 쓰는 말 풀이",
        url: ORIGIN + url,
        inLanguage: "ko-KR",
        publisher: { "@id": ORG_ID },
        hasDefinedTerm: all.map((t) => ({
          "@type": "DefinedTerm",
          "@id": `${ORIGIN}${url}#${t.id}`,
          name: t.name,
          ...(t.alt ? { alternateName: t.alt.split(",").map((x) => x.trim()).filter(Boolean) } : {}),
          description: t.text,
          url: `${ORIGIN}${url}#${t.id}`,
          inDefinedTermSet: ORIGIN + url + "#terms",
        })),
      }),
      "  " + ld(breadcrumb([["홈", "/"], ["밍글 가이드", "/guide/"], ["용어 사전", url]])),
    ].join("\n") + "\n",
  });

  const main = `
<section class="page-head">
  <div class="wrap">
    ${crumbsHtml([["홈", "/"], ["밍글 가이드", "/guide/"], ["용어 사전", url]])}
    <h1><span class="h1-kicker">무인카페 · 카공 · 창업</span>밍글 용어 사전</h1>
    <p>무인카페를 처음 이용하거나 창업을 알아보다 보면 낯선 말이 꽤 나옵니다. 자주 쓰는 말 ${all.length}개를 한 문장으로 먼저 풀고, 더 읽을 글을 붙여 두었어요.</p>
  </div>
</section>
<div class="faq-nav">
  <div class="wrap">
    <div class="chip-row">
${groups.map((g) => `      <a class="chip" href="#${g.id}">${esc(g.title)} ${g.terms.length}</a>`).join("\n")}
    </div>
  </div>
</div>
<section class="section" style="padding-top:30px">
  <div class="wrap" style="max-width:860px">
${groups.map((g) => `    <div class="faq-group" id="${g.id}">
      <h2>${esc(g.title)}</h2>
      <p class="term-index">${g.terms.map((t) => `<a href="#${t.id}">${esc(t.name)}</a>`).join("")}</p>
      <dl class="glossary">
${g.terms.map((t) => `        <div class="term" id="${t.id}">
          <dt>${esc(t.name)}${t.alt ? ` <span class="term__alt">${esc(t.alt)}</span>` : ""}</dt>
          <dd>${mdToHtml(t.body).html}${t.more ? `<p class="term__more"><a href="${esc(t.more.href)}">${esc(t.more.label)}</a></p>` : ""}</dd>
        </div>`).join("\n")}
      </dl>
    </div>`).join("\n")}
  </div>
</section>
<section class="section section--beige">
  <div class="wrap two-col">
    <div>
      <span class="eyebrow">FAQ</span>
      <h2>뜻보다 답이 필요하다면</h2>
      <p>결제, 좌석, 모임, 창업 상담처럼 구체적인 질문은 자주 묻는 질문에 답해 두었어요.</p>
      <a class="btn btn--primary" href="/faq">자주 묻는 질문 보기</a>
    </div>
    <div>
      <span class="eyebrow">Guide</span>
      <h2>길게 읽고 싶다면</h2>
      <p>이용 방법부터 무인카페 창업까지, 주제별로 정리한 글은 밍글 가이드에 있습니다.</p>
      <a class="btn btn--ghost" href="/guide/">밍글 가이드 보기</a>
    </div>
  </div>
</section>`;

  return shell({ head, active: "guide", main });
}

/* ============================================================
   밍글 한눈에 보기 (/about)
   ============================================================ */
function parseAbout() {
  const raw = read(path.join(ROOT, "content/about.md")).replace(/\r\n?/g, "\n")
    .split("\n").filter((l) => !/^#(\s|$)/.test(l)).join("\n").trim();
  const i = raw.indexOf("\n## ");
  const lead = (i < 0 ? raw : raw.slice(0, i)).trim();
  const body = i < 0 ? "" : raw.slice(i).trim();
  return { lead: oneLine(lead), body, raw };
}

function aboutPage(about) {
  const url = "/about";
  const { html, headings } = mdToHtml(about.body);
  const head = headCommon({
    title: "밍글 한눈에 보기 | 건대입구 24시간 무인 디저트카페 소개",
    description: "밍글(MINGLE)은 서울 광진구 화양동, 건대입구역 근처의 24시간 무인 디저트카페입니다. 주소·운영 시간·결제 방법·좌석·메뉴와 커뮤니티, 운영자, 창업·제휴 방식까지 사실만 모았습니다.",
    canonical: url,
    image: "store-exterior",
    imageAlt: "밍글 무인카페 건대화양점 외관",
    mdAlt: "/llms/about.md",
    extra: [
      "  " + ld({
        "@context": "https://schema.org",
        "@type": "AboutPage",
        "@id": ORIGIN + url + "#webpage",
        url: ORIGIN + url,
        name: "밍글 한눈에 보기",
        description: about.lead,
        inLanguage: "ko-KR",
        isPartOf: { "@id": SITE_ID },
        about: { "@id": ORG_ID },
        mainEntity: { "@id": STORE_ID },
        speakable: { "@type": "SpeakableSpecification", cssSelector: [".page-head h1", ".page-head .lead"] },
      }),
      "  " + ld(orgLd()),
      "  " + ld(storeLd()),
      "  " + ld(breadcrumb([["홈", "/"], ["밍글 한눈에 보기", url]])),
    ].join("\n") + "\n",
  });

  const main = `
<section class="page-head">
  <div class="wrap">
    ${crumbsHtml([["홈", "/"], ["밍글 한눈에 보기", url]])}
    <h1><span class="h1-kicker">건대입구 24시간 무인 디저트카페</span>밍글 한눈에 보기</h1>
    <p class="lead">${esc(about.lead)}</p>
  </div>
</section>

<section class="section" style="padding-top:18px">
  <div class="wrap about-layout">
    <aside class="about-side" aria-label="매장 정보">
      <div class="about-card">
        <h2>밍글 건대화양점</h2>
        <ul class="info-list" data-store-facts>
          <li><span class="k">주소</span><span class="v">서울 광진구 능동로13길 39<br><span class="small">지번 화양동 10-1</span></span></li>
          <li><span class="k">운영 시간</span><span class="v">24시간 · 연중무휴 · 무인</span></li>
          <li><span class="k">결제</span><span class="v">카드 · 간편결제 (현금 불가)</span></li>
          <li><span class="k">좌석</span><span class="v">약 30평 · 창가 콘센트 자리, 테이블, 소파석</span></li>
          <li><span class="k">문의</span><span class="v"><a href="${KAKAO}" target="_blank" rel="noopener">카카오톡 채널</a></span></li>
        </ul>
        <div class="chip-row" style="margin-top:14px">
          <a class="btn btn--primary btn--sm" href="${NAVER_MAP}" target="_blank" rel="noopener">네이버 지도</a>
          <a class="btn btn--ghost btn--sm" href="${KAKAO_MAP}" target="_blank" rel="noopener">카카오맵</a>
          <a class="btn btn--ghost btn--sm" href="${GOOGLE_MAP}" target="_blank" rel="noopener">Google 지도</a>
        </div>
      </div>
      <nav class="about-toc" aria-label="이 페이지의 순서">
        <ol>${headings.filter((h) => h.level === 2).map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join("")}<li><a href="#in-english">In English</a></li></ol>
      </nav>
    </aside>
    <div class="prose about-prose">
${html}
    </div>
  </div>
</section>

<section class="section section--beige" id="in-english" lang="en">
  <div class="wrap" style="max-width:860px">
    <span class="eyebrow">In English</span>
    <h2>Mingle at a glance</h2>
    <p>Mingle is a 24-hour self-service dessert café near Konkuk University Station in Hwayang-dong, Gwangjin-gu, Seoul. There is no staff on site: you order and pay at a kiosk (card or mobile pay only, no cash), pick up machine-brewed coffee, and choose chilled or baked desserts from the showcase.</p>
    <p>Seats are free to use with no time limit, and the window seats have power outlets. The address is 39 Neungdong-ro 13-gil, Gwangjin-gu, Seoul. Mingle also runs a small neighbourhood board and meetups, and questions are answered through its KakaoTalk channel.</p>
    <div class="chip-row">
      <a class="btn btn--primary btn--sm" href="/en/visit">How to visit</a>
      <a class="btn btn--ghost btn--sm" href="/guide/en-konkuk-24h-cafe" hreflang="en">A 24-hour café near Konkuk</a>
      <a class="btn btn--ghost btn--sm" href="/guide/en-unmanned-cafe-korea" hreflang="en">How unmanned cafés work</a>
    </div>
  </div>
</section>`;

  return shell({ head, active: null, main });
}

/* ============================================================
   사이트 검색 (/search)
   ============================================================ */
function searchPage() {
  const url = "/search";
  const head = headCommon({
    title: "검색 | 밍글",
    description: "밍글 가이드, 자주 묻는 질문, 용어 사전, 매장 안내에서 궁금한 내용을 찾아보세요.",
    canonical: url,
    robots: "noindex, follow",
  });
  const hot = ["건대 24시간 카페", "콘센트", "결제", "첫차", "디저트", "스터디카페 차이", "창업 비용", "언어교환"];
  const main = `
<section class="page-head">
  <div class="wrap" style="max-width:860px">
    <h1>밍글에서 찾기</h1>
    <p>가이드 글, 자주 묻는 질문, 용어 사전, 매장 안내를 한 번에 찾아요.</p>
    ${searchForm("궁금한 것을 검색해 보세요")}
    <div class="chip-row" style="margin-top:14px" data-search-hot>
${hot.map((k) => `      <a class="chip" href="/search?q=${encodeURIComponent(k)}">${esc(k)}</a>`).join("\n")}
    </div>
  </div>
</section>
<section class="section" style="padding-top:8px">
  <div class="wrap" style="max-width:860px">
    <p class="search-status" data-search-status aria-live="polite"></p>
    <ol class="search-results" data-search-results></ol>
    <noscript><p>검색은 자바스크립트를 켜야 쓸 수 있어요. <a href="/guide/">밍글 가이드</a>와 <a href="/faq">자주 묻는 질문</a>에서 직접 찾아보실 수 있습니다.</p></noscript>
    <div class="search-empty" data-search-empty hidden>
      <p>찾는 내용이 없다면 카카오톡으로 물어봐 주세요. 자주 나오는 질문은 글로 정리해 올립니다.</p>
      <div class="chip-row"><a class="btn btn--kakao btn--sm" href="${KAKAO}" target="_blank" rel="noopener">${ICON.kakao}카카오톡으로 문의하기</a><a class="btn btn--ghost btn--sm" href="/faq">자주 묻는 질문</a><a class="btn btn--ghost btn--sm" href="/guide/">가이드 전체</a></div>
    </div>
  </div>
</section>`;
  return shell({ head, active: null, main, scripts: ["/js/search.js"] });
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

/* ---------- 손으로 만든 페이지의 구조화 데이터 ----------
   페이지 <head> 안의 JSON-LD는 빌드가 전부 다시 씁니다. 페이지에서 직접 고치지 말고 여기서 고쳐 주세요. */
const pageInfo = (s) => ({
  title: stripTags((s.match(/<title>([\s\S]*?)<\/title>/) || [])[1]),
  description: stripTags((s.match(/<meta name="description" content="([^"]*)"/) || [])[1]),
  canonical: (s.match(/<link rel="canonical" href="https:\/\/hellomingle\.kr([^"]*)"/) || [])[1],
  robots: (s.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || "",
});

function stepsFrom(s) {
  const out = [];
  const re = /<div class="step">[\s\S]*?<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(s))) out.push({ name: stripTags(m[1]), text: stripTags(m[2]) });
  return out;
}

const webPageLd = ({ type = "WebPage", url, info, lang, speakable, about = { "@id": STORE_ID }, extra = {} }) => ({
  "@context": "https://schema.org",
  "@type": type,
  "@id": ORIGIN + url + "#webpage",
  url: ORIGIN + url,
  name: info.title,
  description: info.description,
  inLanguage: LANGS[lang].ld,
  isPartOf: { "@id": SITE_ID },
  ...(about ? { about } : {}),
  ...(speakable ? { speakable: { "@type": "SpeakableSpecification", cssSelector: speakable } } : {}),
  ...extra,
});

const howToLd = (url, name, steps, lang) => steps.length >= 2 ? {
  "@context": "https://schema.org",
  "@type": "HowTo",
  "@id": ORIGIN + url + "#howto",
  name,
  inLanguage: LANGS[lang].ld,
  totalTime: "PT3M",
  step: steps.map((x, i) => ({ "@type": "HowToStep", position: i + 1, name: x.name, text: x.text })),
} : null;

const serviceLd = (url, name, serviceType, description, offers) => ({
  "@context": "https://schema.org",
  "@type": "Service",
  "@id": ORIGIN + url + "#service",
  name,
  serviceType,
  description,
  url: ORIGIN + url,
  provider: { "@id": ORG_ID },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: serviceType,
    itemListElement: offers.map(([n, d]) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: n, description: d } })),
  },
});

/** 페이지별 구조화 데이터 묶음 — [객체, id?] 목록 */
function pageLd(rel, s, lang, ctx) {
  const p = rel.replace(/\\/g, "/");
  const info = pageInfo(s);
  const url = info.canonical;
  if (!url || /noindex/.test(info.robots)) return [];
  const short = info.title.split(/\s[|—–-]\s/)[0].trim();
  const crumb = lang === "en" ? breadcrumb([["Home", "/en/"], [short, url]]) : breadcrumb([["홈", "/"], [short, url]]);

  switch (p) {
    case "index.html":
      return [[orgLd()], [siteLd()], [storeLd()], [webPageLd({ url, info, lang, speakable: [".hero h1", ".hero .lead"] })]];
    case "store.html":
      return [[storeLd()], [webPageLd({ url, info, lang, speakable: [".page-head h1", ".page-head .lead"] })],
        [howToLd(url, "밍글 무인카페 이용 방법", stepsFrom(s), lang)], [crumb]];
    case "menu.html":
      return [[menuLd(ctx.menu), "ld-menu"], [webPageLd({ url, info, lang })], [crumb]];
    case "startup.html":
      return [[serviceLd(url, "밍글 무인 디저트카페 창업 상담", "무인카페 창업 상담", info.description, [
        ["STANDARD", "25~35평. 좌석·디저트·작업 공간을 모두 살리는 체류형 기본 모델"],
        ["COMPACT", "15~20평. 역세권·원룸 밀집 지역의 픽업형"],
        ["AMENITY", "오피스텔·지식산업센터의 공용 공간을 입주민 라운지로 바꾸는 방식"],
        ["SHOP-IN-SHOP", "기존 매장의 남는 구역에 냉장 쇼케이스와 결제 시스템을 더하는 방식"],
      ])], [webPageLd({ url, info, lang, about: { "@id": ORG_ID } })], [crumb]];
    case "partner.html":
      return [[serviceLd(url, "밍글 제휴·협업", "무인 디저트카페 제휴", info.description, [
        ["지역 디저트 입점", "낱개 포장이 가능한 상온·냉장 디저트를 밍글 진열대에서 판매"],
        ["샵인샵", "운영 중인 매장의 남는 구역에 냉장 쇼케이스와 결제 시스템을 더하는 협업"],
        ["건물 편의시설", "오피스텔·지식산업센터의 공용 공간을 입주민 라운지로 활용"],
        ["공간·프로그램 협업", "대학·기업·모임과 함께 여는 소규모 행사와 스터디 프로그램"],
      ])], [webPageLd({ url, info, lang, about: { "@id": ORG_ID } })], [crumb]];
    case "brand.html":
      return [[orgLd()], [webPageLd({ type: "AboutPage", url, info, lang, about: { "@id": ORG_ID } })], [crumb]];
    case "community.html":
    case "global.html":
    case "pass.html":
      return [[webPageLd({ url, info, lang })], [crumb]];
    case "en/index.html":
      return [[storeLd({ lang: "en" })], [webPageLd({ url, info, lang, speakable: [".hero h1", ".hero .lead"] })]];
    case "en/visit.html":
      return [[storeLd({ lang: "en" })], [webPageLd({ url, info, lang })], [howToLd(url, "How to use Mingle, a self-service café", stepsFrom(s), lang)], [crumb]];
    default:
      return url === "/" || url === "/en/" ? [] : [[crumb]];
  }
}

function syncPage(file, ctx) {
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

  /* 방문 통계 스크립트 (관리자 > KPI) — main.js 를 쓰는 모든 페이지에 */
  if (s.includes("/js/main.js") && !s.includes("/js/track.js")) {
    s = s.replace(/(\n?)(<script src="\/js\/main\.js[^"]*" defer><\/script>)/, `$1<script src="/js/track.js?v=${VER}" defer></script>\n$2`);
  }
  /* 404 페이지 표시 — 통계에서 '찾을 수 없는 주소'로 따로 셉니다 */
  if (rel === "404.html" && !s.includes('data-status="404"')) s = s.replace(/<html lang="ko">/, '<html lang="ko" data-status="404">');

  s = s.replace(/\?v=\d{8}[a-z]?/g, `?v=${VER}`);

  const info = pageInfo(s);

  /* 언어별 주소(hreflang) — 실제로 짝이 있는 페이지에만 */
  s = s.replace(/[ \t]*<link rel="alternate" hreflang="[^"]*" href="[^"]*">\n?/g, "");
  const alts = info.canonical ? alternatesFor(info.canonical) : null;
  if (alts) {
    s = s.replace(/([ \t]*<meta name="theme-color"[^>]*>\n)/, (m) => m + alts.map(([h, p]) => `  <link rel="alternate" hreflang="${h}" href="${ORIGIN}${p}">\n`).join(""));
  }

  /* 공유 이미지 — 1200×630 JPG 가 있으면 그걸 씁니다 */
  s = s.replace(/[ \t]*<meta (?:property="og:image:(?:width|height)"|name="twitter:image")[^>]*>\n?/g, "");
  s = s.replace(/([ \t]*)<meta property="og:image" content="https:\/\/hellomingle\.kr\/img\/(?:og\/)?([a-z0-9-]+)\.(?:webp|jpg|png)">\n?/, (m, sp, name) => {
    const og = ogOf(name);
    const src = ORIGIN + (og || `/img/${name}.webp`);
    const [w, h] = og ? [1200, 630] : IMG[name] || [1200, 900];
    return `${sp}<meta property="og:image" content="${src}">\n${sp}<meta property="og:image:width" content="${w}">\n${sp}<meta property="og:image:height" content="${h}">\n${sp}<meta name="twitter:image" content="${src}">\n`;
  });

  /* 검색 결과에 긴 요약과 큰 이미지를 허용 (noindex 페이지는 그대로) */
  if (!info.robots) {
    s = s.replace(/([ \t]*)(<link rel="canonical"[^>]*>\n)/, `$1$2$1<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">\n`);
  } else if (!/noindex/.test(info.robots) && !/max-snippet/.test(info.robots)) {
    s = s.replace(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">`);
  }

  /* 구조화 데이터 다시 쓰기 */
  s = s.replace(/[ \t]*<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>\n?/g, "");
  const lds = pageLd(rel, s, lang, ctx).filter(([o]) => o);
  if (lds.length) s = s.replace("</head>", lds.map(([o, id]) => `  ${ld(o, id)}\n`).join("") + "</head>");

  if (s !== before || withVerify(s) !== s) write(file, s);
  return { rel, ...pageInfo(s) };
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

function prerenderMenu(menu) {
  const file = path.join(SITE, "menu.html");
  let s = read(file);
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
const FIXED_PAGES = [
  ["/", "1.0", "store-exterior"], ["/menu", "0.9", "store-fridge"], ["/store", "0.9", "store-exterior"], ["/community", "0.8"], ["/guide/", "0.9", "store-night"],
  ["/faq", "0.8"], ["/about", "0.8", "store-exterior"], ["/glossary", "0.7"], ["/global", "0.7"], ["/pass", "0.6"], ["/brand", "0.6"], ["/startup", "0.8"],
  ["/partner", "0.7"], ["/en/", "0.7"], ["/en/visit", "0.6", "store-kiosk"], ["/en/community", "0.5"], ["/en/business", "0.5"],
  ["/legal/community", "0.3"], ["/legal/terms", "0.2"], ["/legal/privacy", "0.2"],
];

function sitemap(guides) {
  const img = (name, title) => (name ? `<image:image><image:loc>${ORIGIN}/img/${name}.webp</image:loc>${title ? `<image:title>${esc(title)}</image:title>` : ""}</image:image>` : "");
  const urls = [
    ...FIXED_PAGES.map(([u, p, im]) => `  <url><loc>${ORIGIN}${u}</loc><lastmod>${TODAY}</lastmod><priority>${p}</priority>${img(im)}</url>`),
    ...guides.map((g) => `  <url><loc>${ORIGIN}/guide/${g.slug}</loc><lastmod>${g.updated}</lastmod><priority>${g.lang === "ko" ? "0.7" : "0.6"}</priority>${img(g.image, g.imageAlt)}</url>`),
  ];
  write(path.join(SITE, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>
`);
  return urls.length;
}

function rss(guides) {
  const items = guides.filter((g) => g.lang === "ko").sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.slug < b.slug ? -1 : 1));
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
${items.map((g) => `<item><title>${esc(g.title)}</title><link>${ORIGIN}/guide/${g.slug}</link><guid isPermaLink="true">${ORIGIN}/guide/${g.slug}</guid><pubDate>${rfc(g.date)}</pubDate><category>${esc(CAT[g.category].ko)}</category><description>${esc(g.answer || g.description)}</description></item>`).join("\n")}
</channel>
</rss>
`);
}

/* AI 검색·답변 서비스의 로봇 — 밍글 정보가 AI 답변에 인용되도록 명시적으로 허용합니다.
   (막고 싶은 로봇이 생기면 아래 목록에서 지우고 별도 묶음으로 Disallow: / 를 적어 주세요) */
const AI_BOTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Perplexity-User",
  "Google-Extended", "Applebot", "Applebot-Extended",
  "Amazonbot", "meta-externalagent", "Meta-WebIndexer",
  "DuckAssistBot", "MistralAI-User", "CCBot", "Bytespider",
];
const DISALLOW = ["/api/", "/admin/", "/account/", "/go/", "/_tpl/", "/cdn-cgi/"];

function robots() {
  const rules = `Allow: /\n${DISALLOW.map((d) => `Disallow: ${d}`).join("\n")}`;
  write(path.join(SITE, "robots.txt"), `# 밍글 (hellomingle.kr)
# AI 검색·챗봇이 읽기 좋은 요약은 /llms.txt 에 있습니다.

User-agent: *
${rules}

# AI 검색 · 답변 서비스 (밍글 정보가 답변에 인용될 수 있도록 허용)
${AI_BOTS.map((b) => `User-agent: ${b}`).join("\n")}
${rules}

Sitemap: ${ORIGIN}/sitemap.xml
Sitemap: ${ORIGIN}/news/sitemap.xml
`);
}

/* ============================================================
   AI 검색·챗봇용 요약 (llms.txt)
   - /llms.txt        : 사이트 요약과 주요 문서 목록
   - /llms-full.txt   : 소개·질문·용어·가이드 전문을 한 파일로
   - /llms/*.md       : 문서별 마크다운 사본 (검색 결과에는 나오지 않게 noindex 헤더를 붙입니다)
   ============================================================ */
const absLinks = (md) => String(md)
  .replace(/\]\((\/(?:[^)#?\s]*\/)?)index\.html([#?][^)\s]*)?\)/g, (m, p, rest) => `](${p}${rest || ""})`)
  .replace(/\]\((\/(?!\/)[^)#?\s]*?)\.html([#?][^)\s]*)?\)/g, (m, p, rest) => `](${p}${rest || ""})`)
  .replace(/\]\(\/(?!\/)/g, `](${ORIGIN}/`);

const STORE_FACTS_MD = [
  `- 이름: ${STORE.name} (MINGLE)`,
  `- 주소: 서울특별시 광진구 ${STORE.street} (화양동 10-1) · ${STORE.streetEn}, Gwangjin-gu, Seoul`,
  "- 가까운 역: 지하철 2·7호선 건대입구역",
  "- 운영: 24시간 · 연중무휴 · 무인 운영 (이용 시간 제한 없음)",
  "- 결제: 키오스크에서 카드·간편결제 (현금 불가)",
  "- 공간: 약 30평 · 창가 콘센트 자리, 테이블, 소파석",
  "- 메뉴: 커피, 말차 라떼·밀크티·에이드, 냉장 디저트(조각 케이크·푸딩), 구움과자(쿠키·휘낭시에·마들렌)",
  `- 문의: 카카오톡 채널 ${KAKAO.replace("/friend", "")} (무인 매장이라 전화 대신 카카오톡으로 받습니다)`,
  `- 지도: 네이버 ${NAVER_MAP} · 카카오 ${KAKAO_MAP}`,
  `- 좌표: ${STORE.lat}, ${STORE.lng}`,
].join("\n");

function guideMd(g) {
  const t = T[g.lang];
  return [
    `# ${g.title}`,
    "",
    `> ${g.answer || g.description}`,
    "",
    `- URL: ${ORIGIN}/guide/${g.slug}`,
    `- ${g.lang === "ko" ? "분류" : "Category"}: ${g.lang === "ko" ? CAT[g.category].ko : CAT[g.category].en}`,
    `- ${g.lang === "ko" ? "마지막 수정" : "Last updated"}: ${g.updated}`,
    `- ${g.lang === "ko" ? "글쓴이: 밍글 운영팀 (밍글 무인카페 건대화양점)" : "Author: Mingle team (Mingle Konkuk-Hwayang, Seoul)"}`,
    "",
    ...(g.points.length ? [g.points.map((p) => `- ${p}`).join("\n"), ""] : []),
    absLinks(g.body),
    "",
    ...(g.faq.length ? [`## ${t.faq}`, "", ...g.faq.map((f) => `### ${f.q}\n${absLinks(f.a)}\n`)] : []),
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function llms({ guides, faqGroups, glossary, about }) {
  const dir = path.join(SITE, "llms");
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith(".md")) fs.unlinkSync(path.join(dir, f));

  const aboutMd = `# 밍글 한눈에 보기\n\n> ${about.lead}\n\n- URL: ${ORIGIN}/about\n- 마지막 확인: ${TODAY}\n\n## 핵심 정보\n\n${STORE_FACTS_MD}\n\n${absLinks(about.body)}\n`;
  const faqMd = `# 밍글 자주 묻는 질문\n\n> 밍글 무인카페 건대화양점 이용, 결제, 좌석, 커뮤니티, 밍글패스, 창업·제휴에 대해 자주 받는 질문과 답입니다.\n\n- URL: ${ORIGIN}/faq\n- 마지막 확인: ${TODAY}\n\n` +
    faqGroups.map((g) => `## ${g.title}\n\n` + g.items.map((it) => `### ${it.q}\n${absLinks(it.a)}\n`).join("\n")).join("\n");
  const glossaryMd = `# 밍글 용어 사전\n\n> 무인카페 이용·공부·커뮤니티·창업에서 자주 쓰는 말을 밍글이 한 문장씩 풀어 정리했습니다.\n\n- URL: ${ORIGIN}/glossary\n\n` +
    glossary.map((g) => `## ${g.title}\n\n` + g.terms.map((t) => `### ${t.name}${t.alt ? ` (${t.alt})` : ""}\n${absLinks(t.body)}${t.more ? `\n더 읽기: [${t.more.label}](${ORIGIN}${t.more.href})` : ""}\n`).join("\n")).join("\n");

  write(path.join(dir, "about.md"), aboutMd);
  write(path.join(dir, "faq.md"), faqMd);
  write(path.join(dir, "glossary.md"), glossaryMd);
  for (const g of guides) write(path.join(dir, `guide-${g.slug}.md`), guideMd(g));

  const ko = guides.filter((g) => g.lang === "ko");
  const foreign = guides.filter((g) => g.lang !== "ko");
  const line = (g) => `- [${g.title}](${ORIGIN}/llms/guide-${g.slug}.md): ${g.answer || g.description}`;

  const index = `# 밍글 (MINGLE)

> 밍글은 서울 광진구 화양동, 건대입구역 근처에 있는 24시간 무인 디저트카페입니다. 직원 없이 키오스크로 주문·결제하고, 약 30평 매장에서 커피와 케이크·구움과자를 즐길 수 있으며, 동네 게시판 '밍글보드'와 모임을 함께 운영합니다.

Mingle is a 24-hour self-service dessert café near Konkuk University Station (Hwayang-dong, Gwangjin-gu, Seoul). Kiosk ordering, card or mobile pay only, free seating with no time limit, window seats with power outlets.

이 파일은 AI 검색·챗봇이 밍글을 정확하게 소개할 수 있도록 만든 요약입니다. 아래 문서는 모두 밍글이 직접 운영하며 확인한 내용으로 썼고, 사람용 페이지는 ${ORIGIN} 에 있습니다.

## 핵심 정보

${STORE_FACTS_MD}

인용할 때 주의할 점:
- 매출·수익 수치는 공개하지 않습니다. 창업 관련 글은 비용과 수익을 '구조'로만 설명합니다.
- "국내 최초 무인디저트카페"는 밍글이 표방하는 브랜드 포지셔닝 문구이며, 공인된 기록이 아닙니다.
- 품절·매장 상태는 운영자가 직접 올리는 정보이며 자동으로 갱신되지 않습니다.
- 와이파이·화장실·주차처럼 이 파일에 없는 편의 정보는 ${ORIGIN}/store 와 ${ORIGIN}/faq 에 적힌 내용만 사실로 봐 주세요.

## 기본 안내

- [밍글 한눈에 보기](${ORIGIN}/llms/about.md): 밍글이 어떤 곳인지, 기본 정보, 운영자, 창업·제휴 방식
- [자주 묻는 질문](${ORIGIN}/llms/faq.md): 이용·결제·좌석·커뮤니티·밍글패스·창업 질문 ${faqGroups.reduce((n, g) => n + g.items.length, 0)}개
- [용어 사전](${ORIGIN}/llms/glossary.md): 무인카페·카공·모각작·샵인샵 등 ${glossary.reduce((n, g) => n + g.terms.length, 0)}개 용어 풀이
- [매장 안내](${ORIGIN}/store): 위치, 이용 순서, 오시는 길
- [오늘의 메뉴](${ORIGIN}/menu): 커피·논커피·냉장 디저트·구움과자
- [커뮤니티](${ORIGIN}/community): 밍글보드와 모임
- [창업 안내](${ORIGIN}/startup) · [제휴·협업](${ORIGIN}/partner)

${CAT_ORDER.map((c) => {
  const list = ko.filter((g) => g.category === c);
  return list.length ? `## 가이드: ${CAT[c].ko}\n\n${list.map(line).join("\n")}\n` : "";
}).filter(Boolean).join("\n")}
## Guides in English · 中文 · 日本語

${foreign.map(line).join("\n")}

## Optional

- [전체 문서 한 파일로 보기](${ORIGIN}/llms-full.txt)
- [브랜드 이야기](${ORIGIN}/brand)
- [밍글패스](${ORIGIN}/pass)
- [글로벌·언어교환](${ORIGIN}/global)
- [사이트맵](${ORIGIN}/sitemap.xml)
`;
  write(path.join(SITE, "llms.txt"), index);

  const full = [
    `# 밍글 (MINGLE) — 전체 문서\n\n> 밍글 무인카페 건대화양점(${ORIGIN})의 소개, 자주 묻는 질문, 용어 사전, 가이드 글 전문입니다. 마지막 생성: ${TODAY}\n`,
    aboutMd, faqMd, glossaryMd,
    ...guides.map(guideMd),
  ].join("\n\n---\n\n");
  write(path.join(SITE, "llms-full.txt"), full);
  return { files: guides.length + 3, bytes: Buffer.byteLength(full) };
}

/* ============================================================
   사이트 검색 색인 (search-index.json)
   t: 제목, u: 주소, d: 설명, k: 키워드, c: 종류, x: 본문 일부
   ============================================================ */
function searchIndex({ guides, faqGroups, glossary, pages }) {
  const items = [];
  const PAGE_KEYS = {
    "/": "밍글 홈 건대 24시간 무인 디저트카페", "/store": "위치 주소 오시는 길 지도 이용 방법 영업시간", "/menu": "메뉴 커피 디저트 케이크 가격 품절",
    "/community": "밍글보드 게시판 모임 스터디", "/global": "언어교환 외국인 korean table", "/pass": "도장 스탬프 쿠폰 적립 회원",
    "/brand": "브랜드 대표 이야기", "/startup": "창업 상담 가맹 비용", "/partner": "제휴 입점 샵인샵 협업", "/about": "소개 정보 운영자 주소",
    "/glossary": "용어 뜻 사전", "/faq": "질문 답 문의", "/guide/": "가이드 글 모음", "/news/": "소식 공지",
  };
  for (const p of pages) {
    if (!p.canonical || /noindex/.test(p.robots)) continue;
    if (/^\/(legal|en)\b/.test(p.canonical) && p.canonical !== "/en/") continue;
    const t = p.canonical === "/" ? "밍글 홈" : p.title.split(/\s[|—]\s/)[0].trim();
    items.push({ t, u: p.canonical, d: p.description, k: PAGE_KEYS[p.canonical] || "", c: "page" });
  }
  items.push({ t: "밍글 소식", u: "/news/", d: "기기 점검, 새로 들어온 디저트, 모임 일정처럼 날짜가 있는 매장 소식", k: PAGE_KEYS["/news/"], c: "page" });
  for (const g of guides) {
    const heads = mdToHtml(g.body).headings.map((h) => h.text).join(" ");
    items.push({
      t: g.title, u: `/guide/${g.slug}`, d: g.description, k: g.keywords.join(" "), c: "guide", l: g.lang,
      x: oneLine([g.answer, g.points.join(" "), heads, g.faq.map((f) => f.q).join(" ")].join(" ")).slice(0, 700),
    });
  }
  for (const g of faqGroups) for (const it of g.items) {
    items.push({ t: it.q, u: `/faq#${it.id}`, d: oneLine(mdToText(it.a)).slice(0, 180), k: g.title, c: "faq" });
  }
  for (const g of glossary) for (const t of g.terms) {
    items.push({ t: t.name, u: `/glossary#${t.id}`, d: t.text.slice(0, 180), k: [t.alt, g.title].join(" "), c: "term" });
  }
  write(path.join(SITE, "search-index.json"), JSON.stringify({ v: VER, items }));
  return items.length;
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
  const dup = guides.map((g) => g.slug).filter((s, i, a) => a.indexOf(s) !== i);
  if (dup.length) throw new Error("주소(slug)가 겹칩니다: " + dup.join(", "));
  guides.sort((a, b) =>
    LANG_ORDER.indexOf(a.lang) - LANG_ORDER.indexOf(b.lang) ||
    CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category) ||
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
    (a.slug < b.slug ? -1 : 1));

  const gdir = path.join(SITE, "guide");
  if (fs.existsSync(gdir)) for (const f of fs.readdirSync(gdir)) if (f.endsWith(".html")) fs.unlinkSync(path.join(gdir, f));
  for (const g of guides) {
    if (!g.title) throw new Error("제목이 없습니다: " + g.slug);
    write(path.join(gdir, `${g.slug}.html`), cleanLinks(guidePage(g, guides)));
  }
  write(path.join(gdir, "index.html"), cleanLinks(hubPage(guides)));
  log(`가이드 ${guides.length}편 + 모음 페이지`);

  // 2) 자주 묻는 질문 · 용어 사전 · 밍글 한눈에 보기 · 검색
  const faqGroups = parseFaq();
  write(path.join(SITE, "faq.html"), cleanLinks(faqPage(faqGroups)));
  const glossary = parseGlossary();
  write(path.join(SITE, "glossary.html"), cleanLinks(glossaryPage(glossary)));
  const about = parseAbout();
  write(path.join(SITE, "about.html"), cleanLinks(aboutPage(about)));
  write(path.join(SITE, "search.html"), cleanLinks(searchPage()));
  log(`자주 묻는 질문 ${faqGroups.reduce((n, g) => n + g.items.length, 0)}개, 용어 ${glossary.reduce((n, g) => n + g.terms.length, 0)}개, 소개·검색 페이지`);

  // 3) 소식 틀, 관리자 미리보기용 마크다운 변환기
  write(path.join(SITE, "_tpl/news.html"), newsTemplate());
  write(path.join(SITE, "js/md.js"), "/* 자동 생성 — 원본은 lib/md.js 입니다. 여기서 고치지 마세요. */\n" + read(path.join(ROOT, "lib/md.js")));

  // 4) 기존 페이지 머리·꼬리 맞추기 (관리자·새로 만든 페이지 제외)
  const menu = loadDefaultMenu();
  const generated = ["faq.html", "glossary.html", "about.html", "search.html"];
  const skip = new Set(["admin/index.html", "_tpl/news.html", ...generated].map((p) => path.join(SITE, p)));
  const pages = [];
  for (const f of walk(SITE)) {
    if (skip.has(f) || f.startsWith(gdir + path.sep)) continue;
    pages.push(syncPage(f, { menu }));
  }
  for (const g of [...generated, "guide/index.html"]) pages.push({ rel: g, ...pageInfo(read(path.join(SITE, g))) });
  log(`기존 페이지 ${pages.length - generated.length - 1}개 머리·꼬리·구조화 데이터 정리`);

  // 5) 메뉴, 가이드 카드 자리
  prerenderMenu(menu);
  log(`가이드 카드 자리 ${fillGuideSlots(guides)}곳 채움`);

  // 6) 사이트맵 · RSS · robots · IndexNow 열쇠
  const n = sitemap(guides);
  rss(guides);
  robots();
  write(path.join(SITE, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY);
  log(`sitemap.xml ${n}개 주소, rss.xml, robots.txt, IndexNow 열쇠 파일`);

  // 7) AI 검색·챗봇용 요약, 사이트 검색 색인
  const l = llms({ guides, faqGroups, glossary, about });
  log(`llms.txt, llms-full.txt(${Math.round(l.bytes / 1024)}KB), /llms/*.md ${l.files}개`);
  log(`사이트 검색 색인 ${searchIndex({ guides, faqGroups, glossary, pages })}개 항목`);

  // 점검용 요약
  const short = guides.filter((g) => (g.lang === "ko" ? g.chars < 1500 : false));
  if (short.length) log("짧은 글:", short.map((g) => `${g.slug}(${g.chars}자)`).join(", "));
  const noAnswer = guides.filter((g) => !g.answer);
  if (noAnswer.length) log("한눈에 보기(answer)가 없는 글:", noAnswer.map((g) => g.slug).join(", "));
  const missing = guides.flatMap((g) => g.related.filter((s) => !guides.some((x) => x.slug === s)).map((s) => `${g.slug}→${s}`));
  if (missing.length) log("없는 글을 가리키는 related:", missing.join(", "));
  console.log("완료");
}

main();
