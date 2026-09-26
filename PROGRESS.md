# 진행 체크리스트

전체 계획의 현재 상태. 작업이 끝날 때마다 여기 체크박스를 채운다.
상세 내용은 `docs/05-roadmap.md`, 작업 지시 문구는 `docs/06-prompts.md`.

마지막 갱신: 2026-09-26 (SEARCH-04 완료: 정렬 4종·recentVisits·BM-07 고정 맨 앞. 대량 삭제 모달 inert 완료, CI 뒷정리 수정(e6413a0))

**다음 작업 (순서대로)**
1. **SEARCH-05** 정렬 설정 저장(`PATCH /me`, 켤 때 복원)
2. 미뤄 둔 것: 7주차 SCR-05의 앱+확장 한계 안내

---

## 0단계 — 기획 (완료)

- [x] 아이디어 구체화, 문제 정의
- [x] 계획서 9장 작성
- [x] 핵심 결정 10개 확정 (이름, 형태, 로그인, 동기화 방식, 정렬 기준 등)
- [x] 디자인 시안 4화면 + 디자인 토큰
- [x] 작업 문서 세트 (CLAUDE.md, docs/01~06)
- [ ] 남은 결정: 도메인 / 자동 업데이트·코드 서명 / 확장 웹스토어 게시
- [ ] 개발용 DB 분리 (2026-09-24 검토: **지금은 하지 않기로**. 6주차를 테스트 계정으로 해보고 불편하면 그때)
  - 지금 상태: Supabase 프로젝트 하나라 로컬 개발 서버·테스트도 운영 DB에 붙는다. 실제 계정 확인은 테스트 전용 계정(`stte35540@…`)으로만 한다
  - 미루는 이유: 실수로 본 계정을 건드리는 위험은 **테스트 계정 격리로 이미 막혀 있다**. 남는 이득은 '운영 DB 자체를 안 건드림' 하나인데, 그 대가로 아래 설정과 pause 관리가 붙는다
  - 무료 플랜 제약: 조직당 **활성 프로젝트 2개**(지금 1개 사용). **1주일 비활성이면 자동 일시정지** — 개발 DB는 간헐적으로 쓰므로 자주 걸리고, 쓸 때마다 깨워야 한다
  - 하게 되면 할 일 (약 30~40분, 대부분 대시보드 조작이라 사람이 해야 함)
    - [ ] Supabase 개발 프로젝트 생성(Seoul)
    - [ ] `supabase link` 대상을 개발 프로젝트로 바꿔 `db push`로 001~007 적용
    - [ ] Google Cloud OAuth 클라이언트에 새 콜백 추가: `https://<새ref>.supabase.co/auth/v1/callback` (**새 클라이언트는 만들지 않는다**, URI만 추가)
    - [ ] 새 프로젝트 Auth에 Google provider(같은 client id/secret)와 Redirect URLs(`http://127.0.0.1:*/callback`) 설정
    - [ ] `apps/api/.env`·`apps/desktop/.env`를 개발 프로젝트 키로 교체 (Vercel 운영 환경변수는 그대로 둔다)
    - [ ] 테스트 계정으로 로그인 왕복·동기화 한 번 확인, `DATABASE_POOLER_URL`도 개발 DB로 바뀌었는지 확인(테스트가 이 값을 쓴다)

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

## 4주차 — 북마크 API + 확장 (완료)

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
- [x] 속도 제한(공통): 사용자당 분당 120회, `/metadata` 20회, `/sync/chrome` 10회
  - [x] 결정: **Supabase 테이블**에 센다(새 서비스 가입 없음). Upstash·Vercel KV는 지연이 더 낮지만 사용자가 본인 한 명인 학습 프로젝트에 의존성을 늘릴 이유가 약하다
  - [x] 결정: 앱 토큰·확장 토큰은 **같은 사용자면 한 카운터를 나눠 쓴다**(03-api.md의 '사용자당' 그대로)
  - [x] 문서 먼저: 03-api.md '속도 제한' 절, 02-db.md '속도 제한 (007)', CLAUDE.md(예외가 둘로 — 각각 전용 역할로 `private` 함수 하나)
  - [x] `007_rate_limits.sql`: `rate_limits` 표(PK `(user_id,bucket,window_start)`), 전용 역할 `baro_rate_limiter`, `private.hit_rate_limit(uuid, text[])`
    - [x] 실제 DB `BEGIN…ROLLBACK` 리허설 → 이력(`schema_migrations`)에 007 기록하며 적용
    - 리허설에서 잡은 것: `returns table (bucket, count)`로 두면 PL/pgSQL이 그 이름을 변수로 잡아 컬럼 참조와 충돌한다(42702) → `hit_bucket`·`hit_count`로
    - 권한 분리 확인: 전용 역할은 `rate_limits` 직접 읽기도, 다른 `private` 함수(`resolve_api_token`) 호출도 거절. `authenticated`는 `hit_rate_limit`을 못 부르고 표도 0행(RLS 켜고 정책 없음)
  - [x] 구현: `lib/rate-limit.ts` + `withAuth(…, { rateBucket })`. 인증 통과 뒤·**라우트 트랜잭션 밖**에서 센다(요청이 실패해 롤백돼도 카운트가 남게)
    - 고정 윈도(분 단위). 한 요청이 `global`+해당 버킷을 **왕복 1회**로 함께 올린다
    - 세지 못하면 막지 않는다(fail-open). 속도 제한 고장으로 서비스 전체가 멈추는 편이 더 나쁘다
    - drizzle이 JS 배열을 파라미터로 펼쳐 `($2,$3)::text[]`가 되는 문제 → `sql.param(buckets)`로 감쌈
  - [x] 테스트 7개: 한도 초과·엔드포인트 버킷 우선·두 행 생성·사용자당 합산·fail-open·전용 역할이 다른 표 접근 거절
  - [x] 실제 토큰 HTTP 확인(로컬 개발 서버, 테스트 계정): `/metadata` **20회 통과 → 21회째부터 429**, `retry-after` 헤더와 `details.bucket` 정상, 다음 분에 풀림, `/me`는 metadata 한도와 무관, `global`을 120으로 채우면 `/me`·`/bookmarks`·`/tokens` 모두 429
  - [x] 로컬 확인 뒤 정리: `rate_limits` 0행, 확인용 세션 로그아웃(204)
  - [x] **운영(Vercel) 확인**: `/metadata` 20회 통과 → 21회째부터 **429**, `Retry-After` 헤더·`details.bucket` 정상(배포 전후 두 번 확인)
  - [x] 지연 측정에서 설계 오류를 잡음: '왕복 1회'로 설계했는데 `set local role`이 트랜잭션을 요구해 실제로는 **4왕복**이었다
    - 로컬→서울 DB 실측 **56ms → 32ms**(한 문장으로 바꾼 뒤). `select 1` 바닥값이 19ms라 나머지는 왕복 자체의 비용
    - 운영 `/me` − `/health` 기준선: **77ms → 28ms**
    - 역할 경계는 EXECUTE 권한으로 지킨다(함수는 `baro_rate_limiter`에만 주어져 PostgREST로는 못 부른다). API는 그 역할의 멤버로서 상속받아 한 문장으로 부른다. CLAUDE.md·02-db.md도 정정
  - [x] 운영 확인 뒤 정리: `rate_limits` 0행, 확인용 세션 로그아웃(204)
  - [x] `supabase link` 복구(`--project-ref hpadbigfppaypvgmzttk`). `migration list`로 001~007 로컬·원격 일치 확인 — 007을 직접 적용한 것도 정상 인식된다
    - 참고: 토큰은 Windows 자격 증명 관리자에 있다. `supabase login`은 TTY가 필요해 별도 터미널에서 해야 하고, `projects list`는 `LegacyPlatformAuthRequiredError`로 실패하지만 `link`·`migration list`·`db push`는 정상 동작한다
  - 남음: 오래된 행 정리는 함수가 약 1% 확률로 지우고, 본격적인 정리는 v1.1 '오래된 로그 정리 작업'
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
- [x] apps/extension: manifest(key 고정), 팝업, 이벤트 리스너 (EXT-01~04)
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
  - [x] 실시간 추가 → DB 반영(EXT-02): 1회차 ⑤ 팝업 '추가 1'이었으나 DB에 해당 행 없음, 일치 확인 못 함. 실시간 삭제는 반영된 것으로 보이나(첫 2회차 60개) 직접 확인은 못 함
    - 2026-09-23 재시도(example.com Ctrl+D): DB 반영 없음. 정리 때 확장 토큰을 폐기해 401로 거절된 것으로 보임(북마크·토큰 0, last_synced_at 없음) → 새 토큰으로 다시 확인
    - 새 토큰(`…WcU0`)으로: 전체 동기화 '추가 1'(example.com, 크롬과 DB 일치 확인) → iana.org Ctrl+D 실시간 '추가 1' → DB에 `ext_sync` 2행, iana.org는 크롬 추가 16:33:06 → 서버 반영 16:33:08 UTC(약 2초)
    - 1회차 ⑤의 '추가 1'이 DB에 없던 원인은 끝내 확인 못 함(그 뒤 삭제된 것으로 추정, 기록 없음)
    - 정리: 확장 토큰 폐기, 북마크 2개 API로 삭제, `last_synced_at` 원복, 로그아웃·파일 삭제 → 계정 북마크·그룹·토큰 0
