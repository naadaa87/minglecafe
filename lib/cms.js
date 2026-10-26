/* ============================================================
   밍글 홈페이지 관리(CMS) 공통 모듈
   - 관리자 확인은 기존 /api/admin/login 의 PIN 쿠키(mg_admin)를 그대로 씁니다.
   - 저장소는 MINGLE_KV 입니다. 키 목록:
       cms:site     사이트 정보(SNS·연락처)
       cms:seo      검색 노출 설정(사이트 소유 확인 코드, 페이지별 제목·설명)
       cms:banner   상단 공지 배너
       cms:inject   위 세 가지를 미들웨어가 한 번에 읽도록 합쳐 둔 값
       cms:menu     메뉴·가격 (없으면 site/js/menu-data.js 기본값을 씁니다)
       cms:log      관리자 활동 기록 (최근 200건)
       news:index   소식 목록(요약)
       news:<id>    소식 본문
   ============================================================ */
import { sha256, readCookie } from "./util.js";
import { esc } from "./md.js";

export const SITE_ORIGIN = "https://hellomingle.kr";

/* ---------- 관리자 확인 (functions/api/admin 과 같은 방식) ---------- */
export async function isAdmin(request, env) {
  if (!env.ADMIN_PIN) return false;
  const token = readCookie(request, "mg_admin");
  if (!token) return false;
  const [ts, sig] = token.split(".");
  if (!ts || !sig) return false;
  if (Date.now() > Number(ts)) return false;
  return sig === (await sha256(ts + "|" + env.ADMIN_PIN));
}

