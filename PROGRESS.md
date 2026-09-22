# 진행 체크리스트

전체 계획의 현재 상태. 작업이 끝날 때마다 여기 체크박스를 채운다.
상세 내용은 `docs/05-roadmap.md`, 작업 지시 문구는 `docs/06-prompts.md`.

마지막 갱신: 2026-09-23 (4주차: apps/extension 운영 수동 확인, 실시간 추가 → DB 반영만 미확인)

**다음 작업 (순서대로)**
1. EXT-02 실시간 추가 → DB 반영 확인(1회차 ⑤에서 팝업 '추가 1'인데 DB에 없던 원인 확인 포함)
2. (5주차 전) 테스트 전용 Google 계정 준비
3. CI에서 단위 테스트 실행 (DB·네트워크 불필요한 것만)

---

## 0단계 — 기획 (완료)

- [x] 아이디어 구체화, 문제 정의
- [x] 계획서 9장 작성
- [x] 핵심 결정 10개 확정 (이름, 형태, 로그인, 동기화 방식, 정렬 기준 등)
- [x] 디자인 시안 4화면 + 디자인 토큰
- [x] 작업 문서 세트 (CLAUDE.md, docs/01~06)
- [ ] 남은 결정: 도메인 / 자동 업데이트·코드 서명 / 확장 웹스토어 게시 / 개발용 DB 분리(지금은 Supabase 프로젝트 하나라 로컬 서버도 운영 DB에 연결됨. 실제 계정 확인은 테스트 전용 계정으로만)

## 1주차 — 환경 설정 (완료)

**코드**
- [x] pnpm 워크스페이스 모노레포 (apps, packages, docs, .github)
- [x] apps/desktop: Electron + electron-vite + React
- [x] apps/api: Next.js, GET /api/v1/health
- [x] packages/shared: 공용 타입
- [x] 루트 설정 (package.json, tsconfig.base.json, .gitignore, .env.example)
- [x] CI 워크플로 파일
- [x] `pnpm install`, 락파일 생성, @baro/shared 워크스페이스 연결

**확인·수정**
- [x] `apps/api/.env`, `apps/desktop/.env` 생성 (각 폴더의 `.env.example` 복사, 루트 `.env` 삭제)
- [x] 락파일과 `apps/*/package.json` 버전 정합 확인 (`pnpm install` 재실행)
- [x] 렌더러 CSP에 개발용 `ws://localhost:*`, `http://localhost:*` 허용
- [x] `pnpm dev:api` → health 응답 확인
- [x] `pnpm dev:desktop` → 창 표시, 'API 상태 확인' 성공
- [x] `pnpm typecheck` 통과
- [x] 렌더러 중복 폴더 정리 (`src/renderer/src`로 통일, 타입은 `@baro/shared` 이름으로)
- [x] pnpm 10 설치 스크립트 허용 (`onlyBuiltDependencies`: electron, esbuild), `.gitignore`에 `supabase/.temp/`
- [x] apps/api 설정 중복 정리 (`next.config.mjs` 삭제, `next.config.ts`로 통일)
- [x] 앱의 API 호출을 메인 프로세스로 (`api:health` IPC, 렌더러 fetch 제거, CORS 없이 health 성공)
- [x] 두 앱 `package.json`에 `@baro/shared` 워크스페이스 의존성 복구 (락파일 반영)

**계정·배포**
- [x] Git 저장소 초기화, 첫 커밋, GitHub 푸시 (`.env` 제외 확인)
- [x] GitHub Actions CI 통과
- [x] Vercel 배포 (Root Directory = `apps/api`), 배포 주소에서 health 확인
- [x] Supabase 프로젝트 생성 (Seoul), 키 4개를 `apps/api/.env`·Vercel에 입력

## 2주차 — DB (완료)