- [x] 크롬에서 북마크 추가 → DB 반영 확인 (iana.org, 약 2초. 위 EXT-02 항목)
- [x] CI에서 단위 테스트 실행 (DB·외부 사이트가 필요 없는 것만)
  - [x] 루트 `pnpm test`(로컬용) 추가, CI는 패키지별 3단계로 나눠 실행 — 어느 패키지가 몇 개를 건너뛰었는지 로그에서 읽히게
  - [x] 건너뛰기는 기존 `describe.skipIf` 그대로: CI에 `DATABASE_POOLER_URL`·`METADATA_LIVE`가 없어 저절로 건너뛴다. 운영 DB가 하나뿐이라 CI에 DB 주소를 넣지 않는다
  - [x] 초록 확인(49db3fd): shared 52, extension 32, api 105 통과 / api 48 건너뜀 — 요약 줄 `105 passed | 48 skipped (153)`
    - 건너뛴 48개: 실제 DB 37(db 4, bookmarks 8, api-tokens 10, sync-retry 2, sync 13) + 외부 사이트 11(metadata `METADATA_LIVE`)
  - [x] 빨간 확인(f041c43): `fitGroupName`을 일부러 30자를 한 글자 넘기게 바꿔 푸시 → typecheck·shared·extension 통과, **api 테스트 단계에서 실패**, build는 건너뜀
  - [x] 되돌림(12efaa3, revert) 후 다시 초록 확인
  - 참고: SSRF IP 판정(`isPublicUnicast`)을 망가뜨리는 쪽을 먼저 시도했으나 보안 방어를 약화시키는 커밋이라 막혀서, 보안과 무관한 그룹 이름 자르기로 바꿨다

## 5주차 — 파일 동기화 (완료)

- [x] (5주차 시작 전, 실제 크롬 북마크 동기화 전에) 테스트 전용 Google 계정 준비 (OAuth 테스트 사용자 등록 포함). 이후 실제 계정 확인은 이 계정으로만
- [x] DESK-01: Bookmarks 파일 탐색·파싱 (date_added 변환, 재시도)
  - [x] 문서 먼저: 01-spec.md 'Bookmarks 파일 읽기 규칙'(프로필 탐색·요청 변환·date_added·실패 5종과 재시도·의심스러운 결과)
  - [x] 결정: 북마크 0개는 파싱 실패가 아니라 `suspicious: true`로 넘긴다(DESK-03이 full을 막는다). 북마크가 정말 없는 새 프로필도 있어서
  - [x] 구현(메인 프로세스 전용, 읽기만): `chrome-parse.ts`(순수 함수, fs 없음), `chrome-bookmarks.ts`(읽기·1초 뒤 1회 재시도·50MB 상한), `chrome-profiles.ts`(Default 우선, 없으면 최근 수정순)
  - [x] `date_added`는 `BigInt(값)/1000n` 뒤에 `Number`로. 실제 값이 17자리라 `Number(값)/1e6`은 정밀도를 잃는다
  - [x] IPC·preload 노출은 하지 않았다(다음 항목). 렌더러에서 파일을 읽을 방법은 아직 없다
- [x] DESK-02: 프로필 목록, 파일 직접 선택
  - [x] 문서 먼저: 01-spec.md DESK-02를 **P1 → P0**로(프로필을 잘못 고르면 엉뚱한 북마크를 동기화한다), '표시 이름과 자동 선택'·'파일 직접 선택'·'렌더러에 노출하는 함수' 절 추가
  - [x] 결정: 선택은 이 PC(`userData/chrome-selection.json`)에 저장하고 서버 `chrome_profile`은 동기화(DESK-03)가 갱신한다. `PATCH /me`는 만들지 않았다(7주차 SET-01 항목)
  - [x] `Local State` 읽기(`parseLocalState`): 표시 이름·`last_used`만. 이메일(`user_name`)은 읽지 않는다. 파일이 없거나 깨져도 오류로 보지 않는다
  - [x] 고를 순서 ①저장한 선택 ②`last_used` ③`Default` ④수정 시각 최근. 저장한 프로필이 사라지면 조용히 다음으로 (DESK-03에서 ②자리에 서버 `chromeProfile`이 들어와 5단계가 됨)
  - [x] 파일 직접 선택: `dialog.showOpenDialog`(메인에서만). 고른 파일도 같은 읽기 규칙을 지나야 저장된다
  - 남음: 서버 `GET /me`의 `chromeProfile`로 복원하는 단계는 DESK-03으로 미뤘다(인증 API 호출 코드가 아직 없다)
