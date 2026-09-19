# 06. 기능별 프롬프트 모음

각 항목은 **설명**(무엇을 왜 만드는지, 주의할 점)과 **프롬프트**(그대로 복사해 쓰는 문장)로 되어 있다. 위에서부터 순서대로 진행하면 된다.

프롬프트를 쓰기 전에 항상 새 세션이면 `CLAUDE.md`가 읽히는지 확인하고, 한 번에 하나씩만 맡긴다.

모든 작업 프롬프트는 마지막에 PROGRESS.md 갱신을 요구한다. 아래 프롬프트에는 이미 들어 있으니, 새로 만들 때도 이 두 줄을 빼먹지 않는다.

```
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

---

## 1주차

### 1-1. 모노레포와 Electron 창

**설명**
앱(Electron)과 API 서버(Next.js)를 한 저장소에 두고, 타입과 Zod 스키마는 `packages/shared`에서 공유한다. 이번 주 목표는 기능이 아니라 "창이 뜨고 API가 응답한다"까지다. 여기서 Electron 보안 설정(`contextIsolation`, `sandbox`)을 제대로 잡아 두지 않으면 나중에 전부 고쳐야 하므로, 이 부분만큼은 프롬프트에 명시한다.

**프롬프트**
```
CLAUDE.md와 docs/를 먼저 읽고, docs/05-roadmap.md의 1주차 작업을 구현해줘.

만들 것:
- pnpm 워크스페이스 모노레포 (apps/desktop, apps/api, packages/shared)
- apps/desktop: Electron 33 + electron-vite + React 19 + TypeScript
  - src/main/index.ts: 1100x720 창, backgroundColor는 docs/04-design.md의 --bg,
    webPreferences는 nodeIntegration false / contextIsolation true / sandbox true,
    setWindowOpenHandler로 http(s)는 shell.openExternal로 넘기고 나머지는 deny,
    IPC 핸들러 app:version과 shell:openExternal (url이 http/https인지 검증)
  - src/preload/index.ts: contextBridge로 getVersion, openExternal만 노출하고
    BaroApi 타입을 export
  - src/renderer: index.html(CSP 포함), index.css에 docs/04-design.md 색 토큰,
    App.tsx는 앱 버전과 'API 상태 확인' 버튼만 있는 확인용 화면
- apps/api: Next.js 15 App Router, GET /api/v1/health가
  { "data": { "status": "ok", "time": ISO8601, "version": string } } 반환,
  lib/errors.ts에 docs/03-api.md의 에러 코드 표와 ok()/fail() 헬퍼
- packages/shared: SortOption, BookmarkSource, ApiSuccess/ApiFailure 타입
- 루트: package.json 스크립트(dev:desktop, dev:api, typecheck), .gitignore,
  .env.example, README.md, .github/workflows/ci.yml

조건:
- 이번 주 범위는 환경 설정까지다. 인증, DB, 북마크 기능은 만들지 마라.
- Tailwind는 넣지 말고 CSS 변수만 쓴다.
- 주석은 한국어로 쓰고, 나중에 무엇이 여기 붙는지 남겨줘.
- 다 만들면 pnpm typecheck를 통과시키고, 내가 직접 해야 하는 작업
  (GitHub, Vercel, Supabase)을 체크리스트로 알려줘.
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

---

## 2주차 — DB

### 2-1. 마이그레이션과 RLS

**설명**
테이블 5개를 만들고 RLS로 사용자별 데이터를 격리한다. RLS는 나중에 붙이면 기존 쿼리가 전부 막히면서 원인을 찾기 어려워지므로 처음부터 켠다. 마이그레이션 SQL과 Drizzle 스키마 두 벌을 만들게 되는데, 둘이 어긋나면 런타임에야 알게 되니 대조까지 시킨다.