- [x] 001_init.sql: 테이블 5개 (profiles, groups, bookmarks, visit_logs, api_tokens)
- [x] 002_indexes.sql: 인덱스 10개
- [x] 003_rls.sql: RLS 활성화 + 정책
- [x] 004_functions.sql: 트리거 2개 + `record_visit` 함수
- [x] packages/db: Drizzle 스키마, 마이그레이션과 대조
- [x] 확인용 SQL 작성: `supabase/checks/01~05` (구조·RLS 격리·record_visit·정리, 로컬 리허설 통과)
- [x] Supabase에 001~004 적용 (`supabase db push`)
- [x] 사용자 2명으로 RLS 격리 확인

## 3주차 — Google 로그인 (완료)

- [x] Google Cloud OAuth 클라이언트 생성, Supabase Auth 연결 (브라우저로 PKCE 왕복 확인, 포트 와일드카드 동작)
- [x] AUTH-01: 루프백 서버 + PKCE, Supabase Auth와 직접 코드 교환 (curl 교환 확인 → 앱 로그인·profiles 생성·2분 타임아웃 확인)
- [x] AUTH-02: safeStorage 토큰 저장, 자동 로그인, 토큰 직접 갱신
  - [x] curl로 `grant_type=refresh_token` 확인 (매번 새 refresh_token, 바로 전 토큰 재사용은 최신 토큰 반환, 두 세대 전은 400 `refresh_token_already_used`)
  - [x] safeStorage 저장("이 PC에 저장됨"), 재실행 자동 로그인, 만료 5분 전 갱신 (`BARO_REFRESH_MARGIN_SEC`로 반복 갱신 후 재실행 자동 로그인 확인)
  - [x] 로그인된 상태에서 재로그인이 실패하면 기존 로그인 상태를 화면에 유지 (로그인 상태와 마지막 시도 결과를 화면에서 분리)
  - [x] 오프라인으로 시작 시 저장 파일 유지 후 재연결 시 자동 로그인 (인터넷 끄고 실행 → 실패 메시지, 다시 켜니 1분 안에 자동 로그인)
- [x] AUTH-03: 로그아웃 (로컬 먼저 정리 → `POST /auth/v1/logout?scope=local`)
  - [x] 로그아웃 후 session.bin 삭제, 로그아웃 전 리프레시 토큰으로 curl 갱신 시 400 `refresh_token_not_found`
  - [x] 인터넷 끄고 로그아웃 → 로컬 로그아웃 성공 + "서버에 알리지 못함" 표시
  - [x] 오프라인 시작(파일만 있고 재시도 중)에서도 로그아웃 버튼 표시 → 로그아웃, 인터넷 켜고 1분 후에도 로그인 전 유지
  - [x] 로그아웃 후 재실행 시 자동 로그인 안 됨
- [x] SCR-01 로그인 화면 (시안 '로그인' + 토큰, 로딩·임시 홈·다시 연결 중 상태, 로그인 대기 취소)
  - [x] 첫 화면·좁은 창(900px 이하 미리보기 숨김)·취소·로그인·로그아웃
  - [x] 재실행 시 로그인 화면이 보이지 않고 바로 임시 홈
  - [x] 오프라인 시작 → '다시 연결하는 중' + 로그아웃 버튼 → 연결 후 복귀
  - [x] 빌드 버전에서 개발용 API 카드 숨김
  - [ ] 로그인 실패 문구(2분 타임아웃) 화면 표시, 스크린리더 읽기 (확인 생략)