- [x] IPC + preload 노출
  - [x] 노출 5개: `listChromeProfiles()`·`getChromeSelection()`·`pickChromeBookmarksFile()`·`readChromeBookmarks()`는 **인자 없음**, `selectChromeProfile(name)`은 탐색 목록에 있는 폴더명만
  - [x] 경로를 인자로 받는 읽기 함수는 만들지 않았다(범용 파일 읽기가 되므로). 경로는 화면 표시용으로 내보내기만 한다
  - [x] preload 번들 확인: `chrome:` 채널 5개와 함수 이름만 있고 메인 로직(`readdir`·`info_cache`·`LOCALAPPDATA`)은 들어가지 않았다(`import type`만 씀)
  - [x] 실제 Electron 실행 확인: 프로필 2개와 표시 이름 읽음, Default 선택, 북마크 118개 읽기 성공, `selectChromeProfile('../../../Windows')` 거절
  - 남음: 렌더러에서 실제로 불러 보는 확인은 화면이 없어 못 했다(SCR-02에서)
- [x] DESK-03: 자동·수동 동기화
  - [x] 문서 먼저: 01-spec.md '동기화 실행 규칙'(토큰·401 재시도·보내지 않는 경우·409 처리·자동 1회·앱과 확장이 겹칠 때의 v1 한계·프로필 교체)
  - [x] `auth.ts`가 토큰 값 대신 함수만 연다: `getAccessToken()`(만료 5분 전이면 먼저 갱신), `forceRefresh()`. 기존 `pendingRefresh`를 타서 동시 호출에도 갱신 요청은 하나
  - [x] `sync.ts`는 electron을 import하지 않고 의존성을 주입받는다(파일 읽기·토큰·fetch·확인 함수) → 가짜 서버로 흐름 전체를 테스트
  - [x] `409 MASS_DELETE_CONFIRM_REQUIRED` → 삭제 개수·미리보기 5개 확인 → `confirmDeleteCount` 붙여 재전송, 취소 시 다음 동기화에서 다시 묻기 (처음엔 네이티브 `dialog`, SCR-02에서 렌더러 모달로 바꿈)
    - [x] 결정: 확인 뒤 **파일을 다시 읽지 않고 같은 요청**을 보낸다(사용자가 본 숫자 = 지워지는 숫자). 확장(EXT-03)은 새로 읽는다 — 여기가 다르다
    - [x] `confirmDeleteCount`는 메인이 409에서 받은 값을 붙인다(렌더러는 '확인했다'만 알린다)
    - [x] 확인 대기 중 삭제 대상이 늘면 새 숫자로 다시 묻는다(자동 반복 없음)
  - [x] 파싱 실패·의심스러운 결과면 `full`을 보내지 않기(DESK-01). suspicious는 자동이면 안 보내고 수동이면 확인받는다
  - [x] 401은 갱신 후 딱 1회 재시도. 400·409·413·429·5xx는 재시도하지 않는다(본문이 최대 2MB)
  - [x] `GET /me`의 `chromeProfile`로 프로필 복원(DESK-02에서 미뤄 둔 단계)
  - [x] 단위 테스트 25개: 요청이 '나가지 않는' 경우 8종을 요청 0건으로 못 박음, 409 → 확인 → 재전송, 40→45 재확인, 401 재시도 1회, 네트워크 오류
  - [x] **운영 확인**(테스트 계정 `stte35540@gmail.com`, 로컬 API + 운영 DB)
    - [x] 자동 동기화 1회: `GET /me` → `POST /sync/chrome` 200, 북마크 111개·그룹 5개 생성, `chrome_profile='Default'` 저장
    - [x] 파서 118개 → DB 111개 차이 7개는 **같은 정규화 URL 7쌍**(쇼핑몰 제휴 링크·github)이 서버에서 건너뛰어진 것. 파일에서 직접 세어 일치 확인
    - [x] 그룹 이름 규칙 실제 동작: 경로 이름(`가져온 북마크/확장 확인 샘플/개발/프론트엔드`), 30자 초과는 끝을 살림(`…/상태 관리 라이브러리 비교 모음 (2026년 정리)`)
    - [x] 재동기화(앱 재시작): 200, 북마크 111·그룹 5 그대로, `last_synced_at`만 갱신(1042ms → 135ms)
    - [x] 409: 북마크 5개짜리 가짜 파일로 유발(사용자 크롬은 건드리지 않음) → **409 + DB 전혀 안 바뀜**(111개, `last_synced_at`도 그대로)
    - [x] 취소 → 추가 요청 0건, DB 111 유지 / 확인('106개 지우기') → 재전송 200, **111 → 5개**·그룹 0개
    - [x] 원복: 선택을 지워 자동 선택(Default)으로 → 재동기화 200 → 북마크 111·그룹 5 복구
- [x] SCR-02 첫 동기화 화면
  - [x] 문서 먼저: 01-spec.md SCR-02 구성 구체화, **첫 동기화 전에는 자동 동기화를 하지 않는다**(자동으로 먼저 보내면 프로필을 고를 기회가 없다), 409 확인은 렌더러 모달로, SCR-05에 앱·확장 v1 한계 안내 자리 지정. 04-design.md에 토큰 3개(`--accent-soft`·`--track`·`--divider`)
  - [x] 시안(`project/Sync.dc.html`)의 카드·프로필 항목·진행바·버튼을 CSS 변수로 옮김. 버튼 높이는 시안 48px 대신 문서 토큰 44px(`--control-height`)로 맞춤
  - [x] 화면을 띄울지는 **서버 `lastSyncedAt`** 으로 정한다(로컬 플래그가 아니라). 다른 PC에서 이미 동기화한 계정도 이 화면을 건너뛴다
  - [x] 진행은 단계만 보여준다(읽기 4ms + 서버 1초라 중간 개수·남은 시간을 알 수 없다). 바는 불확정 애니메이션, `prefers-reduced-motion`이면 정지
  - [x] 결과는 추가·수정·삭제·건너뜀 4칸, 건너뜀은 `skippedReasons`를 사람 말로 풀어 보여준다
  - [x] **운영 확인**(테스트 계정, 로컬 API + 운영 DB)
    - [x] 첫 실행: `GET /me`만 가고 `POST /sync/chrome`은 **가지 않음**(자동 동기화 억제 확인) → 화면에서 '가져오기' → 200, 북마크 111·그룹 5
    - [x] 두 번째 실행: SCR-02를 건너뛰고 홈, 자동 동기화 1회(121ms)
    - [x] 409 모달: 가짜 파일로 유발 → 모달 표시 → '지우기' → 200, 111 → 5개 → 원복 후 111개 복구
  - 고친 버그 2개 (둘 다 실제 앱에서 발견, 테스트로는 안 잡혔다)
    - 동기화가 성공하면 메인이 `firstSync`를 false로 바꾸는데 App이 그 값으로 화면을 고르고 있어서 **결과 화면이 뜨자마자 홈으로 넘어갔다** → 한 번 열면 사용자가 '시작하기'·'나중에 하기'를 누를 때까지 유지하도록 분리
    - 모달이 `SyncScreen` 안에만 있어서 **홈에서 자동 동기화 중 409가 나면 모달이 뜨지 않고 메인이 답을 영원히 기다렸다** → 모달을 App 최상위로 올려 어느 화면 위에도 뜨게 함