**프롬프트**
```
docs/02-db.md를 읽고 2주차 DB 작업을 해줘.

- supabase/migrations/001_init.sql: 테이블 5개(profiles, groups, bookmarks,
  visit_logs, api_tokens), 문서의 컬럼·제약을 그대로 따른다
- 002_indexes.sql: 문서의 인덱스 10개
- 003_rls.sql: 5개 테이블 RLS 활성화 + 정책 (user_id = auth.uid(),
  profiles는 id = auth.uid())
- 004_functions.sql: on_auth_user_created, set_updated_at 트리거와
  record_visit(bookmark_id) 함수
- packages/db에 Drizzle 스키마를 작성하고, 마이그레이션과 컬럼·타입·기본값이
  일치하는지 표로 대조해줘

조건:
- 문서에 없는 컬럼을 임의로 추가하지 마라. 필요하면 먼저 말해줘.
- 각 SQL 파일 맨 위에 무엇을 하는 파일인지 한국어 주석을 달아줘.
- 마지막에 Supabase SQL 에디터에서 RLS가 동작하는지 확인하는 방법을 알려줘.
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

### 2-2. 동작 확인

**설명**
RLS가 실제로 막는지 눈으로 봐야 안심할 수 있다. 사용자 두 명을 만들어 서로의 데이터가 보이지 않는 것을 확인한다.

**프롬프트**
```
방금 만든 RLS가 제대로 동작하는지 확인하는 SQL을 만들어줘.
사용자 두 명을 가정해 각각 북마크를 넣고, A로 조회하면 B 것이 안 보이는지
확인하는 쿼리와 예상 결과를 알려줘. 확인이 끝나면 지우는 쿼리도 같이.

조건:
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

---

## 3주차 — Google 로그인

### 3-1. 루프백 + PKCE 로그인 (AUTH-01)

**설명**
데스크톱 앱은 웹처럼 리다이렉트 URL을 쓸 수 없어서, 앱이 로컬에 임시 HTTP 서버를 띄우고 `http://127.0.0.1:<포트>/callback`으로 코드를 받는다. 포트를 고정하면 다른 프로그램과 충돌할 수 있으니 매번 임의로 잡는다. 이 주차가 이 프로젝트에서 가장 까다로운 부분이니 한 번에 다 만들지 말고 로그인 → 토큰 저장 → 자동 로그인 순으로 쪼갠다.

**프롬프트**
```
docs/01-spec.md의 AUTH-01을 구현해줘.

- src/main/auth.ts: 임의 포트로 로컬 http 서버를 띄우고,
  Supabase Google OAuth URL을 shell.openExternal로 연다 (PKCE)
- 콜백으로 받은 code를 apps/api의 POST /auth/exchange로 넘겨 세션을 받는다
- apps/api에 /auth/exchange 라우트를 만든다 (docs/03-api.md 참고)
- 로그인 성공 시 브라우저에는 "앱으로 돌아가세요" 안내 HTML을 띄우고
  로컬 서버를 닫는다
- IPC: auth:login, auth:status 를 추가하고 preload에 노출

조건:
- 토큰 저장은 아직 하지 마라. 이번 단계는 로그인 성공까지만이다.
- state 검증과 타임아웃(2분) 처리를 넣어줘.
- 다 되면 내가 Google Cloud Console에서 해야 하는 설정을 순서대로 알려줘.
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

### 3-2. 토큰 저장과 자동 로그인 (AUTH-02, AUTH-03)

**설명**
리프레시 토큰을 평문 파일에 두면 PC를 쓰는 다른 사람이 그대로 가져갈 수 있다. Electron의 `safeStorage`는 Windows DPAPI로 암호화해 주므로 별도 라이브러리 없이 해결된다.

**프롬프트**
```
AUTH-02와 AUTH-03을 구현해줘.

- 리프레시 토큰을 safeStorage로 암호화해 userData 경로에 저장한다
- 앱 시작 시 저장된 토큰이 있으면 POST /auth/refresh로 액세스 토큰을 받아
  자동 로그인한다 (액세스 토큰은 메모리에만)
- 실패하면 토큰을 지우고 로그인 화면으로 보낸다
- AUTH-03 로그아웃: 저장 토큰 삭제 후 로그인 화면

조건:
- safeStorage.isEncryptionAvailable()이 false인 경우 처리도 넣어줘.
- 액세스 토큰이 렌더러 콘솔이나 로그에 찍히지 않게 해줘.
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

### 3-3. 로그인 화면 (SCR-01)

