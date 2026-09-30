## 8주차 — MVP 마무리

- 계획(2026-10-01, 사람과 정함): 8주차 1주 기준, 발표일 미정
  - 순서: 1일차 운영 API 확인·배포 주소·didStartupSync → 2~3일차 설치 파일 묶음(설치 파일, 디버깅 포트 막기, 운영 CSP, Google 파비콘 재검토, 설치본 로그인) → 보안 점검 → 성능 측정(가짜 캐시로 DB 쓰기 없이) → README·다른 PC 설치·회고
  - 디버깅 포트: 두 가지를 함께 — (1) `app.isPackaged`일 때 `--remote-debugging-port`·`--inspect` 계열 스위치가 있으면 바로 종료 (2) Electron Fuses로 `RunAsNode`·`EnableNodeCliInspectArguments` 끄기(`ELECTRON_RUN_AS_NODE`로 설치본을 Node처럼 돌리는 통로까지 막음)
  - E2E는 v1.1 후보로 뺌(로그인 세션·운영 DB 준비가 크고, 완료 기준에 들지 않음)
- [x] 운영 API가 main과 같은지 (2026-10-01)
  - Vercel이 GitHub와 연결돼 main 푸시마다 Production 배포. 최근 커밋 5개 모두 Production 배포 기록, main HEAD `ee8f54b`의 Vercel 상태 success → 배포 필요 없음
  - GET만으로: health 200·icn1·version 0.1.0, `/me`·`/tokens`·`/bookmarks`·`/metadata`는 토큰 없이 401(라우트 있음), `/sync/chrome` GET 405, 없는 경로 404. API 코드 마지막 변경 `c42e030`(autoSync·토큰 API)과 `fb38969`(recentVisits)는 그 뒤 배포에 포함
  - 응답 안 필드(`autoSync`·`recentVisits`)는 토큰이 필요해 GET으로 못 봄 → 설치본 로그인 때 함께 확인
- [x] `apps/desktop/.env.production` (2026-10-01)
  - `VITE_API_BASE_URL=https://baro-web-bookmark-api.vercel.app/api/v1` 한 줄. Supabase 주소·anon 키는 `.env` 값을 그대로 씀(같은 프로젝트). 비밀값 없음
  - 앱은 메인 프로세스(`main/api.ts`·`auth.ts`)가 `import.meta.env.VITE_*`로 읽는다. electron-vite는 `VITE_`를 메인에도 넣고, 빌드(production 모드)에서 `.env.production`이 `.env`를 덮는다
  - `electron-vite build` 결과 `out/main`에 운영 API 주소 1곳만, localhost:3000 없음, Supabase 주소 확인
  - `.gitignore`는 `.env`·`.env.local`만 막아 `.env.production`은 git에 들어간다 → 공개값뿐이라 **커밋하기로**(사람 결정, 다른 PC에서 빌드해도 같은 결과). 맨 위에 "공개값만. 비밀값(서비스 키 등)은 넣지 말 것" 주석
- [ ] didStartupSync → 로그인할 때마다 (2026-10-01, 코드·테스트 끝, 실제 앱 확인 남음)
  - 문서 먼저: 01-spec.md DESK-03 줄·'자동 동기화'(로그인 세션이 새로 생길 때마다 1회, 같은 세션의 토큰 갱신에서는 안 함, 로그아웃하면 동기화 상태와 첫 동기화 화면 기억을 비움)·첫 동기화 전 규칙("이 확인도 로그인할 때마다")
  - 원인이 둘: 메인의 `didStartupSync`(실행당 1번)와, 렌더러 `App.tsx`의 첫 동기화 화면 '열었음/닫았음'이 로그아웃해도 남던 것(한 번 닫으면 같은 실행 안에서 다른 계정이 첫 동기화 전이어도 안 뜸)
  - 코드: `main/login-watch.ts`(순수 함수, 없음 → 있음 또는 계정이 바뀔 때 onLogin, 세션이 없어지면 onLogout), `main/index.ts`는 onLogin에 `startupSync`, onLogout에 동기화 상태 초기화, `App.tsx`는 로그아웃 때 첫 동기화 화면 기억도 비움
  - 단위 테스트 7개(복원 뒤 1번, 토큰 갱신은 안 돎, 같은 실행 안 로그아웃 → 재로그인에 다시 돎, 다른 계정, 로그아웃 없이 계정 바뀜, 로그인 없이 로그아웃 알림, 이메일 없는 세션) → desktop 270 통과, typecheck 통과