- [x] 파싱 단위 테스트 (apps/desktop에 vitest 추가, CI에 `단위 테스트 - apps/desktop` 단계)
  - [x] 46개 통과: 크롬 샘플 파일(`apps/api/test/fixtures`)로 확장(`tree.test.ts`)과 **같은 기대값** 확인 — folders `7·9·11·17·20`, 북마크 11개, 걸러냄 2개, `addedAt` `2026-08-01T03:00:00.000Z`. 앱과 확장이 같은 요청을 만든다는 뜻
  - [x] 결과가 `syncChromeInput`(서버 스키마)을 그대로 통과하는지 확인
  - [x] 파일 고유 케이스: `date_added` 이상값 9종·17자리 정밀도, 실패 8종(잘린 JSON·roots 없음/배열/모르는 루트·children 배열 아님), 이상한 항목만 건너뛰기, 0개 → suspicious
  - [x] 임시 폴더 실파일로: 재시도 사이에 저장이 끝나면 성공, `bad_root`는 재시도 안 함, 50MB 상한, 프로필 정렬(Default 우선 → 최근 수정순)
  - [x] 실제 크롬 파일 확인: 프로필 2개 탐색, Default 북마크 118개·폴더 5개·걸러냄 3개, `addedAt` 118개 모두 변환(2020-09-29 ~ 2026-09-23)
- [x] 앱 실행만으로 전체 북마크 반영 확인
  - [x] 두 번째 실행에서 앱을 켜기만 했는데 자동 동기화 1회(121ms) → 북마크 111·그룹 5 반영
  - [x] 409 확인으로 5개까지 줄인 뒤에도, 선택을 되돌리고 앱을 켜기만 하니 111개·그룹 5개로 복구

## 6주차 — 그리드 화면 (완료)

- [x] 설계 확정·문서 먼저 (2026-09-25): 01-spec.md '메인 그리드 규칙'(구성·아이콘 출처·Google 전송 한계·갱신 시점), 04-design.md(62px 표기 정리, 시안 색 4개 매핑, 파비콘 타일 B안, '어디를 고치면 무엇이 바뀌는가' 표), CLAUDE.md(Tailwind 제외, 토큰 규칙), 06-prompts.md
  - 결정: 가상 스크롤은 7주차로, 파비콘은 흰 타일 가운데 50%, 계정 버튼은 최소 메뉴, OPEN-01은 SCR-03과 함께, Tailwind 쓰지 않음, Google 파비콘은 지금은 허용(배포 시 재검토)
- [x] 디자인 토큰 정리: `styles/tokens.css`로 모으기, 기존 화면(SCR-01·02·409 모달)도 토큰으로, `.preview-title` 중복 버그
  - [x] 옮기기 전후 비교: 저장소 밖 확인용 페이지(가짜 `window.baro`)로 10장면을 헤드리스 크롬으로 찍어 **스크린샷 해시 + 모든 요소의 계산된 스타일**을 비교
    - 같음: SCR-02 4장면(프로필 고르기·진행·결과·오류), 좁은 창 로그인
    - 의도한 차이만: 로그인 미리보기 제목 13.5px/500 → **12px/600**(중복 버그 수정, 아래 격자가 2.5px 위로), 위험 버튼 좌우 20 → 22px·글자 14.5 → 14px(기본 버튼과 통일)
    - 모달 지울 목록은 클래스 이름만 바뀌고 스타일 0개 차이. 그동안 로그인 규칙에서 물려받던 색·자간을 그대로 옮겼다
  - [x] `--btn-height` 56px로 바꿔 확인 → 기본·위험·로그인 버튼 44 → 56, 보조 버튼 40 그대로(자기 토큰), 원복
  - [x] 실제 앱(개발 모드, 테스트 계정): 임시 홈 정상 표시, 켜 둔 채 `--btn-height-secondary`를 60으로 저장하니 버튼 40 → 60 바로 반영, 원복 후 40
  - [x] typecheck 전체, desktop 테스트 103개, `electron-vite build` 통과(빌드 CSS에 토큰 포함)
