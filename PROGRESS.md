# 진행 체크리스트

전체 계획의 현재 상태. 작업이 끝날 때마다 여기 체크박스를 채운다.
상세 내용은 `docs/05-roadmap.md`, 작업 지시 문구는 `docs/06-prompts.md`.

마지막 갱신: 2026-09-21 (AUTH-02 완료: safeStorage 저장, 재실행 자동 로그인, 반복 갱신 후 재실행 확인)

**다음 작업 (순서대로)**
1. 오프라인 시작 확인 (인터넷 끄고 앱 켜기 → 켜면 1분 안에 자동 로그인)
2. AUTH-03 로그아웃 (로그인된 상태에서는 로그인 버튼 대신 로그아웃 버튼)
3. SCR-01 로그인 화면

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

## 3주차 — Google 로그인

- [x] Google Cloud OAuth 클라이언트 생성, Supabase Auth 연결 (브라우저로 PKCE 왕복 확인, 포트 와일드카드 동작)
- [x] AUTH-01: 루프백 서버 + PKCE, Supabase Auth와 직접 코드 교환 (curl 교환 확인 → 앱 로그인·profiles 생성·2분 타임아웃 확인)
- [x] AUTH-02: safeStorage 토큰 저장, 자동 로그인, 토큰 직접 갱신
  - [x] curl로 `grant_type=refresh_token` 확인 (매번 새 refresh_token, 바로 전 토큰 재사용은 최신 토큰 반환, 두 세대 전은 400 `refresh_token_already_used`)
  - [x] safeStorage 저장("이 PC에 저장됨"), 재실행 자동 로그인, 만료 5분 전 갱신 (`BARO_REFRESH_MARGIN_SEC`로 반복 갱신 후 재실행 자동 로그인 확인)
  - [x] 로그인된 상태에서 재로그인이 실패하면 기존 로그인 상태를 화면에 유지 (로그인 상태와 마지막 시도 결과를 화면에서 분리)
  - [ ] 오프라인으로 시작 시 저장 파일 유지 후 재연결 시 자동 로그인 (코드는 있음, 앱 확인 안 함)
- [ ] AUTH-03: 로그아웃
- [ ] SCR-01 로그인 화면
- [x] 앱 재실행 후에도 로그인 유지 확인

## 4주차 — 북마크 API + 확장

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
