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
- [x] didStartupSync → 로그인할 때마다 (2026-10-01, 코드·단위 테스트·실제 앱 확인 끝)
  - 문서 먼저: 01-spec.md DESK-03 줄·'자동 동기화'(로그인 세션이 새로 생길 때마다 1회, 같은 세션의 토큰 갱신에서는 안 함, 로그아웃하면 동기화 상태와 첫 동기화 화면 기억을 비움)·첫 동기화 전 규칙("이 확인도 로그인할 때마다")
  - 원인이 둘: 메인의 `didStartupSync`(실행당 1번)와, 렌더러 `App.tsx`의 첫 동기화 화면 '열었음/닫았음'이 로그아웃해도 남던 것(한 번 닫으면 같은 실행 안에서 다른 계정이 첫 동기화 전이어도 안 뜸)
  - 코드: `main/login-watch.ts`(순수 함수, 없음 → 있음 또는 계정이 바뀔 때 onLogin, 세션이 없어지면 onLogout), `main/index.ts`는 onLogin에 `startupSync`, onLogout에 동기화 상태 초기화, `App.tsx`는 로그아웃 때 첫 동기화 화면 기억도 비움
  - 단위 테스트 7개(복원 뒤 1번, 토큰 갱신은 안 돎, 같은 실행 안 로그아웃 → 재로그인에 다시 돎, 다른 계정, 로그아웃 없이 계정 바뀜, 로그인 없이 로그아웃 알림, 이메일 없는 세션) → desktop 270 통과, typecheck 통과
  - 코드는 `0a70dde`로 먼저 커밋·푸시, CI 통과
  - 실제 앱 확인 (2026-10-01, 테스트 계정, 로컬 API + 운영 DB, 앱은 `BARO_REFRESH_MARGIN_SEC=3590`으로 켜 10초마다 토큰 갱신, 앱은 끝까지 끄지 않음. 북마크 쓰기 없음 — 동기화 3건 모두 추가·수정·삭제 0, last_synced_at만 갱신)
    - [x] ㉡ 토큰 갱신: 45초 동안 갱신 4번, `POST /sync/chrome`은 앱 시작 때 1건 그대로
    - [x] ㉠ 같은 실행 안 재로그인: 설정 → 로그아웃 → 앱을 끄지 않고 Google 로그인 → 자동 동기화 1건 더(1 → 2건, 건너뜀 7)
    - [x] 로그아웃하면 동기화 상태가 비워짐(phase idle, firstSync·lastSyncedAt·lastResult null)
    - [x] ㉢ 첫 동기화 화면: 로그아웃한 채(앱 켜 둠) 사람이 `step8-update.sql`로 last_synced_at NULL(RETURNING 1행) → 다시 로그인 → **첫 동기화 화면**(firstSync true, Default 선택, POST 0건) → '나중에 하기' → 로그아웃 → 다시 로그인 → **첫 동기화 화면이 다시 뜸**(렌더러의 '닫았음' 기억이 로그아웃에서 비워짐, POST 0건) → '가져오기'(POST 1건) → '시작하기' → 홈 111개
    - 끝 상태: 기준값과 같음(북마크 111·고정 0·manual 0·방문 0, 토큰 0, auto_sync true, chrome_profile·선택 파일 Default, 정렬 created_desc, 사이드바 "0"), last_synced_at 2026-09-30T17:42:20Z. 앱은 창 닫기, API 끔
