# 밍글 홈페이지 — 배포·운영 가이드

주소: https://hellomingle.kr  ·  관리자: https://hellomingle.kr/admin/

GitHub `main` 브랜치에 올라가면 Cloudflare Pages가 1~2분 안에 자동으로 배포합니다.
따로 빌드 명령을 넣을 필요는 없어요. (`site/` 폴더가 그대로 홈페이지입니다)

---

## 1. 폴더 구성

```
minglecafe/
├─ site/                  ← 홈페이지 본체 (Cloudflare가 이 폴더를 그대로 올립니다)
│  ├─ guide/              ← 밍글 가이드 글 23편 + 모음 페이지 (자동 생성)
│  ├─ faq.html            ← 자주 묻는 질문 (자동 생성)
│  ├─ admin/              ← 관리자 화면
│  ├─ _tpl/news.html      ← 소식 페이지 머리·꼬리 틀 (자동 생성, 직접 열 일 없음)
│  ├─ sitemap.xml, rss.xml, robots.txt  (자동 생성)
│  └─ _routes.json        ← 이미지·CSS·JS는 서버 코드를 거치지 않게 하는 설정
├─ functions/             ← 서버 코드 (Cloudflare Pages Functions)
│  ├─ _middleware.js      ← 검색 확인 코드·공지 배너·페이지별 검색 문구를 모든 페이지에 끼워 넣음
│  ├─ news/               ← 밍글 소식 페이지 (/news/), 소식 RSS·사이트맵
│  └─ api/
│     ├─ cms/             ← 관리자 전용: 소식·배너·메뉴·검색 설정·문의 상태·게시글 관리
│     ├─ content/         ← 공개: 메뉴, 소식 목록
│     └─ (기존) admin, auth, posts, meetups, checkin, inquiries, reports, status
├─ lib/                   ← 서버 공통 코드 (md.js, cms.js 추가)
├─ content/               ← 가이드 글 원고(guides/*.md), 자주 묻는 질문 원고(faq.md), 작성 기준
├─ tools/build.mjs        ← 원고 → HTML 변환 스크립트
├─ ADMIN_GUIDE.md         ← 관리자 화면 사용법
└─ wrangler.toml          ← KV·D1 연결 설정 (건드리지 않음)
```

---

## 2. 배포 후 한 번만 확인할 것

