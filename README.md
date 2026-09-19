# 바로 (baro)

크롬 북마크를 폰 홈 화면처럼 아이콘 그리드로 보여주는 Windows 데스크톱 앱. 학습용 프로젝트.

계획서와 명세는 `CLAUDE.md`와 `docs/`에 있다.

## 준비물

- Node.js 20 이상
- pnpm 10 (`corepack enable` 후 `package.json`의 `packageManager` 버전이 자동으로 쓰인다)
- Supabase 프로젝트 (2주차부터 필요)

## 시작하기

```bash
pnpm install
cp apps/api/.env.example apps/api/.env          # 서버 비밀값. 값은 각자 채운다
cp apps/desktop/.env.example apps/desktop/.env  # 앱 공개값

pnpm dev:api                # http://localhost:3000/api/v1/health
pnpm dev:desktop            # Electron 창
```

앱 창에서 'API 상태 확인'을 눌러 초록색 응답이 나오면 1주차 환경 설정이 끝난 것이다.

## 명령어

| 명령 | 설명 |
| --- | --- |
| `pnpm dev:api` | API 서버 개발 모드 |
| `pnpm dev:desktop` | 앱 개발 모드 (핫 리로드) |
| `pnpm typecheck` | 전체 타입 검사 |
| `pnpm build:api` | API 빌드 |
| `pnpm --filter @baro/desktop package` | Windows 설치 파일 생성 (8주차) |

## 구조

```
apps/desktop     Electron + React (화면, 파일 읽기, 로그인)
apps/api         Next.js Route Handler (REST API) → Vercel
apps/extension   크롬 확장 (4주차에 추가)
packages/shared  타입·Zod 스키마
packages/db      Drizzle 스키마 (2주차에 추가)
supabase/        마이그레이션 SQL (2주차에 추가)
```