- [x] 설치 파일 묶음 (2026-10-01)
  - 사람 결정: 원클릭 설치(`oneClick: true`, `perMachine: false`, 폴더 선택 없음), 실행 파일·설치 경로 영문 `baro`, 바로가기·제거 목록 이름 "바로", 제거해도 앱 데이터 남김(기본값), `@electron/fuses` 개발 의존성 추가, 파비콘은 README·계정 카드에 알리고 근본 해결은 v1.1, 빌드 CSP `connect-src 'none'`
  - 문서: CLAUDE.md 'Electron 보안'(설치본 디버깅 통로 없음·Fuses·DevTools·CSP), 01-spec '설치·제거'(원클릭, 데이터 폴더 `%APPDATA%\baro` 개발 앱과 분리, 제거해도 session.bin 남음)·파비콘 한계 '배포 때 알리기로 결정'·계정 카드 안내 문구, README '개인정보 안내'
  - 코드: `main/launch-guard.ts`(설치본에서 `--remote-debugging-*`·`--inspect*`·`--js-flags`면 창 전에 종료, `-`·대문자도) + 테스트 5개, 설치본만 userData `%APPDATA%\baro`·`devTools` 끔·기본 메뉴 없음, `ELECTRON_RENDERER_URL`은 개발에서만, `index.html` CSP `connect-src 'none'`(devCsp가 개발 서버에서만 통째로 바꿈), 계정 카드 안내 한 줄 → desktop 275 통과, typecheck 통과
  - 빌드 설정: `electron-builder.yml`(원클릭·이름·아이콘 `build/icon.png`(로고 SVG에서 256px)·`afterPack: build/after-pack.cjs`·`'!**/*.map'`), Fuses: RunAsNode·EnableNodeOptionsEnvironmentVariable·EnableNodeCliInspectArguments 끔, OnlyLoadAppFromAsar 켬
  - `electron-store`·`@fontsource/hahmlet`을 devDependencies로(dependencies 비움): 첫 빌드 asar에 node_modules 21개 패키지 26MB(ajv `.map` 109개, 글꼴 중복 24MB) → 0, asar 28MB → 7.7MB, 설치 파일 101MB → 83MB
  - 빌드 환경: winCodeSign 묶음의 macOS 심볼릭 링크 2개를 만들 권한이 없어 실패 → 캐시에 그 둘만 빼고 직접 풂(사람 승인). NSIS 플러그인 동시 내려받기 충돌 1회는 다시 실행으로 해결
  - [x] 결과물 검사 (Claude, `release\win-unpacked\baro.exe`)
    - asar: node_modules 없음, `.map`·`.env`·`sourceMappingURL` 0, localhost 0(127.0.0.1은 로그인 루프백만), 운영 API 주소만, 서비스 키·DB 주소 없음, `BARO_REFRESH_MARGIN_SEC`·`ELECTRON_RENDERER_URL`은 isPackaged 검사 안에서만
    - 금지 스위치 4종(`--remote-debugging-port`·`-pipe`·`--inspect`·`--inspect-brk`): 0.5~1.2초 안에 종료 코드 1, 열린 포트 없음, 데이터 폴더 안 생김, 개발 폴더 변화 없음
    - `ELECTRON_RUN_AS_NODE=1`: Node로 안 돎(표시 파일 안 생김), 평범한 앱으로 로그인 화면. `ELECTRON_RENDERER_URL`=미끼 서버: 요청 0건, 로그인 화면
    - 정상 실행: 오류 없이 로그인 화면, 메뉴 막대 없음, 데이터 폴더 `%APPDATA%\baro`
    - CSP: 설치본은 DevTools가 없고 파일 로그에 콘솔이 안 남아, 같은 `out/`을 패키지 없이 CDP로 띄워 확인 → 앱 자체 위반 0건(양성 대조 `fetch` 1건은 'Refused to connect'로 잡힘). 404 28건은 아이콘 없는 사이트의 Google 파비콘(원래 동작)
    - 이 CDP 실행의 부작용: 개발 폴더 로그인으로 홈이 열려 **앱 시작 자동 동기화 1회**(허용된 예외), 화면 기준 북마크 111·고정 0. `session.bin`은 토큰 갱신으로 시각만 바뀜, `chrome-selection.json`(Default) 그대로. manual·토큰·last_synced_at은 SQL 미확인
    - (정리, 2026-10-01 사람 결정) CSP 확인 실행 두 번 모두: 읽기와 CSP에 막힌 요청뿐, 앱 시작 자동 동기화 1회 외 쓰기 없음. manual·토큰은 이 실행으로 바뀔 경로가 없어 조회 생략(last_synced_at은 자동 동기화로 갱신되는 것이 정해진 동작)
  - [x] 사람 확인 1차 (2026-10-01): 원클릭 설치(선택 화면 없음), 바로가기 "바로"(바탕 화면·시작 메뉴), 메뉴 막대 없음, 제거(바로가기·제거 목록 없어짐), 데이터 폴더 분리(설치본은 `%APPDATA%\baro`만 씀, 개발 폴더는 그대로) 확인
    - **정정(2차에서 발견)**: 1차에 "설치 폴더 없어짐"으로 적었으나 **미확인**이었다. 실제 설치 폴더는 `%LOCALAPPDATA%\Programs\@barodesktop`이었는데 Claude가 `%LOCALAPPDATA%\Programs\baro`를 보고 "없음"으로 판단했다. 바로가기·제거 목록 확인은 유효
    - 로그인 없이 로그인 화면만 보고 제거해서 session.bin이 생기지 않았다(정상). **설치본 로그인과 '제거 뒤 session.bin 남음'은 미확인** → 2차에서 확인
  - [x] 사람 확인 2차 (2026-10-01): 다시 설치 → Google 로그인 → 홈 111 → 계정 카드 안내 문구 (사람) → `%APPDATA%\baro\session.bin` 생김(62바이트, 14:11), 개발 폴더 그대로 (Claude) → 로그아웃 없이 제거 (사람) → session.bin 남음, 제거 목록·바로가기 없어짐 (Claude)
    - 발견: 설치 폴더가 `%LOCALAPPDATA%\Programs\@barodesktop`(실행 중 프로세스 경로·제거 목록 UninstallString으로 확인). electron-builder가 설치 폴더 이름을 package.json `name`(`@baro/desktop`)에서 만든다 → `extraMetadata.name: baro`로 고침(사람 승인)
    - 발견: 제거 뒤 그 설치 폴더가 **빈 폴더로 남음**(파일 0개). NSIS 제거 프로그램이 자기 폴더를 못 지우는 경우가 흔하다. 빈 폴더만 지움(빈 폴더 전용 삭제)
    - 아이콘 색: 시안 로고(B_Login·B_Icon `{{accent}}` 기본 #2F5BD3, 모서리 14/46, 흰 번개 2.4)와 `build/icon.png`·baro.exe·setup.exe 아이콘 배경이 모두 rgb(47,91,211) = `--accent`로 같다 → 바꾸지 않음
  - [x] `extraMetadata` 다시 빌드 결과물 검사 (Claude, 2026-10-01 14:51): asar package.json name `baro`, 이전 항목 전부 같은 결과(node_modules 0·`.map` 0·localhost 0·운영 API만·비밀값 없음·Fuses 4개, 금지 스위치 4종 종료 코드 1·포트 없음, RUN_AS_NODE 표시 파일 없음, RENDERER_URL 미끼 요청 0, 정상 실행 로그인 화면, CSP 앱 위반 0·대조 1건 잡힘)
    - 검사 전에 2차 `%APPDATA%\baro\session.bin`을 scratchpad로 **옮김**(지우지 않음): 로그인된 채로 실행하면 검사마다 자동 동기화가 돌고, 3차는 로그인 화면부터 봐야 해서
    - CSP용 CDP 실행 부작용: 개발 폴더 로그인으로 **앱 시작 자동 동기화 1회**(허용된 예외), 화면 전체 111·고정됨 0. 개발 폴더 `session.bin`은 토큰 갱신으로 시각만 바뀜, 선택 파일 Default 그대로
  - [x] 사람 확인 3차(`extraMetadata` 다시 빌드, 한 단계씩): 설치 → 설치 폴더 `%LOCALAPPDATA%\Programs\baro` → 아이콘 색 → 로그인 → 로그아웃 없이 제거 → session.bin 남음 (2026-10-01)
    - 첫 시도(16:02 확인): `%APPDATA%\baro\session.bin` 없음. 14:51 빌드 뒤 설치 흔적도 없음(`Programs` 폴더 마지막 변경 14:49, `%APPDATA%\baro` 마지막 변경 14:52 = Claude 검사, 바로가기·제거 목록 없음) → 설치·로그인이 이 빌드로 이뤄졌는지 확인할 수 없어 **미확인**, 한 단계씩 처음부터 다시
    - 아이콘 색은 B 시안(#2F5BD3)이 맞음(사람 확인, 예전 시안과 헷갈렸던 것)
    - 설치 (사람) → `%LOCALAPPDATA%\Programs\baro` 확인 (Claude: 파일 시각 14:50 = 이번 빌드, 실행 중 프로세스·제거 목록 UninstallString·바탕 화면/시작 메뉴 "바로" 바로가기 모두 `%LOCALAPPDATA%\Programs\baro\baro.exe`, session.bin 아직 없음)
    - Google 로그인·홈 111 (사람) → `%APPDATA%\baro\session.bin` 생김(62바이트, 16:33:14), 개발 폴더 그대로 (Claude). 첫 동기화 화면은 서버 lastSyncedAt이 있어 안 뜸(명세대로), 선택 파일 없음
    - 로그아웃 없이 제거 (사람) → 제거 목록·바로가기·프로세스 없음, **session.bin 남음**(16:33:14 그대로), 설치 폴더는 빈 폴더로 남음(2차와 같음, 빈 폴더만 지움) (Claude)
- [x] 보안 점검 (2026-10-01, 점검·수정·재확인 끝)
  - 이미 끝(설치 파일 묶음): 디버깅 스위치·Fuses·DevTools·메뉴·빌드 CSP·ELECTRON_RENDERER_URL·데이터 폴더 분리·설치본 비밀값 없음
  - ② 토큰 노출(코드 읽기): 문제 없음. 콘솔은 오류 메시지만, preload는 정해진 함수만(ipcRenderer 그대로 노출 없음), 상태 IPC는 이메일·만료 시각만, 로그인 루프백은 127.0.0.1·GET /callback만·2분 뒤 닫힘·PKCE verifier는 메인 밖으로 안 나감, 확장은 storage.local에만·화면엔 끝 4자리
  - ③ 위험 URL(코드 읽기): 문제 없음. 서버 입력 경로(추가·수정·/metadata·동기화 항목별) 모두 shared `httpUrl`, 거부 테스트 8종, 열기는 메인에서 `^https?://`만, 새 창도 http(s)만 OS 브라우저로, 프로필 선택은 찾은 이름 중에서만
  - ④ SSRF: `metadata.test` 82개 통과(인터넷 필요 11개 포함, DB 안 씀)
    - DNS 4.8초 메모 재현(임시 테스트, 커밋 안 함): 가짜 DNS 5초 지연에도 3,006ms에 끊김 → 3초 제한은 가져오기 전체에 걸림. 이 PC는 점 없는 호스트(`example`) DNS 자체가 약 2.7초, 함수는 2.7초에 끝. 나머지는 인증·속도 제한·개발 서버 시간으로 봄 → 03-api 문구 정리
    - 운영 API에 막혀야 할 주소 5개 각 1번(앱 IPC, 쓰기는 rate_limits 카운터만): `http://127.0.0.1/` 400 INVALID_URL(내부 주소) · `http://169.254.169.254/latest/meta-data/` 400 INVALID_URL(내부 주소) · `http://localhost:3000/api/v1/health` 400 INVALID_URL(포트) · `https://example.com:8443/` 400 INVALID_URL(포트) · `http://127.0.0.1.nip.io/` **422 METADATA_FETCH_FAILED**(일반 문구, 207ms)
    - nip.io 422: 로컬에서는 OS DNS·공개 DNS 모두 127.0.0.1 → 400 INVALID_URL. 코드상 답 중 하나라도 공인 IP가 아니면 접속 전에 거절하므로 내부로 접속한 것은 아님. 운영에서 DNS 조회가 실패한 것으로 보이나 원인 미확인(가져오기 오류를 로그에 남기지 않음)
  - ⑤ 타인 데이터
    - 1단계: 9개 라우트 모두 `withAuth`(health 제외), lib 함수는 모두 `withUserDb`. JWT는 ES256만·issuer·audience·role=authenticated·sub UUID. RLS SQL(`sec-rls.sql`, 읽기 전용, 사람 실행): public 6개 테이블 모두 RLS 켜짐(rls_forced는 false — 소유자 연결은 우회하지만 API는 `withUserDb`로 `authenticated` 역할로 바꿔 쿼리한다). api_tokens·bookmarks·groups·profiles·visit_logs는 SELECT·INSERT·UPDATE·DELETE 정책 4개씩, 모두 `authenticated`·본인 행(`user_id`/`id = auth.uid()`). rate_limits는 정책 0(02-db 설계대로 함수로만)
    - (가) 실제 DB 테스트 중 타인 항목 7개만(`-t "남의|다른 사용자|RLS|내 것만"`): 7개 통과. 실행 전후 읽기 전용 개수 같음(사용자 2·가짜 0·북마크 111·토큰 0). 정리 SQL은 `.local/manual-check/sec-fake-users-cleanup.sql`에 준비만
    - (가)는 JWT 검증을 건너뛰고 AuthContext를 직접 만들어 lib를 부른다(그 아래 withUserDb·RLS·user_id 조건은 운영 DB 그대로). 가짜 사용자는 실제로 커밋되고 afterAll에서 지워서, 실패하면 남을 수 있다 → JWT는 가짜 JWKS 단위 테스트로 채우기로(사람 결정), (나) 두 번째 계정은 안 함
  - ① Electron(코드 읽기 + CDP, out/ 운영 빌드를 패키지 없이 실행, 개발 폴더 로그인으로 앱 시작 자동 동기화 1회)
    - 끌어 놓기: CDP 끌기 흉내가 페이지에 drop 이벤트를 전달하지 못해(대조 리스너 0건) **판단 불가**
    - 창 이동: `location.href`를 미끼 서버로 바꾸자 그 페이지에서 `window.baro`(함수 32개, createToken 포함)가 그대로 있음 → will-navigate 거부·IPC 보낸 쪽 확인이 없음을 확인(그 페이지에서 함수는 부르지 않음)
  - 수정 결정(사람): 1 창 이동 거부 + IPC senderFrame 확인, 2 권한 요청 거부, 3 03-api 문구, 4 JWT 단위 테스트, 6 `/metadata` 422 오류 종류 로그(주소·도메인·사용자 id 없이). 5(실패 시 가짜 사용자 남음)는 PROGRESS v1.1 '개발용 DB 분리'와 묶음. 수정은 문서 먼저
  - [x] 문서: CLAUDE.md 'Electron 보안' 3줄(앱 주소만 열기·IPC senderFrame·권한 거절, 클립보드 쓰기만 예외), 03-api `/metadata`(3초는 외부 페이지 가져오기만·422 오류 종류 로그), PROGRESS v1.1 개발용 DB 분리
  - [x] 코드: `main/app-origin.ts`(앱 주소 검사·IPC 감싸기·권한 판단, 테스트 10개) → `index.ts`에서 will-navigate·will-redirect 거부, IPC 30개 모두 `handle()` 하나로 등록(직접 `ipcMain.handle`은 그 안 1곳), 권한 요청·확인 처리기. API `classifyFetchFailure` + 422 때 `[metadata] 가져오기 실패: <종류>` 한 줄(테스트 13개, 주소 안 들어감·400은 로그 없음), `lib/auth.test.ts` 17개(가짜 JWKS, DB 없음: 올바른 토큰·거절 10종·헤더 없음·확장 토큰 DB 전 401·JWKS 장애 500·429). desktop 285·API(DB 없는 것) 135 통과, typecheck 둘 다 통과
  - [x] 재확인 (새 `out/`를 패키지 없이 CDP로, 앱 시작 자동 동기화 1회·`/metadata` 1건 외 쓰기 없음, 끝난 뒤 읽기 전용 개수 그대로: 사용자 2·가짜 0·북마크 111·토큰 0)
    - 정상 화면 홈 111. 앱 페이지에서 IPC 25개 모두 처리기까지 감(읽기는 정상 값, 쓰기 채널은 요청 전에 거절되는 입력만 보내 INVALID_ID·INVALID_INPUT). 안 부른 5개(login·logout·sync:now·pickFile·menu)는 브라우저·쓰기·대화 상자라 뺌, 같은 `handle()`로 등록
    - `location.href` → 미끼 주소·다른 로컬 파일(win.ini) 모두 막힘(창 그대로, 미끼 요청 0)
    - CDP로 창을 미끼 페이지로 강제로 옮긴 뒤(will-navigate를 지나지 않는 이동) 그 페이지의 IPC 4개(createToken 포함) 모두 '허용하지 않는 페이지에서 온 요청입니다'로 거절, 앱 페이지로 돌아오면 정상
    - 권한: 클립보드 쓰기 ok, 알림 denied, 카메라 NotAllowedError, 위치 거절
    - 개발 실행(`pnpm dev:desktop`, localhost:5173, API 끔): IPC 정상, 미끼 이동 막힘. 끌어 놓기(사람): 크롬 링크·파일을 창에 놓아도 화면 그대로, 뒤에 창 주소 localhost:5173 그대로·IPC 정상(Claude)
  - [x] 배포 뒤 `/metadata` 오류 종류 로그 확인 (2026-10-01, `b8d742d` Vercel 배포 success·CI success 뒤)
    - 첫 시도(18:06 KST)는 운영에 닿지 않음: 앞서 `pnpm dev:desktop`이 `out/main`을 개발 빌드(localhost:3000)로 덮어써 4ms에 NETWORK. `out/`를 운영 빌드로 다시 만든 뒤 18:07:44 KST에 1건 → 422. 이 로그는 Hobby 요금제 보관 시간이 지나 대시보드에서 보이지 않음(사람). 이 함정은 `.local/manual-check/README.md` '주의'에 한 줄
    - 다시 1건(운영 주소 확인·앱 health ok 뒤): 20:38:01.763 KST `http://127.0.0.1.nip.io/` → 422 METADATA_FETCH_FAILED(앱에서 560ms). Vercel 로그(사람): `Oct 01 20:38:02.35 GET 422 /api/v1/metadata` · `[metadata] 가져오기 실패: 기타(TypeError)`
    - 붙여 준 로그 줄에는 주소·도메인·사용자 id가 없다. 사람 메모는 "줄 안에 주소·사용자 id는 (있었다)" → 우리가 남긴 줄이 아니라 Vercel 요청 기록(호스트·경로, 상세의 쿼리 문자열 `?url=`)을 가리킨 것인지 **확인 필요**
    - 남은 것: 종류가 '기타(TypeError)'라 원인(DNS·연결 등)을 아직 모른다. 분류기가 못 본 곳 후보: undici가 감싼 오류의 `cause`가 code 없는 오류이거나 `AggregateError`(IPv4·IPv6 둘 다 실패)의 `errors` 안에 code가 있는 경우. 코드상 내부 주소면 접속 전에 400으로 거절하므로 내부 접속은 아님
    - 쓰기: 운영 요청 실행마다 앱 시작 자동 동기화 1회(18:07·20:38 두 번, 18:06은 실패라 쓰기 없음)와 `rate_limits` 카운터 1건씩
- [x] 성능 확인 (2026-10-01, 측정 끝. 기준 초과 1건은 v1.1, 수정은 회귀로 보류)
  - 방법: `pnpm dev:desktop`(API 끔 → 앱 시작 동기화·목록 불러오기 모두 NETWORK, DB 요청 없음)에 CDP로 `/src/lib/queries.ts`의 `queryClient.setQueryData`로 가짜 북마크 N개 캐시. Google 파비콘 주소는 CDP로 막아 글자 타일. 창 1100×720 앞에 둠. 항목마다 5번(D·E는 4종·3종 × 5), 중앙값. 시간 = 동작 → 화면 변경이 멈추고 다음 그리기까지(MutationObserver + rAF)
  - **개발 빌드(React 개발 모드) 숫자라 운영보다 느린 상한**. 여유 메모리 시작 2.9GB, 측정 중 최저 2.31GB(기준 2GB 위). 처음 시도는 1.6~2.0GB라 시작 전 멈춤 → 사람이 메모리 정리
  - 결과(ms, 중앙값. 기준: B 100, C·D·E 200, A 1,000, F 약 50fps. 판정은 1,000개)

    | 크기 | A 첫 표시 | B 1글자 | B 3글자째 | B 결과 없음 | C 지우기 | D 정렬 | E 보기 | F 스크롤 | 타일·DOM·힙 |
    | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
    | 111 | 68 | 20 | 10 | 9 | 74 | 17 | 18 (최대 52) | 60fps, 25ms 넘는 프레임 0 | 111·528·11MB |
    | 500 | 252 | 50 | 20 | 11 | 254 | 57 | 55 (최대 209) | 60fps, 0 | 500·2,084·15MB |
    | 1,000 | 403 | 63 (최대 97) | 13 | 12 | **386 ✗** | 109 (최대 129) | 104 (최대 300) | 60fps, 0 | 1,000·4,084·26MB |

  - 1,000개에서 기준 넘음: **C 지우기 386ms**(기준 200). E는 중앙값 104로 기준 안이지만 최대 300(고정됨 → 전체처럼 1,000개를 다시 만드는 전환으로 보임). A·D는 크기에 거의 비례해 늘고, B는 결과가 적은 입력이라 거의 늘지 않음
  - C 원인(1,000개, 기록 3번, 기록 부담으로 448~466ms): JS 303~330ms(약 70%), 스타일 계산 51~57, 레이아웃 58~67(그중 43~59는 JS 안에서 강제된 것), 그리기·합성 25~32. CPU 프로파일(자기 시간): React 개발 런타임 `jsxDEV` 85ms·react-dom 94ms(개발 모드 검사 포함), `use-grid-layout.ts` 58ms(레이아웃을 읽어 강제 레이아웃을 만드는 곳으로 보임), `tile.ts firstLetter` 25ms, GC 30ms → **대부분 React 렌더(JS)**, 다음이 그리드 크기 계산의 강제 레이아웃, 타일마다 첫 글자 계산
  - 정리: 가짜 캐시 비움(`removeQueries`), 앱은 창 닫기, localStorage는 사이드바 접힘 값 하나뿐(건드리지 않음), `out/` 운영 빌드로 다시 만듦(주소 vercel 하나). 실제 DB 읽기 전용 확인: 가짜 id·가짜 주소 0, 고정 0·manual 0·토큰 0·정렬 created_desc·자동 동기화 true. **북마크는 112** — 20:15:51 KST에 `app_sync`로 생긴 크롬 북마크 1개(landscape.cncf.io). Claude 실행(18:06·18:07·20:38 KST)이 아니며, 20:38 실행의 앱 시작 동기화가 그 행을 갱신만 함 → 사람 확인 필요
  - 북마크 112: 늘어난 1개는 "CNCF Landscape"(`app_sync`, 크롬 id 있음, 2026-10-01 20:15:51 KST 추가). 사람이 크롬에서 직접 추가한 것으로 확인(2026-10-02) → **기준값 북마크 112**
  - [x] C 고침 1차 (사람 결정: (나)+(다), (라) 운영 빌드 측정은 안 함)
    - (나) `use-grid-layout.ts`: 그리드가 나타날 때 `clientWidth`를 읽지 않고 ResizeObserver 콜백에서만 폭을 읽음. 다시 나타날 때는 마지막으로 잰 배치로 시작하고, 콜백 결과는 `flushSync`로 그리기 전에 반영(잘못된 열 수가 보이지 않게)
    - (다) `tile.ts`: `tileLetter`(Intl.Segmenter)·`tileColor`(new URL) 결과를 입력별로 기억(최대 1만, 넘치면 비움). 타일이 새로 만들어질 때 다시 계산하지 않음. 테스트 2개(반복·키 경계·넘친 뒤) → desktop 287 통과, typecheck 통과
    - 같은 조건으로 1,000개 다시(개발 모드, 여유 메모리 최저 2.39GB)

      | 1,000개 | A 첫 표시 | B 1글자 | B 3글자째 | B 결과 없음 | C 지우기 | D 정렬 | E 보기 | F 스크롤 |
      | --- | --- | --- | --- | --- | --- | --- | --- | --- |
      | 전 | 403 | 63 | 13 | 12 | 386 | 109 | 104 (최대 300) | 60fps |
      | 후 | 331 | 50 | 14 | 12 | **329 ✗** | 108 | 97 (최대 274) | 60fps |

    - C 기록(후): JS 220~239(전 303~330), 스타일 25~36(전 51~57), 레이아웃 38~50(전 58~67), **JS 안 강제 레이아웃 0**(전 43~59), 그리기 28~31. CPU 프로파일에서 `use-grid-layout`·`firstLetter`가 사라짐. 남은 것은 거의 React 렌더(`jsxDEV` 개발 런타임 54ms·react-dom 71ms 등) = 타일 1,000개를 다시 만드는 비용
    - **C가 개발 모드에서 아직 250ms를 넘음 → 멈춤**(사람 결정 기준). 다음: (가) 지우지 않고 숨기기를 할지 사람이 정함
    - 결론(사람 결정): 1,000개 C 지우기는 개발 모드 329ms로 기준(200) 초과. 운영 빌드는 측정 안 함. 검색창 입력은 useDeferredValue로 막히지 않음(입력 반응 B는 1,000개에서도 50ms). 지금 크기(111개, 가짜 데이터·개발 모드)에서는 74ms. 근본 해결(지우지 않고 숨기기)은 v1.1
    - [ ] (나)·(다) 커밋 전 그리드 회귀 확인 (실제 112개, 운영 빌드 `out/`를 패키지 없이 CDP로, 앱 시작 자동 동기화 1회씩 2번)
      - 열 수·아이콘 크기: 창 1100(8열·53px)·668(3열·63px)·420(3열·51px, 사이드바 자동 접힘), 1100 사이드바 접기(10열·52px)·펴기, 700→640(자동 접힘, 5열·55px)→700(4열·51px), 가린 채 900으로 바꾼 뒤 다시 보임(6열·52px) — **10/10 모두 pickLayout과 같음**(설정값·첫 줄 타일 수·아이콘 실제 크기)
      - **회귀: 페이지 오류 이벤트 'ResizeObserver loop completed with undelivered notifications.' 92건**(콘솔 경고·오류는 0). 같은 확인을 고치기 전 코드로(git stash로 두 파일만 되돌려 빌드) 돌리면 10/10 통과·**0건** → 이번 수정의 ResizeObserver 콜백 안 `flushSync`가 원인으로 봄. 커밋하지 않음, 코드는 고친 상태로 작업 트리에 둠
      - (ㄱ) `flushSync`를 빼고 다시(사람 결정): 10/10 pickLayout과 같음, **ResizeObserver loop 0건**, 콘솔 경고 0. 프레임 감시(rAF마다 실제 열 수와 지금 폭의 기대 열 수 비교): 창 크기 변경·사이드바 접기/펴기·자동 접힘·가린 뒤 복구 직후 1~5프레임씩 열 수가 한 박자 늦음, 합계 20/953프레임. **고치기 전 코드도 같은 곳에서 20/931프레임** → 이번 수정이 만든 것이 아니라 원래 동작(ResizeObserver 결과를 보통 setState로 반영해 한 프레임 뒤에 그려짐)
      - 캡처(사이드바 접기, 고치기 전 코드, screencast 13프레임): 사이드바가 줄어드는 애니메이션 동안 8→9→10열로 한 프레임씩 늦게 따라감. 타일이 넘치거나 겹치지는 않음(첫 줄 타일 수 = 설정 열 수, 92/92 프레임)
      - 통과 조건 '열 수가 틀린 채 보이는 순간 없음'은 고치기 전·후 모두 못 맞춤 → 커밋 여부를 사람에게 다시 물음 → **(나)(다) 함께 커밋**(사람 결정 2026-10-02: 오류 0건, 틀린 프레임은 고치기 전과 같아 원래 동작). 한 프레임 늦는 것은 PROGRESS v1.1 후보. 1,000개 C 다시 재기는 개발 앱을 띄운 뒤 여유 메모리 1.92GB로 떨어져 측정 스크립트가 데이터를 넣기 전에 멈춤(규칙대로 중단)
      - **flushSync 제거 뒤 1,000개 C는 재측정 안 함**(사람 결정 2026-10-02). 위 329ms는 flushSync 제거 전 값
  - [x] `sync.test` 5,000개 느려짐 — DB 밖 부분만 측정(임시 테스트, 커밋 안 함, DB 없음, 5번 중앙값): 크롬 파일(602KB) 읽기 1.5ms, 앱 JSON 파싱·평탄화 16ms, 서버 요청 검증(Zod) 15ms, 계획 첫 동기화 16ms·변화 없음 22ms·500개 수정 15ms → **모두 수십 ms. 80초·34초로 느려진 원인은 DB 쪽**(쿼리·연결). v1.1 '개발용 DB 분리' 뒤 확인
  - 정리: 가짜 캐시 비움, 앱 창 닫기, `out/` 운영 빌드(주소 vercel 하나). 실제 DB 읽기 전용: 북마크 112·고정 0·manual 0·가짜 id·주소 0·토큰 0·정렬 created_desc·자동 동기화 true
- [x] 다른 PC 설치 (2026-10-02, 설치·로그인·보기 확인 끝)
  - 사람 결정: (가) 다른 PC에서는 자동 동기화를 끄고 설치·로그인·보기만. autoSync는 계정 설정이라 이 PC에서 먼저 끄고 확인 뒤 다시 켬. Releases는 사람이 웹에서 올림(저장소 공개 확인: 올리면 누구나 받을 수 있음)
  - 문서: README·01-spec에 'v1은 PC 한 대 기준', PROGRESS v1.1에 '여러 PC 동기화(크롬 guid로 짝짓기)'. 이 PC의 크롬 Bookmarks 파일에 항목마다 `guid` 있음(131개)
  - 다른 PC 흉내(임시 테스트, 커밋 안 함, DB·크롬 파일 모두 읽기만, 서버 `planSync`에 그대로 넣음). 현재 서버: 북마크 112(모두 크롬에서 옴, 방문 수 있는 행 0), 그룹 5
    - A 이 PC 파일 그대로: 변경 0(흉내가 서버 계산과 맞음)
    - B 같은 북마크인데 다른 PC가 id를 처음부터 다시 매긴 경우(크롬 동기화로 받은 PC): 추가 27·삭제 27·**수정 85, 그중 85개 모두 주소가 다른 사이트로 바뀜**. 삭제 27/112라 **대량 삭제 확인이 뜨지 않고 조용히 반영**됨. 방문 수가 있었다면 85개 행의 방문 기록이 다른 사이트에 붙었을 것(지금은 방문 수 0이라 실제 피해는 없음)
    - C 북마크가 전혀 다른 PC(30개): 추가 9·수정 21(모두 다른 사이트로)·삭제 91 → 대량 삭제 확인 뜸(91/112)
    - 결론: 다른 PC에서 동기화를 한 번이라도 보내면 이 계정 북마크가 그 PC 것으로 바뀐다. B처럼 확인 창 없이 일어날 수 있어 (가) 방식이 필요
  - 설치 파일 다시 빌드: 여유 메모리 1.76GB(시작 기준 2.5GB 미만)라 시작 안 함 → 사람 결정으로 기준 시작 2GB·중단 1.2GB, 꼭 필요한 검사만
  - [x] 설치 파일 다시 빌드·검사 (2026-10-02, `7f82775` 기준, 시작 여유 메모리 2.75GB·최저 2.10GB, 빌드 한 번에 성공)
    - `apps/desktop/release/baro-0.1.0-setup.exe` 87,218,178바이트, SHA-256 `06b835bd16f23d2717189dfda37221aa5729de01dd4ac9abc39ef1d10bba9eb9`
    - 파일: asar 안 node_modules 0, `.map`·`.env`·`sourceMappingURL` 0, localhost 0, 비밀 패턴·서비스 키·DB 주소 0, API 주소는 운영 하나, package.json name `baro`, Fuses 4개(RunAsNode·NodeOptions·NodeCliInspect 끔, OnlyLoadAppFromAsar 켬)
    - CSP·창 이동 차단: `b8d742d`(보안 수정·재확인) 뒤로 index.html·electron.vite.config·main·preload·electron-builder.yml·build/ 변경 없음, 빌드에 `connect-src 'none'`과 창 이동·IPC·권한 코드 그대로
    - 실행(로그인 파일을 잠시 옮겨 자동 동기화 없이, 끝나고 되돌림): 금지 스위치 4종 모두 0.5~1.6초 안에 종료 코드 1·포트 없음, `ELECTRON_RUN_AS_NODE=1`은 Node로 안 돌고 로그인 화면(표시 파일 없음), 정상 실행 로그인 화면
  - [x] GitHub Releases 공개 (2026-10-02 21:55 KST, 사람이 웹에서): https://github.com/ganshik0701-dev/baro-web-bookmark-/releases/tag/v0.1.0 — 태그 `v0.1.0`은 `7f82775`, Latest. 첨부 `baro-0.1.0-setup.exe` 87,218,178바이트, GitHub가 보여 준 sha256이 로컬 빌드와 전부 같음(API로도 확인). 설명문은 `.local/manual-check/release-notes-v0.1.0.md`(v1은 PC 한 대 기준 단락 포함). README 1단계에 받는 곳 링크(`/releases/latest`)
  - 다른 PC 확인 전 auto_sync를 SQL로 false로 변경(사람이 실행, 2026-10-02, SQL Editor, RETURNING 1행·auto_sync false 확인). 메모리가 부족해 앱으로 바꾸지 않음. 다른 PC 확인 뒤 같은 방법으로 true로 되돌릴 예정
  - 다른 PC에서 할 일((가) 방식): ① **이 PC** 설정에서 '앱을 열 때 자동으로 동기화' 끄기 → ② 다른 PC에서 Releases로 받기·SmartScreen [추가 정보]→[실행]·설치 → ③ 같은 계정 로그인, 첫 동기화 화면 없이 홈 → ④ 전체 112·아이콘·계정 카드 안내 문구·동기화 시각이 안 바뀌었는지 → ⑤ '지금 동기화' 누르지 않기 → ⑥ 북마크 하나 열어 보기(방문 수 1) → ⑦ **이 PC**로 돌아와 자동 동기화 다시 켜기
  - [x] 다른 PC 확인 (사람, 2026-10-02 밤, 사진으로도 확인)
    - 최신 릴리스에서 받기·SmartScreen·원클릭 설치 문제없음, 같은 계정 로그인 뒤 **첫 동기화 화면 없이 홈**
    - 전체 112·고정됨 0·아이콘 정상·계정 카드 안내 문구 있음, 동기화 시각 그대로("23시간 전 동기화")
    - 북마크 클릭 → 그 PC의 브라우저에서 열림. 읽기 전용 확인: visit_logs 0 → 3, 2026-10-02 23:27:34~49 KST에 서로 다른 북마크 3개(각 click_count 1). Claude는 그 시각에 실행한 것이 없음 → 다른 PC 확인 중 클릭한 것
    - 동기화가 돌지 않음을 DB로 확인: last_synced_at 2026-10-02 00:11 KST 그대로, 북마크 112 그대로
  - auto_sync는 확인 뒤 SQL로 true로 되돌림(사람, RETURNING 1행). 읽기 전용 확인: auto_sync true
  - **주의: 다른 PC의 앱은 로그인된 채로 남아 있다.** auto_sync가 다시 true라서, 그 PC에서 앱을 다시 켜면(로그인 복원 = 새 세션) **앱 시작 자동 동기화가 그 PC의 크롬 북마크로 돈다** → 이 계정 북마크가 그 PC 것으로 바뀔 수 있음('v1은 PC 한 대 기준', 위 흉내 B·C). 그 PC에서는 앱을 켜지 않거나, 켜야 하면 먼저 이 PC에서 auto_sync를 끄고, 쓰지 않을 거면 그 PC 앱에서 로그아웃 후 제거 권장