- [x] 앱 재실행 후에도 로그인 유지 확인
- [x] 글꼴을 앱에 포함 (`@fontsource`, Gowun Batang 700 / IBM Plex Sans KR 400·500·600, woff2만, Google Fonts·CSP 외부 허용 제거)
  - [x] 오프라인 실행·빌드 버전(file://)에서 글꼴 표시 확인, `out/` 약 +5.2MB

## 4주차 — 북마크 API + 확장

- [x] API 인증(앱 토큰): JWKS(ES256)로 서명 직접 검증, `withAuth` (`baro_` 토큰은 자리만)
  - [x] 위조 ES256(진짜 kid)·HS256·alg none·형식 오류·서명 한 글자 변조 → 401 INVALID_TOKEN, 헤더 없음·Basic → 401 UNAUTHORIZED
  - [x] 실제 토큰 헤더 ES256 + JWKS와 같은 kid, `GET /me` 200 (개발 서버 반복 호출 약 70~120ms)
- [x] DB 접근 방식 C: `withUserDb` (트랜잭션마다 role=authenticated + request.jwt.claims, `current_user`·`auth.uid()` 확인 가드)
  - [x] `lib/db.test.ts` 4개 통과(트랜잭션 풀러 6543): 역할 전환·가드 동작·RLS 0행·트랜잭션 후 권한 원복
  - [x] `DATABASE_POOLER_URL` .env·Vercel 입력
- [x] 운영(Vercel)에서 `GET /me` 200, 서명 변조 토큰 401 INVALID_TOKEN
  - Vercel `SUPABASE_URL` 문제로 처음엔 모든 인증 요청이 500 → 원인 불명, 변수를 지우고 다시 넣어 해결
- [x] Vercel 함수 리전 `icn1`(서울) 고정 (`apps/api/vercel.json`)
  - 대시보드 설정만으로는 `iad1`(미국 동부) 그대로였음 → 코드로 고정, 응답 헤더 `icn1::icn1` 확인
  - 운영 `/me` 반복 호출 약 1.5초(iad1) → 약 60ms(icn1)
- [x] packages/shared: Zod 스키마 (BM-01~05용만. zod 3.25는 이미 설치돼 있었음)
  - [x] `httpUrl`(https:// 자동 부착, http/https만), `normalizeUrl`, `createBookmarkInput`(strict, allowDuplicate 없음), `updateBookmarkInput`, `bookmarkId`, `Bookmark` 타입
  - [x] 단위 테스트 45개 통과 (`pnpm --filter @baro/shared test`): 위험 스킴 8종 거부, 정규화, 필드 규칙
- [x] BM-01~05: `/bookmarks` CRUD, URL 정규화·중복 검사 (`lib/bookmarks.ts`, 라우트 2개)
  - [x] 통합 테스트 8개(가짜 사용자 A·B, 실제 DB): 남의 북마크 GET·PATCH·DELETE 404, 남의 groupId GROUP_NOT_FOUND, 같은 URL 409 + existingId, 동시 추가 5개 → 1개만 생성, 동시 수정 경쟁 → 409(catch 경로 실제 통과 확인)
  - [x] 실제 토큰 HTTP 확인(로컬 개발 서버): 위 항목 + `javascript:` 400 INVALID_URL, `allowDuplicate` 400, JSON 아님 400, id 형식 오류 404, 목록에 남의 것 없음
  - [x] 운영(Vercel) 확인: POST 201 → 목록에 있음 → DELETE 204 → 다시 GET 404, 확인용 북마크 DB에 0개 (응답 헤더 icn1::icn1)
- [x] `/metadata` + SSRF 차단 (`lib/metadata.ts`, 라우트 1개. 속도 제한은 아래 공통 항목으로 분리)
  - [x] 문서 먼저: 03-api.md `/metadata` 상세(포트 80·443, 접속 시점 IP 검사, 1MB·3초·리다이렉트 3회, 인코딩, 아이콘 규칙), CLAUDE.md 포트 제한, 06-prompts.md(cheerio → node-html-parser)
  - [x] 패키지: `undici` 7(8은 Node 22.19+ 필요해 CI의 Node 20과 안 맞음)·`ipaddr.js`·`node-html-parser`
  - [x] 단위·통합 테스트 82개 통과(`METADATA_LIVE=1`): IP 판정, 제목·아이콘 추출, EUC-KR(헤더·meta), 로컬 서버로 리다이렉트 3회 통과·4회 422, 목적지 내부 IP·포트·localhost 400(그 목적지로 요청 안 감), 3초 422, 5MB 페이지 1MB에서 끊기
  - [x] 운영용 `fetchMetadata`로 실제 요청 → 400: localhost, 127.0.0.1, [::1], ::ffff:127.0.0.1, 169.254.169.254, 2130706433, 0x7f.1, 0177.0.0.1, 사설 대역, 80·443 외 포트. 127.0.0.1에 테스트 서버를 띄워 둬도 요청 0건
  - [x] 인터넷 경유 → 400: localtest.me, 10.0.0.1.nip.io 등(DNS가 내부 IP), httpbin.org가 127.0.0.1·169.254.169.254·localtest.me로 리다이렉트. 같은 리다이렉터로 example.com은 성공
  - [x] 접속 시점 검사를 일부러 끄면 DNS 이름 경로 7개가 실패하는 것 확인(검사가 실제로 일을 함)
  - [x] 검사 우회 구조: `createMetadataFetcher(정책)`은 테스트 전용, 라우트는 얼린 `PRODUCTION_POLICY`로 만든 `fetchMetadata`만 씀(테스트가 다른 파일에서 쓰이면 실패). 환경 변수 스위치 없음
  - [x] 실제 사이트: github.com, naver.com("네이버"), yes24.com(ks_c_5601-1987=EUC-KR, "예스24"), http→https 리다이렉트
  - [x] `pnpm typecheck` 전체 통과, `next build` 통과, 빌드 서버에서 토큰 없음·잘못된 토큰 401
  - 참고: 이 PC(Windows)는 OS DNS가 169.254.x 답을 버려 `169.254.169.254.nip.io`는 접속 전에 422. 공개 DNS 답을 운영 IP 검사에 넣어 400 확인
  - [x] 실제 토큰으로 HTTP 확인(로컬 빌드 서버 `next start`): localhost·127.0.0.1·[::1]·169.254.169.254·2130706433·localtest.me·httpbin 내부 리다이렉트 2종 400 INVALID_URL, `:8080` 400(포트), `javascript:`·빈 주소 400, github·naver·yes24 200 제목 정상
  - 외부 사이트 테스트(httpbin·localtest.me·nip.io 등 11개)는 `METADATA_LIVE=1`일 때만 돈다(CI·기본 실행은 건너뜀)
  - [x] 운영(Vercel, `baro-web-bookmark-api.vercel.app`, 응답 헤더 icn1)에서 로컬과 같은 14개 결과 + 토큰 없음 401. Linux라 `169.254.169.254.nip.io`·`10.0.0.1.nip.io`도 400 확인(접속 시점 검사)
  - 확인용 세션은 로그아웃(204)으로 폐기
- [ ] 속도 제한(공통): 사용자당 분당 120회, `/metadata` 20회, `/sync/chrome` 10회 (서버리스라 DB·KV 저장소 필요, 따로 설계)
- [x] `/tokens` 3종, 토큰 해시 저장, 인증 미들웨어 (EXT-01)
  - [x] 설계 승인: 조회 전용 역할 `baro_token_resolver` + `private` 스키마, 확장 토큰은 지금 `GET /me`만, `last_used_at` 5분 단위
  - [x] 문서 먼저: 03-api.md(`/tokens` 상세, `TOKEN_NOT_FOUND`, 확장 토큰은 표시한 엔드포인트만), 02-db.md(역할·함수·트리거), CLAUDE.md(`withUserDb` 예외 하나)
  - [x] `005_api_tokens.sql`: `private.resolve_api_token(char(64)) returns uuid`(security definer, `search_path=''`), 5개 제한 트리거(profiles `FOR UPDATE` 잠금)
    - [x] PGlite 리허설 17개 통과 → 실제 DB에서 `BEGIN…ROLLBACK` 시험 실행(`postgres` 비슈퍼유저에서 역할 생성·부여·SET ROLE 동작, Supabase 기본 함수 권한 회수 확인, 롤백 후 잔여 없음) → `db push`
    - 참고: `token_hash`를 `text`로 비교하면 인덱스를 못 쓰고 전체 스캔(EXPLAIN 확인). 그래서 인자를 `char(64)`로
  - [x] 구현: `lib/api-tokens.ts`, `db.ts`의 `resolveApiTokenUser`, `withAuth(…, { allowApiToken })`, 라우트 2개, shared `createTokenInput`·`tokenId`
  - [x] 테스트: shared 52개, API 101개 통과(토큰 18개: 원본 비저장·목록에 해시 없음·폐기 즉시 반영·남의 토큰 404·동시 10개 발급 → 정확히 5개·last_used_at 5분·함수 속성과 역할별 권한·인덱스 사용·withAuth 허용/거부), typecheck 전체·`next build` 통과
  - [x] 실제 토큰 HTTP 확인(로컬 빌드 서버): 발급 201 + `cache-control: no-store`, 확장 토큰 `/me` 200, 확장 토큰으로 `/tokens` 3종·`/metadata` 401, 형식 오류·없는 토큰 같은 401, 검증 400, 없는 id 404, 동시 8개 → 201 4 + 409 4(합계 5), 목록 키에 해시 없음, 폐기 후 같은 토큰 401, 확인용 토큰 모두 정리
    - 참고: Git Bash에서 한글을 `-d` 인자로 넘기면 UTF-8이 아니게 전송돼 이름이 `����`로 저장됨(셸 문제, 파일로 보내면 정상). 확인 스크립트는 영문 이름 사용
  - [x] 운영(Vercel, 응답 헤더 icn1) 확인: 로컬과 같은 14단계 결과(동시 8개 → 201 4 + 409 4), 확인용 토큰 모두 폐기, 확인용 세션 로그아웃
- [x] `/sync/chrome` (full/partial, 트랜잭션)
  - [x] 설계 승인: URL당 한 행(나머지·manual 같은 URL은 건너뜀), `skippedReasons`, source와 토큰 종류 일치, 폴더 → 경로 이름 그룹(최상위 직속은 미분류), 크롬 프로필 사용자당 하나(v1)
  - [x] 대량 삭제 확인 추가: full 삭제가 (절반 이상 AND 20개 이상) 또는 100개 이상이면 409 `MASS_DELETE_CONFIRM_REQUIRED` + 개수, `confirmDeleteCount` 이하일 때만 실행
  - [x] 문서 먼저: 03-api.md(전체 규칙), 02-db.md(동기화용 제약), 01-spec.md(DESK-01·03, EXT-02·03 클라이언트 처리), CLAUDE.md
  - [x] `006_sync.sql`: `idx_groups_user_chrome`, 그룹 이름 유니크 DEFERRABLE로 재생성, `bookmarks_source_check`, `bookmarks_chrome_id_source_check`
    - [x] PGlite 리허설 16개 → 실제 DB `BEGIN…ROLLBACK` → `db push`
    - 참고: `ALTER CONSTRAINT … DEFERRABLE`은 PG17까지 외래 키에만 됨(리허설에서 발견, 지우고 다시 만드는 방식으로). `DEFERRABLE INITIALLY IMMEDIATE`는 행마다가 아니라 문장 끝에 검사
  - [x] 구현: `lib/sync-plan.ts`(순수 계획 함수), `lib/sync.ts`(사용자 잠금·한 번 읽기·500행 묶음 쓰기·URL 이동은 임시 값 단계·23505 한 번 재시도), 라우트(확장 토큰 허용, 2MB 413, maxDuration 60), shared `syncChromeInput`
  - [x] 테스트 137개 통과: 계획 26개 + DB 통합 10개(크롬 Bookmarks 파일 모양 샘플 `test/fixtures/chrome-bookmarks.json`: 중첩 3단계·같은 URL·북마클릿·chrome://·긴 제목·빈 폴더·같은 이름 폴더)
    - 5,000개: 첫 동기화 1.4초, 변화 없음 0.45초, 500개 수정 0.56초(로컬 → 서울 DB)
    - URL 맞바꿈 임시 값 단계를 빼면 `uq_bm_user_url` 위반으로 실패하는 것 확인(단계가 실제로 필요)
    - 23505 재시도 경로: 처음엔 확인 못 함 → 아래 apps/extension 작업 때 `lib/sync-retry.test.ts`로 확인
  - [x] 실제 토큰 HTTP 확인(로컬 빌드 서버): 샘플 동기화 200(10개 생성)→다시 보내면 0건, 확장 토큰 source=app 400, 확장 partial 200, 60개 → 20개 full 409(40/60, 아무것도 안 바뀜) → confirmDeleteCount 40으로 실행, 2MB 413, 인증 없음 401, 확인용 데이터 모두 정리(DB 북마크·그룹 0개 확인)
  - [x] 운영(Vercel, 응답 헤더 icn1) 확인: 로컬과 같은 8단계 결과, 확인용 데이터 정리 후 DB 북마크·그룹·토큰 0개, 확인용 세션 로그아웃
- [ ] apps/extension: manifest(key 고정), 팝업, 이벤트 리스너 (EXT-01~04)
  - 결정: EXT-02 포함, 409 미리보기는 서버에 추가, 개발 DB 없음(단일 DB 사실대로 기록)
  - 확인 계정: 테스트 계정 로그인이 두 번 본 계정으로 들어와 스크립트가 거절 → 사용자 결정으로 이번엔 본 계정(`1800f0a5…`, 실제 동기화 데이터 없음)으로 확인하고, 끝나면 이 계정에 테스트 데이터가 남지 않았는지 확인. 테스트 전용 계정은 5주차 전에 준비
  - [x] 문서: 01-spec.md '확장 동작 규칙'(구조·토큰·상태·변환·409·실시간), 03-api.md(409 `preview`, CORS 설명 정정), CLAUDE.md '크롬 확장 보안'
  - [x] 서버: 409 `details.preview`(지워질 북마크 최대 5개 제목·URL) — 운영 HTTP와 확장 확인 화면(예시 B-1~B-5, A-1~A-5)으로 확인
  - [x] 서버 테스트: 23505 재시도((a) 첫 시도 롤백·재시도분만 반영, withUserDb 2회 (b) 재시도도 23505면 500 INTERNAL_ERROR), confirmDeleteCount 39→409 / 40·41→실행(문서의 '이하' 규칙대로)
  - [x] 413 출처(운영): 3MB → 앱 413(JSON `PAYLOAD_TOO_LARGE`), 5MB → Vercel 413(text/plain `FUNCTION_PAYLOAD_TOO_LARGE`)
  - [x] 확장: MV3(권한 bookmarks·storage, host 2개, key로 ID `odhbbplpjlmkpggjocgiliebnmappfib`), 서비스 워커에서만 fetch·북마크 읽기, 팝업은 메시지만
  - [x] 확장 자동 테스트 32개(크롬 샘플 파일과 같은 트리, 가짜 storage·fetch)
  - [x] 수동 확인(운영 API, 크롬 테스트 프로필, 계정 `1800f0a5…`): 가짜 토큰 401, 토큰 저장(끝 4자리만), 첫 동기화(추가 10·건너뜀 2·같은 URL 1), 재동기화 0건, 60개 가져오기, 연결 끊고 B·C 삭제 → DB 70 유지, 409(40/70, 예시 B-1~5) → 팝업 닫았다 열어도 유지 → 취소(요청 없음, DB 70) → 재409 중 A-1~5 삭제(실시간 멈춤, DB 70) → 45개로 재409 → 확인 후 DB 25, 2MB 초과(2.59MB, 보내지 않음, DB 25)
    - 첫 2회차 시도는 연결된 채 A·B·C를 모두 지워 실시간 삭제로 60개가 사라져 처음부터 다시 함
    - 결과 문구를 받지 못한 단계(⑭·⑮ 일부·⑰·⑱)는 DB로 확인
    - 정리: 계정 북마크·그룹·토큰 0, 확장 토큰 폐기, `chrome_profile`·`last_synced_at` 원복, 세션 로그아웃·파일 삭제
  - [ ] 실시간 추가 → DB 반영(EXT-02): 1회차 ⑤ 팝업 '추가 1'이었으나 DB에 해당 행 없음, 일치 확인 못 함. 실시간 삭제는 반영된 것으로 보이나(첫 2회차 60개) 직접 확인은 못 함
    - 2026-09-23 재시도(example.com Ctrl+D): DB 반영 없음. 정리 때 확장 토큰을 폐기해 401로 거절된 것으로 보임(북마크·토큰 0, last_synced_at 없음) → 새 토큰으로 다시 확인 필요
- [ ] 크롬에서 북마크 추가 → DB 반영 확인

## 5주차 — 파일 동기화

- [ ] (5주차 시작 전, 실제 크롬 북마크 동기화 전에) 테스트 전용 Google 계정 준비 (OAuth 테스트 사용자 등록 포함). 이후 실제 계정 확인은 이 계정으로만
- [ ] DESK-01: Bookmarks 파일 탐색·파싱 (date_added 변환, 재시도)
- [ ] DESK-02: 프로필 목록, 파일 직접 선택
- [ ] IPC + preload 노출
- [ ] DESK-03: 자동·수동 동기화
  - [ ] `409 MASS_DELETE_CONFIRM_REQUIRED` → 삭제 개수 확인 대화상자 → `confirmDeleteCount` 붙여 재전송, 취소 시 다음 동기화에서 다시 묻기
  - [ ] 파싱 실패·의심스러운 결과면 `full`을 보내지 않기(DESK-01)
- [ ] SCR-02 첫 동기화 화면
- [ ] 파싱 단위 테스트
- [ ] 앱 실행만으로 전체 북마크 반영 확인

## 6주차 — 그리드 화면

- [ ] SCR-03: 반응형 그리드, 글자 타일 대체
- [ ] OPEN-01~03: 기본 브라우저 열기, 방문 기록, 우클릭 메뉴
- [ ] SCR-04: 추가·수정 모달 (메타데이터 자동 채움, 중복 확인)
- [ ] TanStack Query 캐시·낙관적 업데이트

## 7주차 — 검색·정렬

- [ ] SEARCH-01: 실시간 검색
- [ ] SEARCH-04: 정렬 5종 (visits_30d는 서버 집계)
- [ ] SEARCH-05: 정렬 설정 저장
- [ ] SET-01: 열기 방식
- [ ] DESK-04: 오프라인 캐시 + 배지
- [ ] 500개 초과 시 가상 스크롤
- [ ] 1,000개 기준 성능 측정

## 8주차 — MVP 마무리

- [ ] electron-builder로 Windows 설치 파일
  - [ ] `apps/desktop/.env.production`에 배포 주소 넣기 (localhost가 박힌 설치 파일 방지)
- [ ] E2E 테스트 (로그인 → 동기화 → 검색 → 열기)
- [ ] 보안 점검 (타인 데이터, SSRF, 위험 URL, 토큰 노출, Electron 설정)
- [ ] README 정리
- [ ] 다른 PC에 설치해 사용
- [ ] 8주 회고 기록

## 9~11주차 — v1.1

- [ ] GROUP-01~02 그룹·탭
- [ ] BM-07 고정, BM-08 태그
- [ ] SEARCH-06 드래그 정렬
- [ ] SEARCH-02 초성 검색, SEARCH-03 단축키
- [ ] DESK-05 트레이, DESK-06 전역 단축키
- [ ] SET-02 테마
- [ ] AUTH-04 회원 탈퇴
- [ ] 오래된 로그 정리 작업

## v2.0 후보

- [ ] EXT-05 현재 페이지 추가
- [ ] IO-01 HTML 가져오기, IO-02 내보내기
- [ ] SET-03 아이콘 크기
- [ ] 자동 업데이트 + 코드 서명
- [ ] 모바일 웹 화면
