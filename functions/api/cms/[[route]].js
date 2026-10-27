/**
 * 홈페이지 관리 API — /api/cms/*   (관리자 전용)
 * 로그인은 기존 /api/admin/login (PIN) 그대로 씁니다. 같은 쿠키로 통과합니다.
 *
 *  GET  overview            대시보드 보조 숫자
 *  GET  settings            사이트 정보 · 검색 설정 · 배너 한 번에
 *  POST site                사이트 정보 저장
 *  POST seo                 검색 노출 설정 저장
 *  POST banner              공지 배너 저장
 *  GET  menu / POST menu    메뉴·가격 (POST {reset:true} 이면 기본값으로)
 *  GET  news                소식 전체(임시 저장 포함)
 *  GET  news/one?id=        소식 하나
 *  POST news/save           소식 저장
 *  POST news/delete         소식 삭제
 *  POST inquiries/update    문의 상태 · 메모
 *  GET  inquiries.csv       문의 내려받기
 *  GET  posts               밍글보드 글 (숨긴 글 포함)
 *  POST posts/set           글 숨기기 / 다시 보이기
 *  POST posts/delete        글 삭제(댓글 포함)
 *  GET  log                 활동 기록
 */
import { json, bad } from "../../../lib/util.js";
import {
  isAdmin, getJSON, putJSON, clip, safeUrl, logAction, rebuildInject,
  DEFAULT_SITE, DEFAULT_SEO, DEFAULT_BANNER, cleanMenu, normPath,
  NEWS_CATS, cleanSlug, kstDate, STATIC_VERIFICATION,
} from "../../../lib/cms.js";

const INQ_STATES = ["open", "contacted", "meeting", "done", "dropped"];

