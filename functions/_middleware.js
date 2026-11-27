/**
 * 모든 HTML 페이지에 관리자 설정을 서버에서 끼워 넣습니다.
 *  - 네이버·구글·빙 사이트 소유 확인 메타 태그
 *  - 페이지별 검색 제목·설명 (관리자 > 검색 노출에서 고친 것)
 *  - 사이트 정보(SNS 주소 등) → window.MINGLE_SITE, 검색엔진용 sameAs
 *  - 상단 공지 배너
 *  - /menu 페이지의 메뉴 목록 (관리자가 고친 메뉴를 검색엔진도 그대로 읽도록)
 *  - 매장 편의 정보(와이파이·화장실·주차 등) → 매장 안내·소개·자주 묻는 질문, 구조화 데이터
 *
 * 무엇이든 문제가 생기면 원래 페이지를 그대로 내보냅니다. 사이트가 멈추지 않게 하는 것이 먼저예요.
 * 이미지·CSS·JS 같은 파일은 site/_routes.json 에서 제외해 이 코드를 거치지 않습니다.
 */
import { getJSON, normPath, bannerActive, bannerHtml, menuHtml, SITE_ORIGIN, STATIC_VERIFICATION } from "../lib/cms.js";
import { esc } from "../lib/md.js";
import { ORG_ID, hasFacts, factsRowsHtml, factsFaq, factsFaqHtml, factsLd, menuLd, ldScript } from "../lib/seo.js";

const jsonText = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

export async function onRequest(context) {
  const { request, env, next } = context;
  if (request.method !== "GET" && request.method !== "HEAD") return next();

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return next();

  const res = await next();

  try {
    if (!env.MINGLE_KV) return res;
    if (res.status !== 200 && res.status !== 404) return res;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return res;

    const path = normPath(url.pathname);
    if (path.startsWith("/admin") || path.startsWith("/_tpl")) return res;

    const isMenu = path === "/menu";
    const [inject, menu] = await Promise.all([
      getJSON(env, "cms:inject", null, 60),
      isMenu ? getJSON(env, "cms:menu", null, 60) : Promise.resolve(null),
    ]);
    if (!inject && !menu) return res;

    const rw = new HTMLRewriter();
    const seo = (inject && inject.seo) || {};
    const site = (inject && inject.site) || null;
    const head = [];

    /* 페이지에 이미 박혀 있는 코드와 같으면 그대로 두고, 관리자가 다른 코드를 저장했을 때만 바꿔 끼웁니다 */
    const swapCode = (name, saved, fixed) => {
      if (!saved || saved === fixed) return;
      if (fixed) rw.on(`meta[name="${name}"]`, { element(e) { e.remove(); } });
      head.push(`<meta name="${name}" content="${esc(saved)}">`);
    };
    swapCode("naver-site-verification", seo.naverVerification, STATIC_VERIFICATION.naver);
    swapCode("google-site-verification", seo.googleVerification, STATIC_VERIFICATION.google);
    if (seo.bingVerification) head.push(`<meta name="msvalidate.01" content="${esc(seo.bingVerification)}">`);

    if (site) {
      const pub = {
        instagram: site.instagram || "",
        kakaoChannel: site.kakaoChannel || "",
        supportEmail: site.supportEmail || "",
        naverPlace: site.naverPlace || "",
        naverBlog: site.naverBlog || "",
        youtube: site.youtube || "",
      };
      head.push(`<script>window.MINGLE_SITE=${JSON.stringify(pub).replace(/</g, "\\u003c")}</script>`);

      const sameAs = [site.instagram, site.naverPlace, site.naverBlog, site.youtube, site.kakaoChannel]
        .filter((u) => /^https?:\/\//i.test(u || ""));
      if (sameAs.length && (path === "/" || path === "/store" || path === "/brand" || path === "/about")) {
        /* 페이지에 이미 있는 밍글(Organization) 정보와 같은 @id 로 묶여, SNS 주소만 덧붙습니다 */
        head.push(ldScript({
          "@context": "https://schema.org",
          "@type": "Organization",
          "@id": ORG_ID,
          name: "밍글",
          url: SITE_ORIGIN + "/",
          sameAs,
        }));
      }
    }

    const ov = seo.pages && seo.pages[path];
    if (ov && ov.title) {
      rw.on("title", { element(e) { e.setInnerContent(ov.title); } });
      rw.on('meta[property="og:title"]', { element(e) { e.setAttribute("content", ov.title); } });
    }
    if (ov && ov.description) {
      rw.on('meta[name="description"]', { element(e) { e.setAttribute("content", ov.description); } });
      rw.on('meta[property="og:description"]', { element(e) { e.setAttribute("content", ov.description); } });
    }

    if (head.length) rw.on("head", { element(e) { e.append(head.join(""), { html: true }); } });

    const banner = inject && inject.banner;
    if (bannerActive(banner)) {
      const markup = bannerHtml(banner);
      rw.on("header.site-header", { element(e) { e.before(markup, { html: true }); } });
    }

    if (isMenu && menu) {
      const markup = menuHtml(menu);
      if (markup) rw.on("[data-menu]", { element(e) { e.setInnerContent(markup, { html: true }); } });
      const mld = menuLd(menu);
      if (mld) rw.on("script#ld-menu", { element(e) { e.setInnerContent(jsonText(mld), { html: true }); } });
    }

    /* 매장 편의 정보 — 관리자가 채운 항목만 나갑니다 */
    const facts = inject && inject.store;
    if (hasFacts(facts)) {
      if (path === "/store" || path === "/about") {
        const rows = factsRowsHtml(facts);
        rw.on("[data-store-facts]", { element(e) { e.append(rows, { html: true }); } });
      }
      if (path === "/faq") {
        const items = factsFaqHtml(facts);
        rw.on("[data-faq-facts]", { element(e) { e.append(items, { html: true }); } });
        /* 구조화 데이터(FAQPage)에도 같은 질문을 더합니다 */
        const extra = factsFaq(facts).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } }));
        let buf = "";
        rw.on("script#ld-faq", {
          text(t) {
            buf += t.text;
            if (!t.lastInTextNode) { t.remove(); return; }
            let out = buf;
            try {
              const o = JSON.parse(buf);
              if (Array.isArray(o.mainEntity)) { o.mainEntity = o.mainEntity.concat(extra); out = jsonText(o); }
            } catch {}
            t.replace(out, { html: true });
            buf = "";
          },
        });
      }
      if (path === "/" || path === "/store" || path === "/about") {
        const fld = factsLd(facts);
        if (fld) rw.on("head", { element(e) { e.append(ldScript(fld), { html: true }); } });
      }
    }

    return rw.transform(res);
  } catch {
    return res;
  }
}
