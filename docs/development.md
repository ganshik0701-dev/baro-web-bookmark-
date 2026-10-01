# 개발 문서

처음 온 사람용 안내는 [README](../README.md). 이 문서는 개발·빌드에 필요한 나머지를 모았다(README에서 그대로 옮김, 2026-10-02).

## 크롬 확장 (선택)

앱은 열 때 크롬 북마크 파일을 읽어 동기화한다. 크롬에서 북마크를 추가·삭제하는 즉시 반영하고 싶으면 확장을 설치한다. 웹스토어에는 올리지 않아 개발자 모드로 설치한다.

1. `pnpm --filter @baro/extension build` → `apps/extension/dist`가 생긴다
2. 크롬 `chrome://extensions` → '개발자 모드' 켜기 → '압축해제된 확장 프로그램을 로드합니다' → `apps/extension/dist`
3. 앱의 설정 → 확장 프로그램에서 토큰을 발급해 확장 팝업에 붙여 넣는다(토큰은 발급할 때 한 번만 보인다)

자세한 내용은 [`apps/extension/README.md`](../apps/extension/README.md).

## 개발 환경

### 준비물

- Windows (앱이 Windows 전용)
- Node.js 20 이상
- pnpm 10 (`corepack enable` 후 `package.json`의 `packageManager` 버전이 자동으로 쓰인다)
- Supabase 프로젝트 하나(Google 로그인 설정, `supabase/migrations` 적용)

### 시작하기

```bash
pnpm install
cp apps/api/.env.example apps/api/.env          # 서버 비밀값(서비스 키, DB 주소). 값은 각자 채운다
cp apps/desktop/.env.example apps/desktop/.env  # 앱 공개값(API 주소, Supabase 주소·anon 키)

pnpm dev:api                # http://localhost:3000/api/v1/health
pnpm dev:desktop            # Electron 창(핫 리로드)
```

- 비밀값은 `apps/api/.env`에만 둔다. `apps/desktop`의 `.env`·`.env.production` 값은 설치 파일에 그대로 들어가므로 공개해도 되는 값만 둔다
- 설치 파일(배포 빌드)은 `apps/desktop/.env.production`의 운영 API 주소를 쓴다

### 명령어

| 명령 | 설명 |
| --- | --- |
| `pnpm dev:api` | API 서버 개발 모드 |
| `pnpm dev:desktop` | 앱 개발 모드(핫 리로드) |
| `pnpm typecheck` | 전체 타입 검사 |
| `pnpm --filter "!@baro/api" test` | API를 뺀 단위 테스트(앱·확장·shared). DB를 쓰지 않는다 |
| `pnpm test` | 전체 테스트. **아래 주의를 먼저 읽을 것** |
| `pnpm build:api` | API 빌드 |
| `pnpm --filter @baro/extension build` | 크롬 확장 빌드(`apps/extension/dist`) |
| `pnpm --filter @baro/desktop package` | Windows 설치 파일 만들기 |

> **주의: API 테스트 일부는 실제 DB에 쓴다.**
> `apps/api/.env`에 `DATABASE_POOLER_URL`이 있으면 `pnpm test`가 그 DB에 가짜 사용자(`…-test-<uuid>@example.com`)와 북마크를 만들었다가 지운다. 테스트가 중간에 실패하면 남을 수 있고, 5,000개 동기화 테스트는 수십 초가 걸린다.
> 개발과 운영이 같은 Supabase 프로젝트라면 `pnpm test` 대신 `pnpm --filter "!@baro/api" test`를 쓴다. API 테스트 중 DB가 필요 없는 것만 돌리려면 Git Bash에서 `DATABASE_POOLER_URL= pnpm --filter @baro/api test`(값을 빈 문자열로 두면 DB 테스트는 건너뛴다. PowerShell에서 빈 값을 넣으면 변수가 지워져 `.env` 값이 다시 읽히므로 이 방법이 통하지 않는다).

### 설치 파일 만들기

```bash
pnpm --filter @baro/desktop package
# → apps/desktop/release/baro-<버전>-setup.exe
```

- `pnpm dev:desktop`은 `apps/desktop/out/`을 개발 빌드(API 주소 `localhost:3000`)로 덮어쓴다. `package`는 먼저 다시 빌드하므로 괜찮지만, `out/`을 직접 쓸 때는 `pnpm build:desktop`으로 다시 만든다
- 설치본에는 디버깅 통로가 없다(`--remote-debugging-port`·`--inspect` 스위치면 바로 종료, Electron Fuses, DevTools 없음). 자세한 규칙은 `CLAUDE.md` 'Electron 보안'
- 처음 빌드할 때 electron-builder가 도구를 내려받는다. Windows에서 `winCodeSign` 압축을 풀다 "Cannot create symbolic link"로 멈추면(macOS용 링크 2개를 만들 권한이 없음), 내려받은 `.7z`를 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`에 그 두 파일만 빼고 직접 풀면 된다(이 프로젝트에서 쓴 방법, `docs/progress/week-08.md`)

## 구조

```
apps/desktop      Electron + React. 화면, 크롬 북마크 파일 읽기(읽기 전용), Google 로그인
apps/api          Next.js Route Handler(REST API) → Vercel
apps/extension    크롬 확장(Manifest V3). 북마크 변경을 실시간으로 보낸다
packages/shared   타입·Zod 스키마(세 곳이 함께 쓴다)
packages/db       Drizzle 스키마
supabase/         마이그레이션 SQL(RLS·트리거·함수), 확인용 SQL
docs/             명세(01-spec), DB(02-db), API(03-api), 디자인(04-design), 로드맵, 주차별 진행 기록
```

앱과 확장은 API를 통해서만 DB에 접근한다. 앱의 API 호출은 메인 프로세스에서만 하고, 렌더러는 preload가 열어 준 함수로만 요청한다.

## 알려진 한계 (v1.1 후보)

- 코드 서명이 없어 SmartScreen 경고가 뜬다. 자동 업데이트 없음
- 북마크가 1,000개쯤 되면 검색어를 지울 때 그리드를 다시 그리는 데 시간이 걸린다(개발 모드 측정 약 0.3초). 입력칸은 막히지 않는다
- 창 크기를 바꾸거나 사이드바를 접은 직후 몇 프레임 동안 열 수가 한 박자 늦게 따라간다(넘치거나 겹치지는 않는다)
- 개발과 운영이 같은 Supabase 프로젝트를 쓴다(개발용 DB 분리는 v1.1)
- 그룹·태그·드래그 정렬·단축키·트레이·테마는 v1.1 이후. 전체 목록은 `PROGRESS.md` 'v1.1로 옮긴 것'