/* ---------- KV ---------- */
export async function getJSON(env, key, fallback = null, cacheTtl) {
  if (!env.MINGLE_KV) return fallback;
  try {
    const raw = cacheTtl
      ? await env.MINGLE_KV.get(key, { cacheTtl })
      : await env.MINGLE_KV.get(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export async function putJSON(env, key, value) {
  await env.MINGLE_KV.put(key, JSON.stringify(value));
}

export function clip(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

export function safeUrl(v, max = 300) {
  const s = clip(v, max);
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/(?!\/)/.test(s)) return s;
  return "";
}

/* ---------- 활동 기록 ---------- */
export async function logAction(env, action, detail = "") {
  if (!env.MINGLE_KV) return;
  try {
    const list = (await getJSON(env, "cms:log", [])) || [];
    list.unshift({ ts: Date.now(), action: clip(action, 60), detail: clip(detail, 160) });
    await putJSON(env, "cms:log", list.slice(0, 200));
  } catch {}
}

/* ---------- 기본값 ---------- */
export const DEFAULT_SITE = {
  instagram: "",
  kakaoChannel: "http://pf.kakao.com/_AxgYMn/friend",
  supportEmail: "spaceblank0100@gmail.com",
  naverPlace: "",
  naverBlog: "",
  youtube: "",
};

export const DEFAULT_SEO = {
  naverVerification: "",
  googleVerification: "",
  bingVerification: "",
  pages: {}, // { "/store": { title, description } }
};

export const DEFAULT_BANNER = {
  on: false,
  text: "",
  link: "",
  linkLabel: "",
  tone: "orange", // orange | navy | beige
  start: "",      // YYYY-MM-DD (선택)
  end: "",        // YYYY-MM-DD (선택)
  version: 0,
};

/** 미들웨어가 읽는 합본 값을 다시 만듭니다. 설정을 저장할 때마다 부릅니다. */
export async function rebuildInject(env) {
  const [site, seo, banner] = await Promise.all([
    getJSON(env, "cms:site", DEFAULT_SITE),
    getJSON(env, "cms:seo", DEFAULT_SEO),
    getJSON(env, "cms:banner", DEFAULT_BANNER),
  ]);
  const inject = { site: { ...DEFAULT_SITE, ...site }, seo: { ...DEFAULT_SEO, ...seo }, banner: { ...DEFAULT_BANNER, ...banner } };
  await putJSON(env, "cms:inject", inject);
  return inject;
}

/* ---------- 경로 정리: /store.html, /store, /store/ → /store ---------- */
export function normPath(p) {
  let s = String(p || "/").split("?")[0].split("#")[0];
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
  if (s.length > 1 && s.endsWith("/") && !/^\/(en|guide|news)\/$/.test(s)) s = s.slice(0, -1);
  return s || "/";
}

/* ---------- 오늘 날짜 (KST) ---------- */
export function kstDate(ts = Date.now()) {
  return new Date(ts + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function bannerActive(b, today = kstDate()) {
  if (!b || !b.on || !b.text) return false;
  if (b.start && today < b.start) return false;
  if (b.end && today > b.end) return false;
  return true;
}

export function bannerHtml(b) {
  const tone = ["orange", "navy", "beige"].includes(b.tone) ? b.tone : "orange";
  const href = safeUrl(b.link);
  const link = href
    ? ` <a class="topbar__link" href="${esc(href)}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ""}>${esc(b.linkLabel || "자세히")}</a>`
    : "";
  return `<div class="topbar topbar--${tone}" data-topbar="${esc(String(b.version || 0))}" role="region" aria-label="공지">` +
    `<div class="wrap"><p class="topbar__txt">${esc(b.text)}${link}</p>` +
    `<button class="topbar__x" type="button" aria-label="공지 닫기">×</button></div></div>`;
}

/* ---------- 메뉴 ---------- */
export function cleanMenu(input) {
  const groups = Array.isArray(input && input.groups) ? input.groups.slice(0, 12) : [];
  const ids = new Set();
  const out = {
    updated: kstDate(),
    note: clip(input && input.note, 200),
    groups: groups.map((g, gi) => ({
      id: clip(g.id, 30).replace(/[^\w-]/g, "") || "g" + gi,
      ko: clip(g.ko, 30) || "이름 없는 분류",
      en: clip(g.en, 40),
      desc: clip(g.desc, 120),
      items: (Array.isArray(g.items) ? g.items.slice(0, 60) : []).map((it, ii) => {
        let id = clip(it.id, 40).replace(/[^\w-]/g, "") || `${g.id || "g" + gi}-${ii}`;
        while (ids.has(id)) id += "x";
        ids.add(id);
        const price = Number(String(it.price ?? "").replace(/[^\d]/g, ""));
        return {
          id,
          ko: clip(it.ko, 40) || "이름 없는 메뉴",
          en: clip(it.en, 60),
          price: price > 0 && price < 1000000 ? price : null,
          img: clip(it.img, 60).replace(/[^\w-]/g, "") || null,
          new: !!it.new,
          hidden: !!it.hidden,
          desc: clip(it.desc, 80),
        };
      }),
    })),
  };
  return out;
}

/** 메뉴를 서버에서 HTML로 그립니다. (검색엔진은 이 HTML을 읽습니다) */
export function menuHtml(menu, soldout = []) {
  if (!menu || !Array.isArray(menu.groups)) return "";
  const parts = [];
  for (const g of menu.groups) {
    const items = (g.items || []).filter((it) => !it.hidden);
    if (!items.length) continue;
    parts.push(
      `<section class="menu-group" aria-labelledby="mg-${esc(g.id)}">` +
      `<div class="row-between" style="margin:34px 0 14px"><h2 id="mg-${esc(g.id)}" style="margin:0">${esc(g.ko)}</h2>` +
      (g.desc ? `<p class="small" style="margin:0">${esc(g.desc)}</p>` : "") +
      `</div><div class="menu-grid">` +
      items.map((it) => {
        const sold = soldout.includes(it.id);
        const img = it.img
          ? `<div class="mcard__img"><img src="/img/p/${esc(it.img)}.webp" alt="${esc(it.ko)}" loading="lazy">` +
            (it.new && !sold ? `<span class="mcard__flag mcard__flag--new">NEW</span>` : "") +
            (sold ? `<span class="mcard__flag mcard__flag--sold">오늘 품절</span>` : "") + `</div>`
          : "";
        const flags = !it.img && it.new && !sold ? `<span class="badge">NEW</span> ` : "";
        const soldBadge = !it.img && sold ? `<span class="badge badge--soon">오늘 품절</span> ` : "";
        const price = it.price
          ? `<span class="mcard__price">${Number(it.price).toLocaleString("ko-KR")}원</span>`
          : `<span class="mcard__price na">매장 가격표</span>`;
        return `<article class="mcard" data-sold="${sold ? 1 : 0}">${img}<div class="mcard__b">` +
          `<h3>${esc(it.ko)}</h3><span class="en">${esc(it.en || "")}</span>` +
          (it.desc ? `<p class="small" style="margin:0 0 6px">${esc(it.desc)}</p>` : "") +
          `${flags}${soldBadge}${price}</div></article>`;
      }).join("") +
      `</div></section>`
    );
  }
  return parts.join("");
}

/* ---------- 소식 ---------- */
export const NEWS_CATS = { notice: "공지", menu: "새 메뉴", event: "이벤트·모임", story: "밍글 이야기" };

export function newsUrl(n) {
  return "/news/" + encodeURIComponent(n.slug || n.id);
}

export function cleanSlug(v) {
  return clip(v, 60)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
