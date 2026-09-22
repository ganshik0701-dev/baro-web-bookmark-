# 바로 (baro) — 프로젝트 지침

이 파일은 이 저장소에서 작업하는 AI 코딩 도구가 가장 먼저 읽는 문서다. 상세 내용은 `docs/` 아래에 있다.

## 한 줄 설명

크롬 북마크를 스마트폰 홈 화면 같은 아이콘 그리드로 보여주고 한 번 클릭으로 여는 **Windows 데스크톱 앱**. 수익 목적이 아닌 학습 프로젝트다.

## 문서 지도

| 파일 | 내용 | 언제 읽나 |
| --- | --- | --- |
| `docs/01-spec.md` | 기능 명세(기능 ID), 화면 명세 | 기능 구현 전 항상 |
| `docs/02-db.md` | 테이블·인덱스·RLS·함수, 마이그레이션 초안 | DB 작업, API 작업 |
| `docs/03-api.md` | 엔드포인트 목록, 요청·응답, 에러 코드 | API·클라이언트 작업 |
| `docs/04-design.md` | 색·글꼴·간격 토큰, UI 규칙 | 화면 작업 |
| `docs/05-roadmap.md` | 주차별 작업과 완료 기준 | 다음 할 일 정할 때 |
| `docs/06-prompts.md` | 기능별 설명과 작업 지시 문구 | 사람이 작업을 시킬 때 |
| `PROGRESS.md` | 전체 진행 체크리스트 | 작업 시작할 때와 끝낼 때 |

원본 계획서(사람이 편집하는 문서): https://claude.ai/code/artifact/1336b756-3f79-4be0-ac3a-d72bf769c919
디자인 시안(캔버스): https://claude.ai/artifact/1Z6ff82mXSqL97Mm8eQD6f

문서와 코드가 어긋나면 **문서를 먼저 고치고** 코드를 고친다.

## 확정된 결정 (바꾸려면 사람에게 먼저 물어볼 것)

- 형태: Electron 데스크톱 앱, **Windows 전용**. 웹 화면은 v2.0
- 로그인: **Google 로그인만**. 이메일·비밀번호 로그인 없음
- 북마크 수집: 앱이 크롬 `Bookmarks` 파일을 직접 읽는 것이 주 경로, 크롬 확장은 실시간 변경 반영(보조), HTML 업로드는 예비
- 데이터: 전부 서버(Supabase). 앱 로컬에는 캐시만
- '자주 방문순' = **최근 30일** 방문 횟수 (`visit_logs` 집계)
- 확장은 크롬 웹스토어에 올리지 않고 개발자 모드로 설치 (manifest `key`로 ID 고정)
- 수익 모델 없음, 도메인 미정

## 아키텍처

```
apps/desktop   Electron + React (화면, 파일 읽기, 로그인)
apps/api       Next.js Route Handler (REST API)  → Vercel
apps/extension 크롬 확장 Manifest V3 (실시간 동기화)
packages/shared 타입·Zod 스키마 (세 곳 공용)
packages/db    Drizzle 스키마·마이그레이션
supabase/migrations  SQL, RLS, 트리거
```

- 앱과 확장은 **API를 통해서만** DB에 접근한다. 클라이언트에서 Supabase에 직접 쿼리하지 않는다.
- 앱의 API 호출은 **메인 프로세스에서만** 한다. 렌더러는 preload가 노출한 API 전용 함수(IPC)로만 요청하고, 범용 fetch는 노출하지 않는다. 액세스 토큰도 메인 프로세스에만 둔다
- 앱 인증: `Authorization: Bearer <Supabase 액세스 토큰>`
- 로그인·토큰 갱신은 앱 메인 프로세스가 Supabase Auth와 **직접** 주고받는다(PKCE `code_verifier`가 앱 밖으로 나가면 안 되므로). 인증은 위 "API를 통해서만" 규칙의 예외이고, DB 접근은 예외 없이 API를 지난다
- 확장 인증: `Authorization: Bearer baro_<API 토큰>`

## 기술 스택

TypeScript / Electron 33 + electron-vite / React 19 + Vite / Tailwind CSS + shadcn/ui / TanStack Query / Zustand / Zod / Next.js 15 / Supabase(PostgreSQL) / Drizzle ORM / electron-builder(NSIS) / Vitest + Playwright