**설명**
시안의 로그인 화면을 만든다. 버튼을 누르면 브라우저가 열린다는 안내가 없으면 사용자가 앱이 멈춘 줄 안다.

**프롬프트**
```
docs/01-spec.md의 SCR-01을 docs/04-design.md 토큰으로 만들어줘.
시안: https://claude.ai/artifact/1Z6ff82mXSqL97Mm8eQD6f

- 로고, 소개 한 줄, 'Google로 계속하기' 버튼, 브라우저가 열린다는 안내
- 버튼을 누르면 로딩 상태로 바뀌고, 실패 시 에러 메시지를 보여준다
- 색·글꼴·간격은 docs/04-design.md를 그대로 쓴다

조건: 그라데이션이나 장식용 카드는 넣지 마라. 시안 그대로.
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

---

## 4주차 — 북마크 API와 확장

### 4-1. 북마크 CRUD (BM-01 ~ BM-05)

**설명**
API의 뼈대다. URL 정규화(`normalized_url`)는 중복 검사의 기준이라 여기서 규칙을 확정해 두고, 이후 동기화와 가져오기에서도 같은 함수를 쓴다.

**프롬프트**
```
docs/01-spec.md의 BM-01~BM-05와 docs/03-api.md의 /bookmarks 명세대로 구현해줘.

- packages/shared에 Zod 스키마(createBookmark, updateBookmark)를 먼저 만든다
- apps/api: GET/POST /bookmarks, GET/PATCH/DELETE /bookmarks/:id
- lib/url.ts에 정규화 함수 (호스트 소문자, 끝 슬래시 제거, utm_* 제거)와
  http/https 검증 함수를 만들고 모든 곳에서 재사용한다
- 중복이면 409 DUPLICATE_URL과 기존 북마크 id를 함께 반환한다

조건:
- 응답·에러 형식은 docs/03-api.md 그대로.
- 모든 쿼리에 user_id 조건을 직접 붙인다.
- 화면은 만들지 마라. curl로 확인하는 명령을 마지막에 알려줘.
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

### 4-2. 메타데이터 추출 (BM-01 보조)

**설명**
URL만 입력해도 제목이 채워지게 하는 기능이다. 서버가 임의의 URL을 대신 열어 주는 구조라서 SSRF 위험이 있다. 사내망 주소를 넣으면 서버가 대신 접근해 주는 꼴이 되므로 사설 IP 차단이 필수다.

**프롬프트**
```
docs/03-api.md의 GET /metadata를 구현해줘.

- cheerio로 <title>, og:title, 파비콘 링크를 추출한다
- SSRF 방지: DNS 해석 후 사설 IP(10.x, 172.16~31.x, 192.168.x, 127.x, 169.254.x)와
  localhost를 차단한다. 리다이렉트 3회 제한, 3초 타임아웃, 응답 1MB 제한
- 실패하면 422 METADATA_FETCH_FAILED, 제목은 도메인으로 대체 가능하게 응답

조건:
- 차단 로직을 왜 이렇게 짰는지 주석으로 설명해줘.
- 사설 IP 차단이 동작하는지 확인하는 테스트를 같이 만들어줘.
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

### 4-3. API 토큰 (EXT-01)

**설명**
확장은 Supabase 세션을 쓸 수 없어서 별도 토큰이 필요하다. 비밀번호와 같은 원리로, 원본은 발급 응답에서 한 번만 보여주고 서버에는 해시만 남긴다.

**프롬프트**
```
docs/03-api.md의 /tokens 3개 엔드포인트를 구현해줘.

- POST: 32바이트 난수에 baro_ 접두사, SHA-256 해시만 DB에 저장,
  원본은 이 응답에서만 반환, prefix 8자리 저장
- GET: prefix와 name, last_used_at만 반환 (해시·원본 절대 반환 금지)
- DELETE: 폐기
- 사용자당 5개 초과 시 409 TOKEN_LIMIT_EXCEEDED
- 요청 인증 미들웨어: Authorization 헤더가 baro_로 시작하면 토큰 인증,
  아니면 Supabase 액세스 토큰으로 처리. last_used_at 갱신

조건: 토큰 원본이 로그에 남지 않게 해줘.
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

