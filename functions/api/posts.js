/**
 * 밍글보드 API — Cloudflare Pages Functions + KV
 * 필요한 설정: Pages 프로젝트에 KV 네임스페이스를 "MINGLE_KV" 이름으로 바인딩
 * (방법은 README_배포가이드.md 참고)
 */

const CATS = ["동네 소식", "추천·후기", "질문·도움", "나눔·교환", "분실·습득"];
const MAX_LIST = 50;
const RATE_MAX = 5;        // 10분당 최대 글 수 (IP 기준)
const RATE_WINDOW = 600;   // 초

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

function hasContactInfo(text) {
  const phone = /01[016789][ .\-]?\d{3,4}[ .\-]?\d{4}/;
  const kakao = /(카톡|카카오톡?|kakao(talk)?)\s*(아이디|id)?\s*[:：]?\s*[A-Za-z0-9_.\-]{3,}/i;
  const insta = /(인스타|insta(gram)?)\s*[:：@]?\s*[A-Za-z0-9_.]{3,}/i;
  return phone.test(text) || kakao.test(text) || insta.test(text);
}

export async function onRequestGet({ request, env }) {
  if (!env.MINGLE_KV) return json({ message: "KV 바인딩(MINGLE_KV)이 아직 연결되지 않았어요." }, 503);
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 30, MAX_LIST);

  const list = await env.MINGLE_KV.list({ prefix: "post:", limit });
  const posts = [];
  for (const key of list.keys) {
    const raw = await env.MINGLE_KV.get(key.name);
    if (!raw) continue;
    try {
      const p = JSON.parse(raw);
      posts.push({ id: key.name, nick: p.nick, cat: p.cat, content: p.content, ts: p.ts });
    } catch {}
  }
  return json({ posts });
}

export async function onRequestPost({ request, env }) {
  if (!env.MINGLE_KV) return json({ message: "KV 바인딩(MINGLE_KV)이 아직 연결되지 않았어요." }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ message: "요청 형식이 올바르지 않아요." }, 400); }

  const nick = String(body.nick || "").trim();
  const cat = String(body.cat || "");
  const content = String(body.content || "").trim();
  const honeypot = String(body.website || "");

  if (honeypot) return json({ message: "잠시 후 다시 시도해 주세요." }, 400);
  if (nick.length < 2 || nick.length > 12) return json({ message: "닉네임은 2~12자로 적어 주세요." }, 400);
  if (!CATS.includes(cat)) return json({ message: "카테고리를 선택해 주세요." }, 400);
  if (content.length < 2) return json({ message: "내용을 조금만 더 적어 주세요." }, 400);
  if (content.length > 600) return json({ message: "600자까지 쓸 수 있어요." }, 400);
  if (hasContactInfo(nick + " " + content))
    return json({ message: "전화번호·카톡 아이디 같은 개인 연락처는 아직 올릴 수 없어요. 게시판 안에서 소통해 주세요." }, 400);

  // IP 기준 도배 방지
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rlKey = "rl:" + ip;
  const count = Number((await env.MINGLE_KV.get(rlKey)) || 0);
  if (count >= RATE_MAX) return json({ message: "글을 너무 자주 올리고 있어요. 잠시 쉬었다가 다시 써 주세요." }, 429);
  await env.MINGLE_KV.put(rlKey, String(count + 1), { expirationTtl: RATE_WINDOW });

  // 최신 글이 먼저 나오도록 역시간 키 사용
  const ts = Date.now();
  const id = "post:" + String(1e13 - ts) + ":" + Math.random().toString(36).slice(2, 8);
  await env.MINGLE_KV.put(id, JSON.stringify({ nick, cat, content, ts }));

  return json({ ok: true, id }, 201);
}
