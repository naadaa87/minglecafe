# 밍글 홈페이지 — 배포 가이드

이 폴더 하나면 밍글 홈페이지를 실제 주소로 열 수 있습니다.
비용은 Cloudflare 무료 플랜으로 충분해요. 순서대로 따라오시면 됩니다.

---

## 0. 폴더 구성

```
밍글-홈페이지/
├─ site/                ← 홈페이지 본체 (13개 페이지 + 이미지 + 스타일)
├─ functions/api/       ← 밍글보드 · 문의 접수 API (Cloudflare가 자동 인식)
├─ wrangler.toml        ← CLI 배포용 설정 (건드릴 필요 없음)
├─ README_배포가이드.md  ← 지금 이 문서
├─ KNOWN_LIMITATIONS.md ← 이번 버전에서 안 되는 것 (솔직 버전)
├─ NEXT_PHASE.md        ← 다음 단계 개발 로드맵 (통합 프롬프트 기준)
└─ ASSET_TODO.md        ← 나중에 교체·추가하면 좋은 자산 목록
```

---

## 1. 배포하기 (둘 중 하나 선택)

### 방법 A — GitHub 연동 (추천: 한 번 해 두면 수정할 때마다 자동 배포)

1. GitHub에 새 저장소를 만들고 **이 폴더 전체**를 올립니다.
2. [Cloudflare 대시보드](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → 방금 만든 저장소 선택.
3. 빌드 설정은 아래처럼:
   - Framework preset: **None**
   - Build command: **(비워 두기)**
   - Build output directory: **`site`**
4. **Save and Deploy** → 1~2분 뒤 `https://프로젝트명.pages.dev` 주소가 생깁니다.

### 방법 B — 명령어 한 줄 (컴퓨터에 Node.js가 있다면)

```bash
cd 밍글-홈페이지
npx wrangler login        # 브라우저에서 Cloudflare 로그인 (최초 1회)
npx wrangler pages deploy # wrangler.toml이 site 폴더를 자동으로 올립니다
```

> ⚠️ 대시보드의 **"직접 업로드(드래그 앤 드롭)"** 방식은 페이지는 보이지만
> `functions/`(밍글보드·문의 API)가 **동작하지 않습니다.** 꼭 A 또는 B로 배포해 주세요.

---

## 2. 밍글보드 켜기 — KV 연결 (5분)

게시판과 문의 폼은 Cloudflare **KV**(무료 저장소)에 데이터를 씁니다.

1. 대시보드 → **Workers & Pages** → **KV** → **Create a namespace** → 이름은 자유 (예: `mingle-board`).
2. Pages 프로젝트로 이동 → **Settings** → **Functions** → **KV namespace bindings** → **Add binding**
   - Variable name: **`MINGLE_KV`** ← 반드시 이 이름 그대로
   - KV namespace: 방금 만든 것 선택
3. **재배포** 한 번 (Deployments 탭 → Retry, 또는 새로 push).

이제 사이트에서 글을 쓰면 진짜로 저장됩니다.

---

## 3. 글·문의 확인하고 관리하기

관리자 화면은 다음 단계에서 만듭니다(NEXT_PHASE 참고). 지금은 KV 대시보드가 관리자 화면이에요.

- 대시보드 → **KV** → 네임스페이스 클릭 → 키 목록이 보입니다.
  - `post:...` = 밍글보드 글 (값을 열면 닉네임·내용 확인)
  - `inq:...` = 창업·제휴 문의 (성함·연락처·내용)
- **글 삭제** = 해당 `post:` 키 삭제. 그게 전부입니다.
- 문의는 이메일 알림이 아직 없으니, **2~3일에 한 번 `inq:` 키를 확인**하는 습관을 추천해요.

---

## 4. 값 바꾸기 (배포 전 딱 세 군데)

| 무엇을 | 어디서 |
|---|---|
| 이메일 · 인스타그램 · 카카오톡 채널 주소 | `site/js/main.js` 맨 위 **SITE 객체** |
| 사이트 도메인 (검색엔진용) | `site/robots.txt` · `site/sitemap.xml` 의 `REPLACE-YOUR-DOMAIN` |
| 커스텀 도메인 연결 | Pages 프로젝트 → **Custom domains** → 도메인 추가 |

인스타·카카오 주소가 아직 없다면 그냥 두세요. 사이트에 자동으로 "(준비 중)"으로 표시됩니다.

---

## 5. 로컬에서 미리 보기

- 간단히: `site/index.html`을 브라우저로 열면 대부분 보입니다. (게시판 자리에는 "미리보기 상태" 안내가 뜹니다 — 정상이에요.)
- 완전하게(게시판 포함): `npx wrangler pages dev site` 실행 후 안내되는 주소로 접속.

---

## 6. 자주 묻는 것

**Q. 게시판에 "미리보기 화면이에요"라고 떠요.**
KV 바인딩(2번)이 안 됐거나, 직접 업로드로 배포한 경우예요. 방법 A/B로 배포 + `MINGLE_KV` 바인딩을 확인하세요.

**Q. 이상한 글이 올라오면요?**
연락처(전화·카톡 ID) 자동 차단과 도배 제한(IP당 10분에 5개)이 이미 켜져 있어요. 그래도 올라온 글은 KV에서 키 삭제로 바로 내릴 수 있습니다.

**Q. 사진을 바꾸고 싶어요.**
`site/img/` 안의 같은 파일명으로 교체하면 끝. 어떤 사진을 실사로 바꾸면 좋은지는 `ASSET_TODO.md`에 정리해 뒀어요.

---

문의: spaceblank0100@gmail.com · 대표 최시준