- [x] SCR-03: 반응형 그리드, 파비콘 타일·글자 타일, 고정 섹션, 상단바(동기화·계정 메뉴), 상태바, 임시 홈·DevApiCard 삭제
  - [x] `bookmarks:list` IPC — 화면 전에 콘솔에서 먼저 확인
    - [x] `api-client.ts`(electron 없음): 토큰 붙이기 + **401이면 갱신 후 딱 1회 재시도**를 `authedFetch` 하나로. 동기화(`sync.ts`의 `send`)도 이걸 쓰게 바꿔 규칙이 한 곳에만 있다. 진짜 토큰·주소는 `api.ts`의 `apiDeps`
    - [x] preload `listBookmarks()` 인자 없음, 결과는 `{ data, meta }` 또는 `{ error }`(예외를 던지지 않음). 범용 fetch는 여전히 노출하지 않음
    - [x] 단위 테스트 15개(요청 횟수·실은 토큰까지 셈): 토큰 없으면 요청 0건, 401 → 새 토큰으로 1회, 재시도도 401이면 끝(요청 2·갱신 1), 갱신 실패면 재시도 없음, 500·429는 재시도 없음, JSON 아님 `HTTP_502`, data가 배열 아니면 오류. 기존 동기화 25개 그대로 통과
    - [x] 검사가 일을 하는지: `!isRetry` 조건을 빼면 새 테스트와 **기존 동기화 테스트가 함께** 실패(동기화가 정말 같은 코드를 탄다) → 원복
    - [x] 실제 앱 콘솔(개발 모드, 테스트 계정, 로컬 API + 운영 DB): `window.baro.listBookmarks()` → 111개·`meta.total` 111, 최신 추가순, 고정 0·`iconUrl` 0(예상대로), 첫 호출 1.2초(개발 서버 컴파일) 이후 약 140ms
    - [x] 결과에 앱 토큰(ES256 JWT·Bearer) 없음. 처음엔 `eyJ` 검사에 걸렸는데 테스트 계정 북마크 URL 2개 안에 든 남의 값(네이버 링크의 HS256 토큰, `ui=` base64)이었다
    - [x] API를 끄고 호출 → 5ms 만에 `{ error: NETWORK, '서버에 연결하지 못했습니다' }`
    - [x] 바꾼 동기화 경로 실제 확인: 앱 시작 자동 동기화 `POST /sync/chrome` 200, 추가·수정·삭제 0, 건너뜀 7(같은 URL) — 5주차와 같은 결과
    - 확인 못 함: 401 → 갱신 → 재시도는 실제 앱에서 일으킬 방법이 없어 단위 테스트로만 확인
  - [x] TanStack Query 목록 캐시(동기화 후·창 포커스 갱신, 로그아웃 시 비우기)
  - 구현(2026-09-25): `HomeScreen`·`BookmarkGrid`·`BookmarkTile`·`AccountMenu`·`StatusBar`, `lib/`(tile·grid-layout·relative-time·queries·use-grid-layout), 임시 홈·DevApiCard 삭제, CSP `img-src` 좁힘, `SyncState.lastSyncedAt`(상태바용) 추가
    - 문서 먼저 고친 것: 파비콘 `sz=64` 고정(창 크기마다 주소가 바뀌면 아이콘을 다 다시 받음), 상태바 글자색 시안대로 `--text-muted`, SCR-03 화면 전용 값
    - 단위 테스트 33개 추가(글자 고르기·색 해시·파비콘 주소·기준점 800/801/1100/1101·토큰 읽기·상대 시각), desktop 151개 통과
  - [x] 실제 앱 확인(개발 모드, 테스트 계정, 로컬 API + 운영 DB) a~l 전부
    - [x] a. 111개, 고정 0개라 '고정됨' 섹션 없음, '최근 추가순' 섹션만, 임시 홈 사라짐
    - [x] b. 실제 창을 Win32로 바꿔 측정: 800 → 6열 56px, 1000·1100 → 8열 64px, 1102 → 10열 72px, 1400 → 10열 72px, 가로 스크롤 없음. 화면 배율 1.25라 1101은 정확히 못 맞춰 1102로(경계 1100/1101은 단위 테스트)
    - [x] c. 끝까지 스크롤해 불러온 뒤 파비콘 66·글자 45, 깨진 이미지 0. **Google은 모르는 도메인에 `error`가 아니라 16px 이미지로 `load`를 준다**(글자 타일 34개 호스트 전부 `load 16`) → `naturalWidth ≤ 16` 규칙이 실제로 일을 한다. 16px 아이콘만 있는 사이트(네이버 블로그·백준 등)도 글자 타일
    - [x] d. 파비콘 주소를 막고 캐시를 끈 채 다시 불러오기 → 111개 모두 글자 타일, 깨진 이미지 0, 타일 위치 40개 중 0개 이동. API를 끄고 시작 → '불러오지 못했습니다 · 서버에 연결하지 못했습니다' + '다시 시도', API를 켜고 누르면 111개. 네트워크 자체를 끈 시험은 하지 않았다
    - [x] e. 라벨 75개가 잘림, 모두 한 줄·`ellipsis`, 100자 제목도 104px, 전체 제목·주소는 `title`로
    - [x] g(일부). `GET /bookmarks` 수를 API 로그로 셈: '동기화' 버튼 → +1, 최소화 후 복원(60초 안) → 0, 60초 지나 복원 → +1. alt-tab은 Windows가 포커스 뺏기를 막아 최소화·복원으로 실제 포커스를 바꿨다
    - [x] h. 가짜 5개 파일로 409 → **그리드 위에** 모달('106개를 지울까요?'), 포커스는 취소, 대기 중 DB 111 그대로, 취소 → 111·idle. 대기 중 상태바를 '삭제 확인을 기다리는 중'으로 고침(SCR-02와 같은 말). 선택 파일 지워 원복
    - [x] j. Tab 순서 동기화 → 계정 → 타일 → 타일, 모두 포커스 테두리 보임(2px가 배율 때문에 1.6px로 그려짐). 계정 버튼 Enter → 메뉴(이메일·저장 여부·로그아웃), Esc → 닫히고 버튼으로 포커스, 바깥 클릭 → 닫힘
    - [x] k. 켜 둔 채 `tokens.css` 수정: `--tile-radius` 18→8은 저장하자마자, `--grid-cols-md` 8→7은 창 크기를 한 번 바꾸자 반영(문서대로). 원복
    - [x] l. 빌드 버전(`file://`): 파비콘 66·글자 45로 개발 모드와 같음, 허용 밖 호스트 이미지는 CSP가 막음(위반 로그는 그 1건뿐), 개발용 카드 없음
    - [x] f. 테스트 세션(`stte35540@…` 확인)으로 GitHub `isPinned` 켬 → '동기화' 뒤 '고정됨' 1개(핀 아이콘 accent) + '최근 추가순' 110개. **크롬 동기화 뒤에도 서버 `isPinned`가 그대로**(동기화가 고정을 지우지 않음) → 원복
    - [x] g(나머지). API로 북마크 추가(확장 대신) → 추가 직후·60초 안 복원은 111개 그대로(요청 없음), 60초 지나 복원 → 112개, '최근 추가순' 맨 앞 → 삭제
    - [x] i. 계정 메뉴 → 로그아웃 → 로그인 화면, `session.bin` 삭제. 앱에서 다시 로그인(사람) → 화면 변화 기록: 홈이 **타일 0개**로 먼저 뜨고 160ms 뒤 새 요청으로 111개(이전 목록이 비치지 않음)
      - 로그인 뒤 요청: 목록 GET → `/me`·동기화 → GET → GET. 메인은 로그인 때 동기화하지 않는다(앱 실행당 1회). 사람이 로그인 뒤 '동기화'를 눌렀다고 확인 → 설명됨(마지막 GET은 60초 뒤 포커스 갱신)
    - 정리: 확인용 북마크 삭제·고정 원복(서버·앱 111개, 고정 0), 테스트 세션 로그아웃(204)·파일 삭제, 가짜 선택 파일 삭제
- [x] OPEN-01: 클릭 → 기본 브라우저로 열기
  - [x] 메인이 `javascript:`·`file:`·`data:`를 거절('http/https만 열 수 있습니다')
  - [x] 타일 클릭으로 기본 브라우저에 탭이 열림 — j 확인 중 바깥 클릭이 타일(`https://claude.ai/new`)에 떨어져 열렸고, 사람이 탭을 보고 확인(의도한 확인은 아니었다)