### 4-4. 동기화 API (DESK-03, EXT-02~04)

**설명**
앱과 확장이 함께 쓰는 가장 복잡한 엔드포인트다. 중간에 실패하면 북마크가 반쯤 지워진 상태로 남을 수 있어 트랜잭션이 필수다. `full`은 보낸 목록을 기준으로 삭제까지 하지만, 사용자가 바로에서 직접 추가한 북마크는 크롬에 없으므로 지우면 안 된다.

**프롬프트**
```
docs/03-api.md의 POST /sync/chrome을 구현해줘.

- mode: full / partial 두 가지
- folders를 groups에 chrome_folder_id로 매칭해 먼저 반영하고, 그다음 bookmarks
- bookmarks는 chrome_id로 매칭, 없으면 생성, 제목·URL 바뀌면 수정
- full에서 요청에 없는 chrome_id는 삭제하되, source가 manual·html_import인
  북마크는 유지한다
- http/https가 아닌 URL은 skipped로 세고 저장하지 않는다
- 전체를 한 트랜잭션으로 처리하고, 결과 {created, updated, deleted, skipped, syncedAt} 반환
- 북마크 5,000개·본문 2MB 제한

조건:
- 1,000개를 한 번에 보낼 때 쿼리가 1,000번 날아가지 않게 묶어서 처리해줘.
- 왜 그렇게 묶었는지 설명해줘.
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

### 4-5. 크롬 확장 (EXT-01 ~ EXT-04)

**설명**
웹스토어에 올리지 않고 개발자 모드로 설치하는데, 이러면 설치할 때마다 확장 ID가 바뀌어 CORS 허용 목록을 관리할 수 없다. manifest에 `key`를 넣어 ID를 고정한다.

**프롬프트**
```
apps/extension에 크롬 확장을 만들어줘. docs/01-spec.md의 EXT-01~04 참고.

- Manifest V3, 권한은 bookmarks와 storage만
- manifest에 key 필드를 넣어 확장 ID를 고정한다 (생성 방법도 알려줘)
- popup: 토큰 입력·저장(chrome.storage.local), 연결 상태, '전체 동기화' 버튼
- background: onCreated/onChanged/onRemoved/onMoved 이벤트를 받아
  partial 모드로 전송. 짧은 시간에 여러 건이면 1초 모아서 한 번에 보낸다
- 전체 동기화는 chrome.bookmarks.getTree()를 평탄화해 full 모드로 전송
- 요청 실패 시 팝업에 마지막 오류를 보여준다

조건:
- 토큰은 background에서만 쓰고 content script는 만들지 마라.
- 설치 방법(개발자 모드)과 apps/api CORS에 추가할 확장 ID 설정을 알려줘.
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

---

## 5주차 — 파일 동기화

### 5-1. Bookmarks 파일 읽기 (DESK-01, DESK-02)

**설명**
이 프로젝트의 핵심이다. 크롬이 파일을 저장하는 순간에 읽으면 JSON이 깨져 있을 수 있어 재시도가 필요하다. 파일 접근은 메인 프로세스에서만 하고, 렌더러에는 파싱 결과만 넘긴다.

**프롬프트**
```
docs/01-spec.md의 DESK-01, DESK-02를 구현해줘.

- src/main/chrome-file.ts:
  - %LOCALAPPDATA%\Google\Chrome\User Data 아래에서 프로필 폴더를 찾고,
    Local State의 profile.info_cache에서 프로필 표시 이름을 읽는다
  - 지정한 프로필의 Bookmarks(JSON)를 읽어 폴더·북마크 평탄 배열로 변환
  - date_added는 값/1000000 - 11644473600 으로 유닉스 시각 변환
  - JSON 파싱 실패 시 1초 뒤 1회 재시도
  - 파일이 없으면 명확한 에러를 던진다 (사용자가 직접 선택하도록)
- IPC + preload: listChromeProfiles(), readChromeBookmarks(profile)
- 파일 선택 대화상자(dialog.showOpenDialog)로 직접 고르는 경로도 만든다

조건:
- 파일은 절대 쓰지 마라. 읽기만 한다.
- 샘플 Bookmarks JSON으로 파싱 단위 테스트를 만들어줘.
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

### 5-2. 첫 동기화 화면 (SCR-02, DESK-03)

**설명**
읽은 결과를 `/sync/chrome`으로 보내고 진행 상황을 보여준다. 로그인 직후 한 번, 그 뒤로는 앱 시작 시 자동으로 돈다.

**프롬프트**
```
SCR-02와 DESK-03을 구현해줘. 시안 참고.

