# 05. 로드맵

MVP 8주, v1.1 11주. 마감보다 각 주차의 학습 포인트를 이해하는 것을 우선한다.

## 1주 — 환경 설정

학습: 프로젝트 구조, Electron 메인·렌더러 분리, 배포 흐름

- [ ] 모노레포 구성 (pnpm workspace: apps/desktop, apps/api, apps/extension, packages/shared, packages/db)
- [ ] electron-vite로 앱 창 띄우기 (`contextIsolation: true`, preload 스텁)
- [ ] Next.js API 프로젝트 생성, `/api/v1/health` 하나 만들어 Vercel 배포
- [ ] Supabase 프로젝트 생성, 환경 변수 정리 (`.env.example` 커밋)
- [ ] GitHub 저장소, 기본 CI(lint + typecheck)

완료 기준: 빈 앱 창이 뜨고, 배포된 API가 응답한다.

## 2주 — DB

학습: 테이블 설계, FK, 인덱스, RLS

- [ ] `docs/02-db.md`대로 마이그레이션 작성 (profiles, groups, bookmarks, visit_logs, api_tokens)
- [ ] 인덱스 10개 생성
- [ ] RLS 정책 + `on_auth_user_created`, `set_updated_at` 트리거
- [ ] `record_visit` 함수
- [ ] Drizzle 스키마를 `packages/db`에 작성하고 마이그레이션과 일치 확인

완료 기준: SQL 에디터에서 사용자 두 명을 만들어 서로의 데이터가 안 보이는 것을 확인한다.

## 3주 — Google 로그인

학습: OAuth 2.0 + PKCE, 토큰 보관

- [ ] Google Cloud Console에서 OAuth 클라이언트 생성, Supabase Auth에 연결
- [ ] 메인 프로세스 루프백 서버(`http://127.0.0.1:<포트>/callback`)
- [ ] 시스템 브라우저 열기 → 코드 수신 → 메인 프로세스가 Supabase Auth와 직접 교환 (`POST /auth/v1/token?grant_type=pkce`)
- [ ] 리프레시 토큰 `safeStorage` 저장, 앱 시작 시 자동 로그인 (AUTH-02)
- [ ] 로그아웃 (AUTH-03), 로그인 화면 SCR-01

완료 기준: 로그인 후 앱을 껐다 켜도 로그인 상태가 유지된다.

## 4주 — 북마크 API + 크롬 확장

학습: REST 설계, 토큰 인증, 트랜잭션, 크롬 확장 API

- [ ] `packages/shared`에 Zod 스키마 작성
- [ ] BM-01~05: `/bookmarks` CRUD, URL 정규화·중복 검사
- [ ] `/metadata` (SSRF 차단 포함)
- [ ] `/tokens` 발급·목록·폐기 (해시 저장)
- [ ] `/sync/chrome` (full/partial, 트랜잭션)
- [ ] 확장 EXT-01~04: manifest(`key`로 ID 고정), 팝업 토큰 입력, 이벤트 리스너

완료 기준: 크롬에서 북마크를 추가하면 몇 초 안에 DB에 들어온다.

## 5주 — 파일 동기화

학습: Node fs, IPC, JSON 파싱

- [ ] `chrome-file.ts`: 기본 경로 탐색, Bookmarks JSON 파싱, `date_added` 변환
- [ ] `Local State`에서 프로필 목록 읽기 (DESK-02)
- [ ] 파일 직접 선택 대화상자 (DESK-01 예비 경로)
- [ ] preload로 `readChromeBookmarks()` 노출, 렌더러에서 호출 → `/sync/chrome`
- [ ] 첫 동기화 화면 SCR-02, 자동 동기화 (DESK-03)

완료 기준: 앱 실행만으로 크롬 북마크 전체가 DB에 들어온다.

## 6주 — 그리드 화면

학습: React 컴포넌트, TanStack Query

- [ ] BookmarkGrid, BookmarkIcon(파비콘 실패 시 글자 타일), ContextMenu
- [ ] 추가·수정 모달 SCR-04
- [ ] OPEN-01~03, DESK-08 (`shell.openExternal`)
- [ ] 방문 기록 비동기 전송, 낙관적 업데이트

완료 기준: 클릭하면 기본 브라우저에서 열리고 방문이 기록된다.

## 7주 — 검색·정렬

학습: SQL 집계·조인, 클라이언트 필터링

- [ ] SEARCH-01 실시간 검색
- [ ] SEARCH-04 정렬 5종, 30일 집계 쿼리. 고정(BM-07)은 어떤 정렬에서도 맨 앞
- [ ] SEARCH-05 정렬 설정 저장 (`PATCH /me`)
- [ ] DESK-04 오프라인 캐시(electron-store) + 배지
- [ ] 500개 초과 시 가상 스크롤

완료 기준: 북마크 1,000개에서도 검색이 즉시 반응한다.

## 8주 — MVP 마무리

학습: 패키징, 테스트, 보안 점검

- [ ] electron-builder(NSIS)로 설치 파일 생성
- [ ] E2E: 로그인 → 동기화 → 검색 → 열기
- [ ] 보안 점검: 타인 데이터 접근, SSRF, `javascript:` URL, 토큰 저장 위치
- [ ] README에 설치·개발 방법 정리
- [ ] 회고: 8주간 배운 것 기록

완료 기준: 다른 Windows PC에 설치해 실제로 쓴다.

## 9~11주 — v1.1

- 9~10주: 그룹(GROUP-01~02), 드래그 정렬(SEARCH-06), 태그(BM-08), 초성 검색(SEARCH-02), 단축키(SEARCH-03), 트레이·전역 단축키(DESK-05~06)
- 11주: 테마(SET-02), 탈퇴(AUTH-04), 오래된 로그 정리 작업, 문서 정리
- 후보: 열기 방식(SET-01). `openExternal`은 탭을 고를 수 없어 v1에서 뺐다. 크롬 확장이 현재 탭을 바꾸는 방식으로 검토

## v2.0 이후 후보

확장의 현재 페이지 추가(EXT-05), 내보내기(IO-02), 아이콘 크기(SET-03), 자동 업데이트·코드 서명, 모바일에서 보는 웹 화면.

## 남은 결정

- 도메인
- 앱 자동 업데이트와 코드 서명 도입 여부
- 확장을 크롬 웹스토어에 올릴지