- [x] OPEN-02·03, BM-05: 방문 기록, 보조 메뉴(고정·삭제), 5초 실행 취소
  - [x] 설계·문서 먼저 (2026-09-25): 03-api.md(`source` 응답 필드, visit uuid면 204·형식 오류면 404, **서버가 동기화분 삭제를 막지 않는 이유**), 01-spec.md '열기와 보조 메뉴 규칙', 04-design.md 실행 취소 버튼
    - 결정: 크롬에서 온 북마크는 삭제를 막고 이유 표시(되살아날 것을 지우면 방문 기록만 영구히 사라진다), '수정'은 SCR-04 때, 실행 취소는 상태바, 네이티브 메뉴, 삭제 금지는 앱 화면에서만(보안 규칙이 아니라 안내)
  - [x] API: `source` 응답 필드, `POST /bookmarks/:id/visit` — 테스트 + 실제 HTTP
    - [x] `toBookmark`에 `source`, shared `Bookmark.source`, `recordVisit`(withUserDb 안에서 `record_visit` 호출), 라우트 `bookmarks/[id]/visit`
    - [x] 실제 DB 통합 테스트 2개 추가(API 전체 151 통과): 방문 2번 → click_count 2·last_visited_at·visit_logs 2행, 남의 것(가짜 사용자 B)·없는 id는 조용히 변화 없음, 추가한 것은 `source: manual`
    - [x] 실제 토큰 HTTP(로컬 API, 테스트 계정): 목록 111개 모두 `source`(`app_sync` 111), manual 추가 → `source: manual`, visit 2번 204 → clickCount 2, 형식 오류 id 404, 없는 uuid 204(변화 없음), 토큰 없음 401. 남의 북마크는 계정이 하나라 HTTP로는 못 했고 DB 테스트로 확인
    - 정리: 확인용 manual 북마크 삭제(목록 111로 원복), 테스트 세션 로그아웃
  - [x] IPC: `recordVisit`·`setPinned`·`deleteBookmark`·`showTileMenu` (메인에서 uuid 확인) — 아래 실제 앱 확인으로 동작 확인
    - `api-client.ts`의 `isBookmarkId`·`postVisit`·`patchPinned`·`deleteBookmarkById`(uuid가 아니면 요청 0건), `tile-menu.ts`(항목 결정·입력 검사, 순수 함수), `index.ts`의 IPC 4개와 `showTileMenu`(Menu.popup, 닫힘 콜백이 click보다 먼저 올 수 있어 100ms 뒤 null), preload 4개
  - [x] 화면 연결 (2026-09-25)
    - `BookmarkTile`: `onContextMenu`(preventDefault). 직전 keydown이 Shift+F10·ContextMenu면 키보드로 보고 타일 왼쪽 아래 좌표, 마우스면 좌표 없음. `BookmarkGrid`: `onMenu`·숨김 id
    - `HomeScreen`: 열기 성공 뒤 `recordVisit`, 메뉴 선택 → `usePinMutation`·`usePendingDelete`, `openFailed` → 일반 `notice`(열기·고정 성공, 삭제 시작 때 지움)
    - `StatusBar`: 문구 옆 선택 버튼(`action`), 삭제 대기가 가장 먼저(동기화 중에도 실행 취소 가능), CSS `.statusbar-action`
    - typecheck 전체, desktop 테스트 181개 통과(`orderLikeServer` 4개 추가)
  - [x] 목록 순서 버그 수정: 추가 시각이 같은 북마크(크롬 샘플 10개 등)가 요청마다·방문 뒤 자리를 바꿨다 → `03-api.md`에 '같으면 `id` 오름차순' 먼저 적고 서버 `orderBy`와 앱 `orderLikeServer`(→ `lib/order.ts`로 이동)에 같은 규칙
    - API 실제 DB 테스트 1개 추가(같은 시각 4개를 방문해 행이 다시 쓰여도 순서 유지). 끊는 기준을 빼면 이 테스트가 실패하는 것 확인
    - 실제 앱에서 목록 5번 연속 같은 순서
  - [x] 실제 앱 확인 (테스트 계정, 로컬 API + 운영 DB, 확인용 manual 북마크 A·B·C를 DB에 직접 넣어 사용. 입력은 사람이, 기록은 CDP로 렌더러 console·DOM, 메뉴는 열리면 자동 캡처)
    - [x] OPEN-02: 클릭 수만큼 `click_count`·`visit_logs` 증가(A 1, B 16. 사람이 누른 횟수와 일치)
    - [x] 키보드 메뉴: Shift+F10 → 판별 `keyboard: true`(`button` -1), Chromium 이벤트 좌표는 **타일 한가운데**, 메뉴는 타일 아래 테두리 밑 왼쪽 끝(캡처로 좌표 일치). 우클릭은 포인터 자리. 메뉴 키는 확인 못 함
    - [x] 고정/해제: 마우스·키보드(↓·Enter) 고정 → '고정됨' 유지, 해제 → '최근 추가순' 원래 자리. `PATCH` 200 ×3, DB 반영
    - [x] 고정 실패 시 되돌림: 메모리 부족 뒤 API 개발 서버 워커가 죽어 `PATCH`가 500(Next.js `Jest worker` 오류, 우리 코드 전) → 4번 모두 올라갔다 되돌아가고 '고정하지 못했습니다'. 서버 재시작 뒤 정상
      - 이때 찾은 버그: 고정이 성공해도 지난 실패 문구가 남음 → 성공·삭제 시작 때 지우게 고침
    - [x] 삭제: 실행 취소 → `DELETE` 없이 복귀 / 5초 뒤 `DELETE` 204 / 지우는 중 동기화·목록 GET이 먼저 와도 계속 숨김, 상태바는 삭제 문구·실행 취소 유지 / API를 끄고 삭제 → 5초 뒤 되살아나고 '삭제하지 못했습니다'
    - [x] 동기화분(`app_sync`) 메뉴: '삭제' 비활성 + "크롬에서 지우면 다음 동기화 때 사라집니다"
    - [x] 정리: 확인용 A·B·C를 앱에서 삭제(방문 기록도 함께), DB 북마크 111·manual 0·고정 0
    - [x] 기존 북마크 `google/gemma-4-12B-it · Hugging Face`(`app_sync`)에 확인 중 실수로 쌓인 방문 1건(06:34:41, 원인 단정 못 함) → 사람이 SQL Editor로 삭제·원복, 테스트 계정 방문 기록 0건 확인
    - [x] 키를 누르고 있을 때 메뉴가 반복해서 열리던 문제(3.4초에 27번, 메뉴 깜빡임·IPC 27회) 수정: 반복 keydown(`e.repeat`)은 `preventDefault`로 `contextmenu`를 막는다. 01-spec.md 먼저 고침
      - 실제 확인(사람이 누름, 렌더러에 keydown·contextmenu 감시): 길게 두 번 눌러 반복 keydown 104회 → `contextmenu`는 누를 때마다 1번(합 3번, 짧게 누른 것 포함). 사람 눈에도 한 번 뜨고 깜빡이지 않음. 짧게 누르면 전처럼 타일 아래
      - 남는 동작: 길게 누르면 메뉴가 뜬 뒤 첫 반복(약 0.5초 뒤) F10에 Windows가 메뉴를 닫는다(1.6초 뒤 캡처에 메뉴 없음, 이후 반복은 렌더러로 옴). 다시 열리지는 않는다
    - 참고: 이번 확인 중 로컬 API 응답이 예전보다 느렸다(목록 약 140ms → 약 1초, JWKS 가져오기 시간 초과로 500 1회). 8주차 동기화 느려짐 항목과 함께 본다