## 코드 규칙

- 파일명: 컴포넌트 `PascalCase.tsx`, 그 외 `kebab-case.ts`
- API 응답은 camelCase, DB 컬럼은 snake_case. 변환은 서버에서만 한다
- 모든 API 요청 바디는 `packages/shared`의 Zod 스키마로 검증한다. 스키마를 프론트 폼 검증에도 재사용한다
- 에러는 `{ error: { code, message } }` 형태로 통일한다. 코드 목록은 `docs/03-api.md`
- 주석과 커밋 메시지는 한국어로 쓴다. 커밋: `feat(BM-01): 북마크 추가 API` 처럼 기능 ID를 넣는다

## Electron 보안 (반드시 지킬 것)

- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`
- 파일 읽기·브라우저 열기·키체인 접근은 **메인 프로세스에서만**. 렌더러에는 preload의 `contextBridge`로 필요한 함수만 노출
- 크롬 `Bookmarks` 파일은 **읽기 전용**으로만 다룬다. 절대 쓰지 않는다
- 리프레시 토큰은 `safeStorage`로 암호화해 저장한다. 평문 파일 저장 금지
- 북마크는 `shell.openExternal`로 OS 기본 브라우저에서 연다. 앱 내부 창에서 열지 않는다

## API 보안

- 모든 테이블 RLS 적용 + API 쿼리에도 `user_id` 조건을 직접 붙인다
- API는 요청마다 사용자 권한(`authenticated` 역할 + 검증한 토큰의 claims)으로 RLS를 켠 트랜잭션 안에서만 쿼리한다(`withUserDb`). 서비스 키로 쿼리하지 않는다
- `/metadata`는 사설 IP(10.x, 172.16~31.x, 192.168.x, 127.x, 169.254.x 등 공인 unicast가 아닌 모든 IP)와 localhost를 차단하고, 포트는 80·443만 허용한다(SSRF). IP 검사는 소켓을 여는 시점에 하고(DNS 리바인딩 방지), 리다이렉트마다 다시 한다. 리다이렉트 3회 제한, 응답 1MB·3초 제한
- `http`/`https`가 아닌 URL(`javascript:`, `data:`)은 저장도 실행도 거부한다
- API 토큰은 원본을 저장하지 않고 SHA-256 해시만 저장한다
- 비밀값(서비스 키, DB 주소 등)은 `apps/api/.env`에만 둔다. `apps/desktop/.env`(와 이후 확장)에는 공개값(`VITE_`)만 둔다. 앱 쪽 `.env` 값은 빌드 시 설치 파일에 그대로 들어간다

## 작업 방식 (바이브 코딩)

1. 한 번에 **기능 ID 하나**만 구현한다. 예: "BM-01을 docs/03-api.md 명세대로 구현"
2. 순서는 API → 화면 → 테스트. API는 화면을 붙이기 전에 직접 호출해 확인한다
3. 스키마나 명세를 바꿔야 할 것 같으면 코드를 고치기 전에 문서 수정안을 먼저 제안한다
4. 완료되면 무엇을 왜 그렇게 했는지 3줄 이내로 설명한다. 사용자가 코드를 읽고 이해하는 것이 이 프로젝트의 목적이다
5. 요청하지 않은 기능은 추가하지 않는다. P0가 끝나기 전에 P1·P2에 손대지 않는다
6. 작업을 마치면 반드시 PROGRESS.md를 갱신한다. 사람이 따로 시키지 않아도 한다
   - 끝난 항목의 `- [ ]` 를 `- [x]` 로 바꾼다
   - 맨 위 '마지막 갱신' 날짜를 오늘로 고친다
   - 부분만 끝났으면 체크하지 말고, 무엇이 남았는지 사람에게 알린다
   - 체크리스트에 없던 작업을 했으면 해당 주차에 항목을 추가하고 체크한다
   - 체크박스는 실제로 동작을 확인한 것만 채운다. 코드를 작성한 것과 확인한 것은 다르다

## 지금 상태

PROGRESS.md를 보고 판단한다. 작업을 시작하기 전에 항상 먼저 읽고, 체크되지 않은 가장 위 항목부터 진행한다.
