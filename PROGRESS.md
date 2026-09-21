# 진행 체크리스트

전체 계획의 현재 상태. 작업이 끝날 때마다 여기 체크박스를 채운다.
상세 내용은 `docs/05-roadmap.md`, 작업 지시 문구는 `docs/06-prompts.md`.

마지막 갱신: 2026-09-21 (4주차: API 인증(JWKS) + 사용자 권한 DB 접근(withUserDb) 완료)

**다음 작업 (순서대로)**
1. packages/shared: Zod 스키마 (BM-01~05용만. zod는 이미 설치됨)
2. BM-01~05: `/bookmarks` CRUD, URL 정규화·중복 검사
3. `/metadata` + SSRF 차단

---

## 0단계 — 기획 (완료)

- [x] 아이디어 구체화, 문제 정의
- [x] 계획서 9장 작성
- [x] 핵심 결정 10개 확정 (이름, 형태, 로그인, 동기화 방식, 정렬 기준 등)
- [x] 디자인 시안 4화면 + 디자인 토큰
- [x] 작업 문서 세트 (CLAUDE.md, docs/01~06)
- [ ] 남은 결정: 도메인 / 자동 업데이트·코드 서명 / 확장 웹스토어 게시

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
  - [x] `DATABASE_POOLER_URL` .env·Vercel 입력, Vercel 리전 Seoul 확인
- [ ] packages/shared: Zod 스키마 (+ zod 설치)
- [ ] BM-01~05: `/bookmarks` CRUD, URL 정규화·중복 검사
- [ ] `/metadata` + SSRF 차단
- [ ] `/tokens` 3종, 토큰 해시 저장, 인증 미들웨어
- [ ] `/sync/chrome` (full/partial, 트랜잭션)
- [ ] apps/extension: manifest(key 고정), 팝업, 이벤트 리스너 (EXT-01~04)
- [ ] 크롬에서 북마크 추가 → DB 반영 확인

## 5주차 — 파일 동기화

- [ ] DESK-01: Bookmarks 파일 탐색·파싱 (date_added 변환, 재시도)
- [ ] DESK-02: 프로필 목록, 파일 직접 선택
- [ ] IPC + preload 노출
- [ ] DESK-03: 자동·수동 동기화
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