export async function onRequest(context) {
  const { request, env, params } = context;
  const route = (Array.isArray(params.route) ? params.route : [params.route || ""]).join("/");
  const method = request.method;

  if (!(await isAdmin(request, env))) return bad("관리자 로그인이 필요해요.", 401);
  if (!env.MINGLE_KV) return json({ message: "KV(MINGLE_KV)가 연결되지 않았어요." }, 503);

  const body = method === "POST" ? await request.json().catch(() => ({})) : {};
  const url = new URL(request.url);

  try {
    /* ---------- 대시보드 보조 숫자 ---------- */
    if (route === "overview" && method === "GET") {
      const [status, index, inject] = await Promise.all([
        getJSON(env, "store:status", {}),
        getJSON(env, "news:index", []),
        getJSON(env, "cms:inject", null),
      ]);
      const inq = await env.MINGLE_KV.list({ prefix: "inq:", limit: 200 });
      const byState = { open: 0, contacted: 0, meeting: 0, done: 0, dropped: 0 };
      for (const k of inq.keys) {
        const v = await getJSON(env, k.name, null);
        if (!v) continue;
        const st = v.state && INQ_STATES.includes(v.state) ? v.state : v.done ? "done" : "open";
        byState[st]++;
      }
      return json({
        statusUpdatedAt: status.updatedAt || null,
        statusLevel: status.level || "unknown",
        news: { total: index.length, published: index.filter((n) => n.status === "published").length },
        banner: inject && inject.banner ? { on: !!inject.banner.on, text: inject.banner.text || "" } : { on: false },
        seo: {
          naver: !!((inject && inject.seo && inject.seo.naverVerification) || STATIC_VERIFICATION.naver),
          google: !!((inject && inject.seo && inject.seo.googleVerification) || STATIC_VERIFICATION.google),
        },
        inquiries: byState,
        hasD1: !!env.MINGLE_DB,
      });
    }

    /* ---------- 설정 읽기 ---------- */
    if (route === "settings" && method === "GET") {
      const [site, seo, banner] = await Promise.all([
        getJSON(env, "cms:site", DEFAULT_SITE),
        getJSON(env, "cms:seo", DEFAULT_SEO),
        getJSON(env, "cms:banner", DEFAULT_BANNER),
      ]);
      return json({
        site: { ...DEFAULT_SITE, ...site },
        seo: { ...DEFAULT_SEO, ...seo },
        banner: { ...DEFAULT_BANNER, ...banner },
      });
    }

    /* ---------- 사이트 정보 ---------- */
    if (route === "site" && method === "POST") {
      const email = clip(body.supportEmail, 120);
      const v = {
        instagram: safeUrl(body.instagram),
        kakaoChannel: safeUrl(body.kakaoChannel) || DEFAULT_SITE.kakaoChannel,
        supportEmail: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : DEFAULT_SITE.supportEmail,
        naverPlace: safeUrl(body.naverPlace),
        naverBlog: safeUrl(body.naverBlog),
        youtube: safeUrl(body.youtube),
      };
      await putJSON(env, "cms:site", v);
      await rebuildInject(env);
      await logAction(env, "사이트 정보 저장");
      return json({ ok: true, site: v });
    }

    /* ---------- 검색 노출 설정 ---------- */
    if (route === "seo" && method === "POST") {
      const code = (s) => clip(s, 120).replace(/^.*content=["']?([^"'\s>]+).*$/i, "$1").replace(/[^\w\-.:=+/]/g, "");
      const pages = {};
      const src = body.pages && typeof body.pages === "object" ? body.pages : {};
      for (const [p, val] of Object.entries(src).slice(0, 120)) {
        const title = clip(val && val.title, 70);
        const description = clip(val && val.description, 200);
        if (title || description) pages[normPath(p)] = { title, description };
      }
      const v = {
        naverVerification: code(body.naverVerification),
        googleVerification: code(body.googleVerification),
        bingVerification: code(body.bingVerification),
        pages,
      };
      await putJSON(env, "cms:seo", v);
      await rebuildInject(env);
      await logAction(env, "검색 노출 설정 저장", `페이지 문구 ${Object.keys(pages).length}건`);
      return json({ ok: true, seo: v });
    }

    /* ---------- 공지 배너 ---------- */
    if (route === "banner" && method === "POST") {
      const date = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) ? String(d) : "");
      const prev = await getJSON(env, "cms:banner", DEFAULT_BANNER);
      const v = {
        on: !!body.on,
        text: clip(body.text, 120),
        link: safeUrl(body.link),
        linkLabel: clip(body.linkLabel, 20),
        tone: ["orange", "navy", "beige"].includes(body.tone) ? body.tone : "orange",
        start: date(body.start),
        end: date(body.end),
        version: (Number(prev.version) || 0) + 1,
      };
      if (v.on && !v.text) return bad("배너 문구를 적어 주세요.");
      await putJSON(env, "cms:banner", v);
      await rebuildInject(env);
      await logAction(env, v.on ? "공지 배너 켬" : "공지 배너 끔", v.text);
      return json({ ok: true, banner: v });
    }

    /* ---------- 메뉴 ---------- */
    if (route === "menu" && method === "GET") {
      return json({ menu: await getJSON(env, "cms:menu", null) });
    }
    if (route === "menu" && method === "POST") {
      if (body.reset) {
        await env.MINGLE_KV.delete("cms:menu");
        await logAction(env, "메뉴를 기본값으로 되돌림");
        return json({ ok: true, menu: null });
      }
      const menu = cleanMenu(body.menu || {});
      if (!menu.groups.length) return bad("분류가 하나 이상 있어야 해요.");
      await putJSON(env, "cms:menu", menu);
      const count = menu.groups.reduce((n, g) => n + g.items.length, 0);
      await logAction(env, "메뉴·가격 저장", `${menu.groups.length}개 분류 · ${count}개 메뉴`);
      return json({ ok: true, menu });
    }

    /* ---------- 소식 ---------- */
    if (route === "news" && method === "GET") {
      return json({ items: await getJSON(env, "news:index", []) });
    }
    if (route === "news/one" && method === "GET") {
      const id = clip(url.searchParams.get("id"), 40);
      const item = await getJSON(env, "news:" + id, null);
      if (!item) return bad("글을 찾을 수 없어요.", 404);
      return json({ item });
    }
    if (route === "news/save" && method === "POST") {
      const index = (await getJSON(env, "news:index", [])) || [];
      const isNew = !body.id;
      const id = isNew
        ? kstDate().replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 6)
        : clip(body.id, 40);
      const prev = isNew ? null : await getJSON(env, "news:" + id, null);
      if (!isNew && !prev) return bad("고치려는 글을 찾을 수 없어요.", 404);

      const title = clip(body.title, 80);
      const md = clip(body.body, 20000);
      if (title.length < 2) return bad("제목을 적어 주세요.");
      if (md.length < 10) return bad("본문을 조금 더 적어 주세요.");

      let slug = cleanSlug(body.slug) || id;
      if (index.some((n) => n.slug === slug && n.id !== id)) slug = slug + "-" + id.slice(-4);

      const status = body.status === "published" ? "published" : "draft";
      const now = Date.now();
      const item = {
        id,
        slug,
        title,
        summary: clip(body.summary, 160),
        body: md,
        category: NEWS_CATS[body.category] ? body.category : "notice",
        cover: clip(body.cover, 60).replace(/[^\w-]/g, ""),
        pinned: !!body.pinned,
        status,
        createdAt: prev ? prev.createdAt : now,
        updatedAt: now,
        publishedAt: status === "published" ? (prev && prev.publishedAt) || now : (prev && prev.publishedAt) || null,
      };
      await putJSON(env, "news:" + id, item);

      const summary = {
        id, slug, title: item.title, summary: item.summary, category: item.category,
        cover: item.cover, pinned: item.pinned, status: item.status,
        publishedAt: item.publishedAt, updatedAt: item.updatedAt,
      };
      const next = [summary, ...index.filter((n) => n.id !== id)].sort(
        (a, b) => (b.publishedAt || b.updatedAt) - (a.publishedAt || a.updatedAt)
      );
      await putJSON(env, "news:index", next.slice(0, 500));
      await logAction(env, isNew ? "소식 새로 씀" : "소식 고침", `${status === "published" ? "[게시]" : "[임시]"} ${title}`);
      return json({ ok: true, item });
    }
    if (route === "news/delete" && method === "POST") {
      const id = clip(body.id, 40);
      const index = (await getJSON(env, "news:index", [])) || [];
      const target = index.find((n) => n.id === id);
      await env.MINGLE_KV.delete("news:" + id);
      await putJSON(env, "news:index", index.filter((n) => n.id !== id));
      await logAction(env, "소식 삭제", target ? target.title : id);
      return json({ ok: true });
    }

    /* ---------- 문의 ---------- */
    if (route === "inquiries/update" && method === "POST") {
      const id = clip(body.id, 120);
      if (!id.startsWith("inq:")) return bad("대상을 찾을 수 없어요.");
      const v = await getJSON(env, id, null);
      if (!v) return bad("문의를 찾을 수 없어요.", 404);
      if (body.state !== undefined) {
        if (!INQ_STATES.includes(body.state)) return bad("상태 값이 올바르지 않아요.");
        v.state = body.state;
        v.done = body.state === "done" || body.state === "dropped";
        if (v.done && !v.doneAt) v.doneAt = Date.now();
      }
      if (body.memo !== undefined) v.memo = clip(body.memo, 1000);
      v.updatedAt = Date.now();
      await putJSON(env, id, v);
      await logAction(env, "문의 상태 변경", `${v.name || ""} → ${v.state || "open"}`);
      return json({ ok: true, item: { id, ...v } });
    }
    if (route === "inquiries.csv" && method === "GET") {
      const list = await env.MINGLE_KV.list({ prefix: "inq:", limit: 1000 });
      const kindKo = { startup: "창업", partner: "제휴", space: "공간 제안" };
      const stKo = { open: "새 문의", contacted: "연락함", meeting: "미팅", done: "완료", dropped: "보류" };
      const rows = [["접수일시", "유형", "세부", "성함", "연락처", "지역", "내용", "상태", "메모", "소식 수신"]];
      for (const k of list.keys) {
        const v = await getJSON(env, k.name, null);
        if (!v) continue;
        const st = v.state || (v.done ? "done" : "open");
        rows.push([
          new Date((v.ts || 0) + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16),
          kindKo[v.kind] || v.kind || "", v.ptype || "", v.name || "", v.contact || "", v.region || "",
          v.message || "", stKo[st] || st, v.memo || "", v.marketing ? "동의" : "",
        ]);
      }
      const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
      await logAction(env, "문의 내려받기", `${rows.length - 1}건`);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="mingle-inquiries-${kstDate()}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    /* ---------- 밍글보드 글 ---------- */
    if (route === "posts" && method === "GET") {
      const list = await env.MINGLE_KV.list({ prefix: "post:", limit: 100 });
      const items = [];
      for (const k of list.keys) {
        const p = await getJSON(env, k.name, null);
        if (!p) continue;
        items.push({
          id: k.name, nick: p.nick, cat: p.cat, content: p.content, ts: p.ts,
          ups: p.ups || 0, cmts: p.cmts || 0, hidden: !!p.hidden, member: !!p.uid,
        });
      }
      return json({ items });
    }
    if (route === "posts/set" && method === "POST") {
      const id = clip(body.id, 120);
      if (!id.startsWith("post:")) return bad("대상을 찾을 수 없어요.");
      const p = await getJSON(env, id, null);
      if (!p) return bad("이미 지워진 글이에요.", 404);
      p.hidden = !!body.hidden;
      await putJSON(env, id, p);
      await logAction(env, p.hidden ? "게시글 숨김" : "게시글 다시 보임", clip(p.content, 40));
      return json({ ok: true });
    }
    if (route === "posts/delete" && method === "POST") {
      const id = clip(body.id, 120);
      if (!id.startsWith("post:")) return bad("대상을 찾을 수 없어요.");
      const p = await getJSON(env, id, null);
      await env.MINGLE_KV.delete(id);
      const cs = await env.MINGLE_KV.list({ prefix: "cmt:" + id + ":" });
      for (const k of cs.keys) await env.MINGLE_KV.delete(k.name);
      await logAction(env, "게시글 삭제", p ? clip(p.content, 40) : id);
      return json({ ok: true });
    }

    /* ---------- 활동 기록 ---------- */
    if (route === "log" && method === "GET") {
      return json({ items: await getJSON(env, "cms:log", []) });
    }

    return json({ message: "없는 주소예요." }, 404);
  } catch (e) {
    return json({ message: "처리 중 문제가 생겼어요." }, 500);
  }
}
