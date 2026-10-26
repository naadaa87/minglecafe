/**
 * /_tpl/ 은 소식 페이지가 안에서만 쓰는 틀입니다. 바깥에서 직접 열면 404로 돌려보냅니다.
 * (functions/news 는 env.ASSETS 로 읽기 때문에 이 코드를 거치지 않습니다)
 */
export async function onRequest() {
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" } });
}
