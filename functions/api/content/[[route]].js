/**
 * 공개 콘텐츠 API — /api/content/*   (누구나 읽기)
 *  GET menu          관리자가 고친 메뉴 (없으면 menu:null → 화면은 menu-data.js 기본값 사용)
 *  GET news?limit=3  게시된 소식 요약
 */
import { json } from "../../../lib/util.js";
import { getJSON, NEWS_CATS, newsUrl } from "../../../lib/cms.js";

export async function onRequestGet({ env, params, request }) {
  const route = (Array.isArray(params.route) ? params.route : [params.route || ""]).join("/");

  if (route === "menu") {
    const menu = await getJSON(env, "cms:menu", null, 60);
    return json({ menu });
  }

  if (route === "news") {
    const limit = Math.min(Number(new URL(request.url).searchParams.get("limit")) || 6, 30);
    const index = (await getJSON(env, "news:index", [], 60)) || [];
    const items = index
      .filter((n) => n.status === "published")
      .sort((a, b) => (b.pinned - a.pinned) || (b.publishedAt - a.publishedAt))
      .slice(0, limit)
      .map((n) => ({
        title: n.title, summary: n.summary, category: n.category,
        categoryKo: NEWS_CATS[n.category] || "소식", cover: n.cover || null,
        pinned: !!n.pinned, publishedAt: n.publishedAt, url: newsUrl(n),
      }));
    return json({ items });
  }

  return json({ message: "없는 주소예요." }, 404);
}