1. **관리자 PIN** — Cloudflare 대시보드 → Workers & Pages → 밍글 프로젝트 → Settings → Variables and Secrets 에 `ADMIN_PIN`이 Secret으로 들어 있는지 확인. 없으면 추가하고 다시 배포.
2. **관리자 화면 열기** — https://hellomingle.kr/admin/ 에서 PIN으로 들어가 "오늘 할 일"이 뜨는지 확인.
3. **네이버·구글 등록** — 관리자 → 검색 노출(SEO) → 검색엔진 등록 탭에 순서대로 적혀 있어요. 요약하면:
   - 네이버 서치어드바이저(https://searchadvisor.naver.com) → 사이트 등록 → "HTML 태그" 방식 → 소유확인
     (hellomingle.kr 확인 코드 `efb71249…fc87`은 2026.10.27부터 모든 페이지 `<head>`에 들어 있습니다. 값은 `lib/cms.js`의 `STATIC_VERIFICATION`)
   - 사이트맵 제출: `https://hellomingle.kr/sitemap.xml`, `https://hellomingle.kr/news/sitemap.xml`
   - RSS 제출: `https://hellomingle.kr/rss.xml` (가이드), `https://hellomingle.kr/news/rss.xml` (소식)
   - 구글 서치 콘솔(https://search.google.com/search-console)도 같은 방식으로 확인 후 사이트맵 두 개 제출
4. **네이버 플레이스 주소** — 매장이 네이버 지도에 등록돼 있다면 관리자 → 사이트 정보에 주소를 넣어 주세요. 검색엔진이 홈페이지와 매장을 같은 곳으로 묶어 봅니다.

---

## 3. 이번에 바뀐 것 (2026.10)

**검색 노출**
- 밍글 가이드 23편: 건대 24시간 카페·카공·새벽 디저트·무인카페 이용법(방문), 화양동·스터디 모임·언어교환·모각작(커뮤니티), 무인카페 창업 비용·상권·관리 루틴·장비·샵인샵·건물 편의시설·디저트 입점(창업·제휴), 영어 2편
- 자주 묻는 질문 25개 (`/faq`)
- 모든 가이드·FAQ에 검색엔진용 구조화 데이터(글, 자주 묻는 질문, 현재 위치) 적용
- 매장 정보(주소·24시간·결제 수단·지도)를 검색엔진용 구조화 데이터로 정리
- 메뉴 목록을 HTML로 미리 그려 둠 — 네이버처럼 자바스크립트를 잘 안 읽는 검색엔진도 메뉴를 읽음
- 주소 정리: `/store.html` → `/store` (Cloudflare가 실제로 쓰는 주소로 맞춤. 예전 주소도 그대로 열립니다)
- 페이지 제목·설명을 검색어 기준으로 다시 씀, 사이트맵·RSS 자동 생성
- 홈·매장·메뉴·커뮤니티·창업·제휴 페이지에 관련 가이드 연결

**관리자 화면** (`/admin/`) — 자세한 사용법은 `ADMIN_GUIDE.md`
- 오늘 할 일, 매장 상태·품절, 문의 관리(상태·메모·엑셀 내려받기), 커뮤니티 관리(모임 검수·신고·게시글 숨김/삭제)
- 소식·공지 글 쓰기 → `/news/`에 바로 게시, 검색엔진에도 노출
- 상단 공지 배너, 메뉴·가격 편집, 검색 노출 설정(사이트 확인 코드·페이지별 문구·전체 점검), 사이트 정보, 활동 기록

---

## 4. 가이드 글을 고치거나 더하고 싶을 때

가이드 글은 `content/guides/` 안의 원고(.md)에서 만들어집니다. 원고를 고친 뒤 아래 한 줄을 실행하면 `site/` 안의 페이지·사이트맵·RSS가 다시 만들어져요.

```bash
node tools/build.mjs
```

터미널이 번거로우시면 Claude에게 "가이드 글 OO 고쳐서 저장소에 반영해 줘"라고 요청하시면 됩니다.
날짜가 있는 소식(새 메뉴, 점검, 모임 일정)은 원고 없이 **관리자 화면 → 소식 · 공지 글**에서 바로 쓰는 게 빠릅니다.

글 작성 기준(사실 확인, 금지 표현, 분량)은 `content/WRITING_BRIEF.md`에 있어요.

---

## 5. 직접 고치면 안 되는 파일

- `site/guide/*.html`, `site/faq.html`, `site/sitemap.xml`, `site/rss.xml`, `site/robots.txt`, `site/_tpl/news.html`, `site/js/md.js` — 빌드가 다시 만들면서 덮어씁니다. 원고(`content/`)나 `tools/build.mjs`를 고쳐 주세요.
- 모든 페이지의 머리(헤더)·전체 메뉴·푸터·하단 탭도 `tools/build.mjs`에서 한 번에 맞춥니다. 메뉴 항목을 바꾸려면 그 파일의 `header()`, `sheet()`, `footer()`를 고치고 빌드하세요.
- `wrangler.toml` — KV·D1 연결이 들어 있습니다. 대시보드에서 바인딩을 추가해도 이 파일이 우선이에요.

---

## 6. 로컬에서 미리 보기 (선택)

```bash
npx wrangler d1 execute mingle-db --local --file=schema.sql   # 처음 한 번
npx wrangler pages dev --binding ADMIN_PIN=1234               # http://127.0.0.1:8788
```

---

문의: spaceblank0100@gmail.com · 대표 최시준