- 찾은 프로필 목록과 북마크 개수를 보여주고 선택 → '가져오기'
- 진행률 표시, 완료 후 결과(추가/수정/삭제/건너뜀) 요약
- 성공하면 profiles.last_synced_at, chrome_profile 저장 후 메인 그리드로
- 앱 시작 시 auto_sync가 켜져 있으면 백그라운드로 1회 실행하고
  상단에 조용히 결과만 표시
- HTML 파일로 가져오기 링크는 자리만 두고 비활성 (IO-01은 v1.1)

조건:
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

---

## 6주차 — 그리드 화면

### 6-1. 아이콘 그리드 (SCR-03, OPEN-01~03)

**설명**
사용자가 실제로 보는 화면이다. 파비콘은 못 가져오는 사이트가 꽤 있어서 글자 타일 대체가 필수다. 클릭했을 때 브라우저가 먼저 뜨고 기록은 뒤에서 보내야 느리게 느껴지지 않는다.

**프롬프트**
```
SCR-03을 docs/04-design.md 토큰으로 만들어줘. 시안 참고.

- BookmarkGrid: 창 너비에 따라 6/8/10열, 아이콘 62px, 라벨 한 줄 말줄임
- BookmarkIcon: 파비콘 로드 실패 시 제목 첫 글자 + 도메인 해시 색 타일
- 고정된 북마크를 위 섹션에, 나머지를 아래에
- 클릭: window.baro.openExternal(url)을 먼저 호출하고,
  그 뒤에 POST /bookmarks/:id/visit을 보낸다 (실패해도 무시)
- 우클릭 메뉴: 수정·삭제·고정
- TanStack Query로 목록을 캐시하고, 삭제·고정은 낙관적 업데이트

조건:
- Tailwind를 이번에 도입한다면 index.css의 CSS 변수를 테마 토큰으로 옮겨줘.
- 버튼은 실제 <button>을 쓰고 아이콘 전용 버튼엔 aria-label을 넣는다.
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

### 6-2. 추가·수정 모달 (SCR-04)

**프롬프트**
```
SCR-04 북마크 추가·수정 모달을 만들어줘.

- URL 입력 후 포커스가 빠지면 GET /metadata로 제목·아이콘 미리보기 자동 채움
- 제목·그룹·태그 입력, 수정 모드면 기존 값 로딩
- 중복(409) 응답이면 "이미 있는 주소입니다. 그래도 추가할까요?" 확인 후 재전송
- 검증은 packages/shared의 Zod 스키마를 프론트에서도 재사용
- Esc로 닫기, 저장 중에는 버튼 비활성

조건:
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

---

## 7주차 — 검색과 정렬

### 7-1. 검색과 정렬 (SEARCH-01, 04, 05)

**설명**
검색은 서버를 거치지 않고 클라이언트에서 필터링한다. 북마크 수가 수천 개 수준이라 그게 훨씬 빠르다. 정렬 중 '자주 방문순'만 서버의 30일 집계가 필요하다.

**프롬프트**
```
SEARCH-01, SEARCH-04, SEARCH-05를 구현해줘.

- 검색: 제목·URL·태그 부분 일치, 대소문자 무시, 입력 즉시 클라이언트 필터링
- 정렬 드롭다운 5종. visits_30d는 서버에서 docs/02-db.md의 30일 집계 쿼리 사용
- 선택한 정렬을 PATCH /me로 저장하고 다음 실행 때 복원
- 고정된 북마크는 어떤 정렬에서도 맨 앞
- 목록 500개 초과 시 가상 스크롤 적용

조건:
- 30일 집계 쿼리의 실행 계획을 확인해 인덱스를 타는지 알려줘.
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

### 7-2. 오프라인 처리 (DESK-04)

**프롬프트**
```
DESK-04를 구현해줘.
- 목록을 받을 때마다 electron-store에 캐시한다
- API 호출이 실패하면 캐시를 보여주고 상단에 오프라인 배지를 띄운다
- 오프라인일 때 추가·수정·삭제 버튼은 비활성, 열기는 계속 동작
- 연결이 돌아오면 자동으로 다시 불러온다

