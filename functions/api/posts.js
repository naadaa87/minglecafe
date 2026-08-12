/**
 * 밍글보드 API — /api/posts
 * 저장소: KV(MINGLE_KV). 기존 "post:" 키를 그대로 읽고 씁니다.
 *   post:<역순ts>:<rand>          글
 *   cmt:<postId>:<ts>:<rand>      댓글
 *   up:<postId>:<who>             손들기(중복 방지)
 */
import { json, bad, currentUser, hasContactInfo, riskyIntent, rateLimit, clientIp, safeText, sha256 }
  from "../../lib/util.js";

const CATS = ["동네 소식", "추천·후기", "질문·도움", "나눔·교환", "분실·습득", "같이 하실 분"];
const MAX_LIST = 60;

export async function onRequestGet({ request, env }) {
  if (!env.MINGLE_KV) return json({ message: "게시판이 아직 연결되지 않았어요. (KV 바인딩 MINGLE_KV 필요)" }, 503);
  const url = new URL(request.url);

  /* 댓글 목록: /api/posts?comments=post:xxx */
  const forPost = url.searchParams.get("comments");
  if (forPost) {
    if (!forPost.startsWith("post:")) return bad("대상을 찾을 수 없어요.");
    const cs = await env.MINGLE_KV.list({ prefix: "cmt:" + forPost + ":", limit: 100 });
    const items = [];
    for (const k of cs.keys) {
      const raw = await env.MINGLE_KV.get(k.name);
      if (!raw) continue;
      try { const c = JSON.parse(raw); items.push({ nick: c.nick, content: c.content, ts: c.ts }); } catch {}
    }
    items.sort((a, b) => a.ts - b.ts);
    return json({ comments: items });
  }

  const limit = Math.min(Number(url.searchParams.get("limit")) || 30, MAX_LIST);
  const me = await currentUser(request, env);

  const list = await env.MINGLE_KV.list({ prefix: "post:", limit });
  const posts = [];
  for (const key of list.keys) {
    const raw = await env.MINGLE_KV.get(key.name);
    if (!raw) continue;
    try {
      const p = JSON.parse(raw);
      if (p.hidden) continue;
      posts.push({
        id: key.name,
        nick: p.nick,
        cat: p.cat,
        content: p.content,
        ts: p.ts,
        ups: p.ups || 0,
        cmts: p.cmts || 0,
        member: !!p.uid,
        mine: !!(me && p.uid && p.uid === me.id),
      });
    } catch {}
  }
  return json({ posts, me: me ? { nickname: me.nickname, level: me.level } : null });
}