- [x] SCR-04: 추가·수정 모달 (메타데이터 자동 채움, 중복 확인)
  - [x] 설계 확정 (2026-09-26): 시안 캔버스에 보드 2개('북마크 추가·수정', '북마크 추가 · 중복 주소') 먼저 그려 승인
    - 결정: CSP `img-src`에 `https:` 허용, `/metadata`는 주소 칸 포커스가 빠질 때만, 409는 같은 모달 안에서 [취소]·[기존 북마크 수정]·[기존 북마크 열기], 크롬에서 온 북마크는 수정도 막음(동기화가 크롬 값으로 되돌림), 추가·수정은 낙관적 업데이트 없이 응답으로 캐시 갱신, 그룹·태그 칸은 P1 때
  - [x] 문서 먼저: 01-spec.md(BM-04·OPEN-03·SCR-04 줄, CSP, 보조 메뉴 '수정', '추가·수정 모달 규칙' 절), 03-api.md(`/metadata` 부르는 시점), 04-design.md(입력칸 토큰 `--input-height`·`--input-pad-x`, 화면 전용 값)
  - [x] CSP img-src `https:` — 실제 앱에서 네이버 자체 아이콘(`https://www.naver.com/favicon.ico?1`)이 미리보기·타일에 보임
  - [x] 메인: `fetchMetadata`·`createBookmark`·`updateBookmark` IPC, 보조 메뉴 '수정'
    - `api-client.ts`의 `postBookmark`·`patchBookmark`·`getMetadata`: 렌더러 값을 shared 스키마로 다시 검사하고 주소·제목·아이콘 칸만 보낸다(그 밖의 칸은 버림), 409 `details` 전달(`failureOf`가 details를 넘기게 고침)
    - `tile-menu.ts`: '수정' 추가, 크롬에서 온 것은 수정·삭제 비활성 + "크롬에서 고치거나 지우면 다음 동기화 때 반영됩니다"
    - 단위 테스트: desktop 192 통과(새 11개: 스키마 밖 입력 5종·빈 제목·바꿀 칸 없음·uuid 아닌 id는 요청 0건, 409 details, /metadata 인코딩)
    - preload 번들 4KB, zod 없음, 새 채널 3개(`bookmarks:create`·`bookmarks:update`·`metadata:fetch`)
  - [x] 화면: 모달, 상단바 '북마크 추가', 보조 메뉴 '수정' 연결(typecheck·`electron-vite build` 통과)
    - `components/BookmarkModal.tsx`, 아이콘 그리기를 `components/TileIcon.tsx`로 빼서 그리드와 미리보기가 같이 씀, `upsertBookmarkInCache`, 입력칸 토큰 `--input-height`·`--input-pad-x`
  - [x] 실제 앱 확인 (2026-09-26, 테스트 계정, 로컬 API + 운영 DB. 입력은 사람이, 기록은 CDP로 모달 상태·포커스, 요청은 API 로그, 결과는 DB)
    - [x] 추가: 주소 입력 뒤 Tab → '제목을 가져오는 중…' → 제목 '네이버'·사이트 아이콘, `POST` 201(`source: manual`). 같은 주소로 다시 나갔다 들어와도 `/metadata` 1번. 입력하는 동안 미리보기는 글자 타일 그대로(글자마다 파비콘 요청 없음)
    - [x] 주소 칸에서 곧바로 Enter: 가져오기와 '저장하는 중…'이 함께 시작 → 제목을 기다렸다가 저장('Internet Assigned Numbers Authority')
    - [x] 수정: 보조 메뉴 '수정' → '북마크 수정'·제목 칸에서 시작, 제목만 `PATCH` 200. 바꾸지 않고 Enter → 요청 없이 닫힘. 빈 제목 → '제목을 입력하세요'. 크롬에서 온 것은 메뉴의 수정·삭제 비활성
    - [x] 409: 크롬에서 온 GitHub → 안내 줄 + '기존 북마크 수정' 비활성 / manual '네이버 메인' → '수정' 활성, 누르면 수정 모드로 전환, '열기' → 브라우저 + 방문 `204`(확인용에만). 입력을 고치면 [취소]·[저장]으로 복귀
    - [x] 오류: `localhost` → `/metadata` 400, 알리지 않고 빈 제목 / `javascript:` → 요청 없이 주소 칸 아래 'http 또는 https 주소만 저장할 수 있습니다'
    - [x] 포커스: 찾은 버그 — 모달 안 빈 곳을 클릭한 뒤 Tab이 뒤쪽 타일(Gmail·YouTube…)까지 갔다 → 뒤 화면을 `inert`로 막고, 닫은 뒤 inert가 풀리면 포커스를 돌려주게 고침. 다시 확인: Tab이 모달 안에서만 돌고 Esc 뒤 '북마크 추가'로 복귀
    - [x] 정리: 확인용 4개를 앱에서 삭제(`DELETE` 204 ×4), DB 북마크 111·manual 0·고정 0·방문 기록 0
    - 참고: `/metadata`가 같은 주소로 2번 불린 것은 모달을 닫았다 새로 연 경우였다(모달마다 처음부터. 버그 아님)
    - 남음: 409 대량 삭제 모달(`MassDeleteModal`)은 아직 뒤 화면을 inert로 막지 않는다(같은 문제가 있을 수 있음, 이번 범위 밖)
- [x] 낙관적 업데이트: 고정은 OPEN-03에서 완료. 수정·추가는 하지 않기로 결정(SCR-04 설계, 409를 모달에서 골라야 하고 id·추가 시각은 서버가 정한다)

## 7주차 — 검색·정렬

- [x] 409 대량 삭제 모달(`MassDeleteModal`)도 뒤 화면을 `inert`로 막기 (2026-09-26)
  - `App.tsx`: 화면 전체를 `.app-screen`으로 감싸 모달이 떠 있는 동안 `inert`. 닫히면 모달 밖에서 마지막으로 포커스를 받은 요소로 돌려준다(모달이 뜨자마자 '취소'에 포커스를 두고 자식 effect가 먼저 돌아서, 뜬 뒤에 activeElement를 읽으면 이미 늦다 → `focusin`으로 늘 기억)
  - 실제 앱(테스트 계정, 가짜 5개 파일로 409, '지우기'는 누르지 않음): '취소'에 포커스, 모달 안 빈 곳 클릭 뒤 Tab이 뒤 화면으로 안 감, Esc 뒤 '동기화' 버튼으로 복귀, DB 111 그대로. 선택 파일·가짜 파일 삭제 후 동기화 200(변화 없음)
- [x] SEARCH-01: 실시간 검색
  - [x] 설계 확정 (2026-09-26, 캔버스 없이): 낱말 AND, 주소는 디코딩해서도 비교, 섹션은 '고정됨' + '검색 결과 N개', 결과 0개면 [검색어 지우기], 추가 성공 시 검색어 비우기, `useDeferredValue`(디바운스 없음)
  - [x] 문서 먼저: 01-spec.md('검색 규칙 (SEARCH-01)' 절, SCR-03 상단바·섹션 줄), 04-design.md(검색창 화면 전용 값)
  - [x] 구현: `lib/search.ts`(비교 글자 만들기·낱말 AND 거르기, 순수 함수) + 단위 테스트 13개(대소문자·NFD·주소·디코딩 주소·태그·AND·깨진 인코딩·제목과 주소 경계), 상단바 검색창, '검색 결과 N개', 결과 0개 화면, 추가 성공 시 검색어 비우기. desktop 205 통과
  - [x] 실제 앱 확인 (2026-09-26, 테스트 계정, 입력은 사람이, 기록은 CDP로 입력→그리드 DOM 반영 시간·섹션·포커스, 요청은 API 로그)
    - [x] 대소문자(`GitHub`·`github` 6개), AND(`인프런` 3 → `인프런 aws` 1), 주소만(`gchq` → CyberChef), 인코딩된 주소만(`클라우드`에 제목엔 없는 AWS 강의), 결과 0개 → [검색어 지우기] → 111개·검색창 포커스, Esc로 지우기
    - [x] 검색어를 40번 넘게 바꾸는 동안 `GET /bookmarks` 0번
    - [x] 속도(입력 → 그리드 DOM 반영): 좁힐 때 3~15ms, 지워서 111개로 돌아갈 때 140~180ms(사라졌던 타일 100여 개를 다시 만든다). 사람 체감으로는 문제없음
    - [x] 검색 중 동기화 → 검색어·결과 유지 / 고정 → '고정됨'으로, 해제 → 복귀 / 추가 성공 → 검색어 비워지고 새 타일 맨 앞
    - [x] 검색 중 삭제 → 그 타일만 숨김, 결과가 비면 0개 화면 + 상태바 실행 취소 → 누르면 복귀(`DELETE` 없음) / 못 누르면 5초 뒤 `DELETE` 204
    - [x] 검색 중 수정으로 검색어와 안 맞게 되면 결과에서 빠짐(2 → 1개)
    - [x] Tab 순서 검색창 → 동기화 → 북마크 추가 → 계정 → 첫 타일(사람 확인)
    - [x] 정리: 확인용 manual 2개 삭제, DB 111·manual 0·고정 0·방문 기록 0
  - [x] 푸시 뒤 CI 실패(814f8e3) → 수정: `chrome-bookmarks.test.ts`의 두 테스트가 10ms 뒤 파일 쓰기를 예약만 하고 기다리지 않아, 쓰기가 afterAll의 폴더 삭제와 겹쳐 Linux에서 `ENOTEMPTY`. 테스트 205개는 모두 통과였고 실패는 뒷정리. `bad_root` 테스트가 0.8ms에 끝나고 쓰기는 그 뒤에 실행되는 것을 확인한 뒤, 예약한 쓰기를 기다리고 끝내도록 고침(Windows에서는 전후 30번 모두 재현 안 됨)