조건:
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

---

## 8주차 — 마무리

### 8-1. 설치 파일

**프롬프트**
```
electron-builder로 Windows 설치 파일을 만들어줘.
- NSIS, 설치 경로 변경 가능, 앱 아이콘 포함 (아이콘 만드는 방법도 알려줘)
- 빌드 결과물에 .env 값이 포함되지 않는지 확인해줘
- GitHub Releases에 올리는 방법과, 서명이 없어서 뜨는 SmartScreen 경고를
  받는 사람에게 안내할 문구를 알려줘

조건:
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

### 8-2. 보안 점검

**설명**
혼자 만든 코드라 놓친 구멍이 있을 수 있다. 문서의 보안 요구사항을 기준으로 스스로 점검하게 한다.

**프롬프트**
```
CLAUDE.md의 보안 항목과 docs/02-db.md의 RLS를 기준으로 코드 전체를 점검해줘.
- 타인의 user_id 데이터에 접근 가능한 경로가 있는지
- /metadata의 SSRF 차단이 실제로 동작하는지
- javascript:, data: URL이 어디선가 저장·실행될 수 있는지
- 토큰이 로그·렌더러·빌드 결과물에 노출되는지
- Electron 보안 설정이 유지되고 있는지

고칠 곳을 심각도 순으로 정리해주고, 내가 확인할 수 있게 재현 방법도 알려줘.
고치는 건 내 확인을 받고 하나씩 하자.

조건:
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

### 8-3. E2E 테스트

**프롬프트**
```
Playwright로 E2E 테스트를 만들어줘.
시나리오: 로그인된 상태 가정 → 동기화 → 검색 → 북마크 클릭 → 방문 기록 증가
openExternal은 모킹해서 실제 브라우저가 뜨지 않게 해줘.

조건:
- 끝나면 PROGRESS.md에서 이번 작업에 해당하는 체크박스를 [x]로 바꾸고,
  맨 위 '마지막 갱신' 날짜를 오늘로 고친다. 끝내지 못한 항목은 그대로 두고 이유를 알려줘.
```

---

## 언제든 쓰는 프롬프트

### 코드 이해하기

**설명**
이 프로젝트의 목적은 완성이 아니라 학습이다. 커밋 전에 반드시 한 번은 물어본다.

```
방금 만든 <파일명>의 <함수/부분>이 왜 이렇게 동작하는지 설명해줘.
비슷한 걸 다른 방식으로도 짤 수 있었다면 왜 이걸 골랐는지도 알려줘.
```

### 리뷰 받기

```
내가 방금 <파일>을 이렇게 고쳤어. docs/의 명세와 어긋나는 부분이 있는지,
더 단순하게 쓸 수 있는 부분이 있는지 봐줘. 코드를 고치지는 말고 지적만 해줘.
```

### 막혔을 때

```
<명령>을 실행하니 이런 오류가 나:
<오류 전문>
원인으로 의심되는 것 두세 개를 가능성 순으로 말해주고,
각각을 어떻게 확인하는지 알려줘. 바로 고치지 말고 확인부터 하자.
```

### 문서 갱신

**설명**
명세를 바꿔야 할 일이 생기면 코드보다 문서를 먼저 고친다. 문서가 뒤처지면 다음 세션에서 옛 명세대로 만들어 버린다.

```
<결정 사항>으로 바꾸기로 했어. docs/ 에서 영향받는 부분을 찾아
수정안을 보여줘. 내가 확인하면 그때 코드를 고치자.
```

### 주차 마무리

```
이번 주에 한 작업을 정리해줘.
- 구현한 기능 ID와 파일
- docs/05-roadmap.md에서 체크할 항목
- 다음 주에 시작할 때 알아야 할 것 세 줄
README나 별도 메모에 남길 형태로 써줘.
```
