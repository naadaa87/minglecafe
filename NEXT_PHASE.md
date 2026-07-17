# 다음 단계 로드맵 — 통합 프롬프트 기준

이번 결과물은 통합 프롬프트의 **Phase 1~2(공개 웹 MVP)** 에 해당합니다.
다음 단계로 갈 때는 Claude Code에서 이 저장소를 열고, 통합 프롬프트 문서의 **[복사용 프롬프트 N]** 을 순서대로 사용하세요.

| 단계 | 만들 것 | 기술 전환 | 사용할 프롬프트 |
|---|---|---|---|
| Phase 3 | 회원가입·프로필, 동네 피드 고도화(댓글·저장·신고 큐), 모임 생성·신청·승인, 사람 탐색 | React + TypeScript + Vite, Cloudflare Workers(Hono), **D1 + Drizzle**로 데이터 이전 | 프롬프트 2 |
| Phase 4 | 관리자 대시보드, 신고/제재, 창업·제휴 CRM(리드 상태 관리), CMS, 금칙어 | RBAC, audit log, Turnstile 서버 검증 | 프롬프트 3 |
| Phase 5 | PWA 완성(서비스 워커·오프라인·웹푸시), 매장 QR 유입 추적, 체크인, 쿠폰 최소 기능 | R2(이미지 업로드), Queues | 프롬프트 4 |
| Phase 6 | 테스트(Vitest·Playwright), 접근성·성능 점검, 스테이징/프로덕션 분리, CI | GitHub Actions | 프롬프트 5 |
| Phase 7 | Android/iOS 앱 (푸시·딥링크·QR 스캐너·카메라) | Capacitor | 프롬프트 6 |

## 데이터 이전 메모
- 지금 KV의 `post:` 글들은 Phase 3에서 D1의 `posts` 테이블로 옮기는 마이그레이션 스크립트를 함께 만들면 유실 없이 이어집니다.
- `inq:` 문의는 CRM(leads)으로 이전 — kind/ptype 필드가 이미 상태 관리용으로 설계돼 있습니다.

## 지금 바로 할 수 있는 작은 개선 (개발 없이)
1. 인스타그램·카카오 채널 개설 → `site/js/main.js`의 SITE에 주소 입력
2. 매장 실사 촬영(밝은 낮 + 새벽 컷) → ASSET_TODO.md 위치에 교체
3. 첫 공식 모임(Korean Table) 날짜 확정 → 이벤트 페이지 empty state를 실제 일정 카드로 교체