- [x] SEARCH-04: 정렬 (visits_30d는 서버 집계)
  - [x] 설계 확정 (2026-09-26, 캔버스 없이): 정렬은 앱에서, 서버는 모든 응답에 `recentVisits`만 붙임(`?sort=` 없음), 방문 뒤 목록을 다시 받지 않음, 방문 0회끼리는 최근 추가순, `custom`은 SEARCH-06과 함께(드롭다운 4종), 드롭다운 글자 14px
  - [x] 문서 먼저: 01-spec.md('정렬 규칙 (SEARCH-04)' 절, SEARCH-04·06 줄, SCR-03 상단바·섹션 줄, 방문 기록 줄), 03-api.md(`sort` 쿼리 삭제, `recentVisits`는 모든 응답), 02-db.md(30일 집계는 하위 쿼리)
  - [x] 서버: `recentVisits`(목록·단건·추가·수정). 최근 30일 방문 수를 북마크마다 하위 쿼리로 센다
    - 처음 구현에서 Drizzle이 select 목록 안 하위 쿼리의 `${bookmarks.id}`를 테이블 없이 `"id"`로 써서 `visit_logs.id`로 읽혔다(uuid = bigint 오류로 드러남) → 열 이름을 `"bookmarks"."id"`로 직접 씀
    - DB 테스트 1개 추가(30일 넘은 방문 제외, 목록·단건·수정·추가 응답 모두의 값, 다른 북마크 방문이 섞이지 않음). API 140 통과(`sync.test.ts`는 방침대로 제외)
    - 실행 계획: 트랜잭션 안에서만 방문 5,000건을 넣고 EXPLAIN → `idx_visit_recent`를 `bookmark_id`·`visited_at` 두 조건으로 탐, 111개 3.5ms. ROLLBACK 후 방문 기록 0건(빈 테이블에서는 계획기가 순차 탐색을 고른다)
  - [x] 앱: `lib/order.ts`의 `sortBookmarks`(고정 먼저 → 기준 → 보조 → id) + 단위 테스트 19개, 상단바 드롭다운(4종), 섹션 이름. 캐시는 서버 기본 순서 그대로 두고 화면에서만 정렬(설계보다 단순하게, 명세 반영). desktop 224 통과
  - [x] 고정(BM-07)은 어떤 정렬에서도 맨 앞 — 단위 테스트(4종 × 고정 2개)와 실제 앱에서 확인. BM-07 끝
  - [x] 실제 앱 확인 (2026-09-26, 테스트 계정, 확인용 manual 3개에 방문 A 3·B 1·C 0)
    - [x] 정렬 4종 모두 화면 순서 114개가 DB(이름순은 Node `Intl.Collator`)로 따로 계산한 순서와 일치(드롭다운은 CDP로 바꿈), 섹션 이름도 정렬마다
    - [x] 사람이: 고정한 C가 4종 모두 '고정됨', 해제하면 원래 자리 / 검색 중 정렬 변경 → 검색어 유지, 결과 순서만(B, A, C) / 자주 방문순에서 B를 3번 클릭 → 바로는 그대로, 창으로 돌아와 목록을 새로 받을 때 B가 맨 앞(60초는 마지막 목록 요청부터)
    - [x] 정리: 확인용 3개 삭제(방문 기록 7건 함께), DB 111·manual 0·고정 0·방문 기록 0
    - 참고: 메모리 부족 뒤 망가진 예전 API 서버가 포트 3000을 잡고 있어 목록이 500 → 둘 다 끄고 새로 띄움(6주차와 같은 현상)
- [ ] SEARCH-05: 정렬 설정 저장
- [ ] SET-01: 열기 방식
- [ ] SCR-05 설정 화면 (크롬 프로필, API 토큰 발급 등)
  - [ ] 확장 토큰 발급 자리에 **앱+확장 동시 사용 한계** 한 줄 안내 (docs/01-spec.md SCR-05에 문구까지 적어 둠)
- [ ] DESK-04: 오프라인 캐시 + 배지
- [ ] 500개 초과 시 가상 스크롤
- [ ] 1,000개 기준 성능 측정
  - [ ] 검색어를 지울 때 타일을 다시 만드는 비용(111개에서 140~180ms, SEARCH-01 확인 때 측정). 1,000개면 1초를 넘을 수 있다 → 지우지 않고 숨기는 방식 시험

## 8주차 — MVP 마무리

- [ ] electron-builder로 Windows 설치 파일
  - [ ] `apps/desktop/.env.production`에 배포 주소 넣기 (localhost가 박힌 설치 파일 방지)
- [ ] E2E 테스트 (로그인 → 동기화 → 검색 → 열기)
- [ ] 보안 점검 (타인 데이터, SSRF, 위험 URL, 토큰 노출, Electron 설정)
  - 메모: `/metadata`에 `https://example/`(점 없는 호스트)이 422까지 4.8초 걸렸다(명세는 전체 3초). DNS 조회가 3초 제한 밖일 수 있다(2026-09-26 SEARCH-01 확인 중 발견)
- [ ] `sync.test.ts` 5,000개 동기화 느려짐 확인 (2026-09-25 발견, 성능 확인 때 함께)
  - 첫 동기화 1.4초 → 약 80초(기준 15초로 실패), 변화 없음 0.45초 → 34초. 원인 미확인. 그때 DB `select 1`은 9~16ms로 정상
  - 실패하면 `afterAll`도 시간 초과가 나서 **가짜 사용자(`sync-test-…@example.com`)와 북마크가 운영 DB에 남는다**(이번에 2명·5,010개, 사람이 SQL Editor로 삭제). 원인을 찾기 전에는 이 테스트를 돌리지 않는다
  - 같은 날 로컬 API 응답도 느려짐: 목록 `GET /bookmarks` 약 140ms → 약 1초, JWKS 가져오기 시간 초과로 500 1회(`[auth] 토큰 검증 중 서버 오류: request timed out`). 같은 원인인지 함께 본다
- [ ] README 정리
- [ ] 다른 PC에 설치해 사용
- [ ] 8주 회고 기록

## 9~11주차 — v1.1

- [ ] GROUP-01~02 그룹·탭
- [ ] BM-08 태그 (BM-07 고정은 6주차 OPEN-03 + 7주차 SEARCH-04로 옮김)
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