export async function onRequestPost({ request, env }) {
  if (!env.MINGLE_KV) return json({ message: "게시판이 아직 연결되지 않았어요." }, 503);

  const b = await request.json().catch(() => null);
  if (!b) return bad("요청 형식이 올바르지 않아요.");
  if (b.website) return bad("잠시 후 다시 시도해 주세요.");

  const me = await currentUser(request, env);
  const action = String(b.action || "post");

  /* ---------- 댓글 ---------- */
  if (action === "comment") {
    const postId = safeText(b.postId, 80);
    const content = safeText(b.content, 300);
    if (!postId.startsWith("post:")) return bad("어떤 글에 다는 댓글인지 알 수 없어요.");
    if (content.length < 2) return bad("댓글을 조금만 더 적어 주세요.");
    if (hasContactInfo(content)) return bad("전화번호·카톡 아이디 같은 개인 연락처는 남길 수 없어요. 게시판 안에서 이야기해 주세요.");
    if (!(await rateLimit(env, "cmt:" + (me?.id || clientIp(request)), 15, 600)))
      return bad("댓글을 너무 자주 달고 있어요. 잠시 쉬었다 해 주세요.", 429);

    const raw = await env.MINGLE_KV.get(postId);
    if (!raw) return bad("이미 지워진 글이에요.", 404);

    const nick = me ? me.nickname : safeText(b.nick, 12) || "이웃";
    const ts = Date.now();
    await env.MINGLE_KV.put(
      `cmt:${postId}:${ts}:${Math.random().toString(36).slice(2, 7)}`,
      JSON.stringify({ nick, content, ts, uid: me?.id || null })
    );
    const p = JSON.parse(raw);
    p.cmts = (p.cmts || 0) + 1;
    await env.MINGLE_KV.put(postId, JSON.stringify(p));
    return json({ ok: true }, 201);
  }

  /* ---------- 손들기 (저요!) ---------- */
  if (action === "up") {
    const postId = safeText(b.postId, 80);
    if (!postId.startsWith("post:")) return bad("대상을 찾을 수 없어요.");
    const who = me?.id || (await sha256(clientIp(request))).slice(0, 16);
    const key = `up:${postId}:${who}`;
    if (await env.MINGLE_KV.get(key)) return json({ ok: true, already: true });
    const raw = await env.MINGLE_KV.get(postId);
    if (!raw) return bad("이미 지워진 글이에요.", 404);
    const p = JSON.parse(raw);
    p.ups = (p.ups || 0) + 1;
    await env.MINGLE_KV.put(postId, JSON.stringify(p));
    await env.MINGLE_KV.put(key, "1", { expirationTtl: 60 * 86400 });
    return json({ ok: true, ups: p.ups });
  }

  /* ---------- 새 글 ---------- */
  const nick = me ? me.nickname : safeText(b.nick, 12);
  const cat = String(b.cat || "");
  const content = safeText(b.content, 600);

  if (!me && (nick.length < 2 || nick.length > 12))
    return bad("닉네임은 2~12자로 적어 주세요.");
  if (!CATS.includes(cat)) return bad("어떤 이야기인지 골라 주세요.");
  if (content.length < 2) return bad("내용을 조금만 더 적어 주세요.");
  if (hasContactInfo(nick + " " + content))
    return bad("전화번호·카톡 아이디 같은 개인 연락처는 올릴 수 없어요. 게시판 안에서 이야기해 주세요.");
  if (riskyIntent(content))
    return bad("영업·투자·데이트 목적의 글은 올릴 수 없어요. 커뮤니티 가이드를 한 번 봐 주세요.");

  const rlKey = me ? "post:u:" + me.id : "post:ip:" + clientIp(request);
  if (!(await rateLimit(env, rlKey, me ? 10 : 5, 600)))
    return bad("글을 너무 자주 올리고 있어요. 잠시 쉬었다가 다시 써 주세요.", 429);

  const ts = Date.now();
  const id = "post:" + String(1e13 - ts) + ":" + Math.random().toString(36).slice(2, 8);
  await env.MINGLE_KV.put(
    id,
    JSON.stringify({ nick, cat, content, ts, uid: me?.id || null, ups: 0, cmts: 0 })
  );
  return json({ ok: true, id }, 201);
}

/* ---------- 내 글 지우기 ---------- */
export async function onRequestDelete({ request, env }) {
  if (!env.MINGLE_KV) return json({ message: "게시판이 아직 연결되지 않았어요." }, 503);
  const me = await currentUser(request, env);
  if (!me) return bad("로그인한 회원만 글을 지울 수 있어요.", 401);

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id.startsWith("post:")) return bad("대상을 찾을 수 없어요.");
  const raw = await env.MINGLE_KV.get(id);
  if (!raw) return json({ ok: true });
  const p = JSON.parse(raw);
  if (p.uid !== me.id && me.role !== "admin") return bad("내가 쓴 글만 지울 수 있어요.", 403);

  await env.MINGLE_KV.delete(id);
  const cs = await env.MINGLE_KV.list({ prefix: "cmt:" + id + ":" });
  for (const k of cs.keys) await env.MINGLE_KV.delete(k.name);
  return json({ ok: true });
}
