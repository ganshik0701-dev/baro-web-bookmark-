# 03. API 명세

Next.js Route Handler, 기본 경로 `/api/v1`, JSON.

## 공통 규칙

- 인증: 앱은 `Authorization: Bearer <Supabase 액세스 토큰>`, 확장은 `Authorization: Bearer baro_<API 토큰>`. 서버는 접두사로 구분한다
  - 액세스 토큰은 서버가 직접 서명을 검증한다: 프로젝트 JWKS(`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`), 알고리즘 `ES256`, `iss` = `<SUPABASE_URL>/auth/v1`, `aud` = `authenticated`, `role` = `authenticated`, `sub` = uuid. Supabase에 요청마다 묻지 않는다(로그아웃한 토큰도 만료 전까지는 통과한다. 액세스 토큰 수명 1시간)
  - 헤더가 없으면 `401 UNAUTHORIZED`, 서명·만료·발급자·대상이 틀리면 `401 INVALID_TOKEN`
  - 확장 토큰(`baro_`)은 **받겠다고 표시한 엔드포인트에서만** 통한다(기본은 앱 토큰만). 지금은 `GET /me`, `POST /sync/chrome`. 다른 엔드포인트에 보내면 `401 INVALID_TOKEN`
  - 확장 토큰 검증: 형식(`baro_` + base64url 43자)이 틀리면 DB를 보지 않고 401. 맞으면 SHA-256 해시로 사용자를 찾는다(docs/02-db.md `private.resolve_api_token`). 없거나 폐기된 토큰은 같은 `401 INVALID_TOKEN`(어느 쪽인지 알려 주지 않는다). 폐기는 바로 적용된다(캐시 없음)
- DB 접근: 요청마다 트랜잭션을 열고 `SET LOCAL ROLE authenticated` + `request.jwt.claims`(검증한 토큰의 claims)를 넣은 뒤 쿼리한다. RLS가 API 경로에서도 적용되고, 쿼리에는 `user_id` 조건도 직접 붙인다(docs/02-db.md). 서비스 키는 쓰지 않는다
- 성공: `{ "data": ... }`, 목록은 `{ "data": [...], "meta": { "total": 120 } }`
- 실패: `{ "error": { "code": "BOOKMARK_NOT_FOUND", "message": "북마크를 찾을 수 없습니다" } }`
- 시간: ISO 8601 UTC
- 응답 필드는 camelCase, DB는 snake_case
- CORS: 서버는 CORS 허용 헤더를 보내지 않는다(어떤 웹 페이지도 응답을 읽을 수 없다). 앱은 메인 프로세스(Node)에서 요청하므로 Origin이 없어 CORS와 무관하다. 확장은 서비스 워커에서만 요청하고, MV3 서비스 워커는 `host_permissions`에 있는 주소로는 CORS 없이 요청할 수 있어 허용 목록이 필요 없다(확장 ID는 manifest `key`로 고정해 둔다). 렌더러·팝업·웹 페이지에서 직접 호출하면 CORS에 막힌다. 인증은 토큰으로만 한다
- 속도 제한: 사용자당 분당 120회, `/metadata` 20회, `/sync/chrome` 10회 (상세는 아래 '속도 제한')

## 속도 제한

**기준은 사용자**다. 앱 토큰과 확장 토큰은 같은 사용자면 **한 카운터를 나눠 쓴다**(둘을 합쳐 위 한도).

| 버킷 | 한도(분당) | 대상 |
| --- | --- | --- |
| `global` | 120 | 인증을 통과한 모든 요청 |
| `metadata` | 20 | `GET /metadata` |
| `sync` | 10 | `POST /sync/chrome` |

- 한 요청은 `global`과 해당 버킷을 **함께** 올린다. 둘 중 하나라도 한도를 넘으면 `429 RATE_LIMITED`
- **고정 윈도**: 분 단위로 끊는다(`date_trunc('minute', now())`). 경계에서 최대 2배까지 통과할 수 있는 것은 감수한다(슬라이딩 윈도는 복잡도가 몇 배다)
- 인증에 실패한 요청(401)은 세지 않는다. 누구인지 모르면 셀 수가 없다
- **요청이 실패해도 센다.** 라우트 트랜잭션 밖에서 세므로 500·409로 끝나도 카운트가 롤백되지 않는다(일부러 오류를 내서 한도를 피할 수 없게)
- 429 응답에는 `retry-after` 헤더(윈도가 끝날 때까지 남은 초)를 붙인다
- 세는 곳은 `private.hit_rate_limit()` 하나(docs/02-db.md). 왕복 1회로 두 버킷을 함께 올린다

## 엔드포인트

| 메서드 | 경로 | 설명 | 호출 | 기능 |
| --- | --- | --- | --- | --- |
| GET | /me | 프로필·설정 조회 | 앱·확장 | SET, EXT-P 연결 상태 |
| PATCH | /me | 설정 변경 | 앱 | SET, SEARCH-05 |
| DELETE | /me | 회원 탈퇴 | 앱 | AUTH-04 |
| GET | /bookmarks | 목록(정렬·그룹·태그) | 앱 | SEARCH-04 |
| POST | /bookmarks | 추가 | 앱·확장 | BM-01~03, EXT-05 |
| GET | /bookmarks/:id | 단건 | 앱 | BM-04 |
| PATCH | /bookmarks/:id | 수정(고정 포함) | 앱 | BM-04, BM-07 |
| DELETE | /bookmarks/:id | 삭제 | 앱 | BM-05 |
| POST | /bookmarks/:id/visit | 방문 기록 | 앱 | OPEN-02 |
| PATCH | /bookmarks/reorder | 순서 저장 | 앱 | SEARCH-06 |
| POST | /bookmarks/bulk | 다중 삭제·이동 | 앱 | BM-06 |
| GET | /metadata?url= | 제목·파비콘 추출 | 앱 | BM-01 |
| GET | /groups | 목록(북마크 수 포함) | 앱 | GROUP-01 |
| POST | /groups | 생성 | 앱 | GROUP-01 |
| PATCH | /groups/:id | 이름·순서 | 앱 | GROUP-01,03 |
| DELETE | /groups/:id | 삭제 | 앱 | GROUP-01 |
| GET | /tokens | 토큰 목록(prefix만) | 앱 | EXT-01 |
| POST | /tokens | 토큰 발급 | 앱 | EXT-01 |
| DELETE | /tokens/:id | 토큰 폐기 | 앱 | EXT-01 |
| POST | /sync/chrome | 트리 동기화 | 앱·확장 | DESK-03, EXT-02~04 |
| POST | /import/chrome | HTML 가져오기 | 앱 | IO-01 |

로그인은 앱이 시스템 브라우저로 Supabase OAuth URL을 열고(PKCE), 루프백 서버가 `code`를 받는다.
코드 교환과 토큰 갱신은 **앱 메인 프로세스가 Supabase Auth와 직접** 한다(`POST /auth/v1/token?grant_type=pkce`, `grant_type=refresh_token`).
PKCE의 `code_verifier`는 만든 쪽이 써야 하고 앱 밖으로 나가면 안 되므로, 이 API에는 인증 교환·갱신 엔드포인트를 두지 않는다.
루프백 콜백에 별도 `state`는 붙이지 않는다. 끼워 넣은 code는 앱의 `code_verifier`와 맞지 않아 교환에서 실패하므로 PKCE가 CSRF 방어를 맡는다.
이 API는 교환이 끝난 액세스 토큰을 `Authorization: Bearer`로 받아 검증만 한다. **DB 접근은 예외 없이 이 API를 지난다.**

## GET /me

내 프로필·설정. 인증·DB 권한 전환이 함께 동작하는지 확인하는 첫 엔드포인트이기도 하다.

```json
{ "data": {
  "id": "u1...", "email": "a@example.com", "displayName": "홍길동", "avatarUrl": "https://...",
  "sortOption": "created_desc", "openMode": "new_tab", "theme": "system",
  "autoSync": true, "chromeProfile": null, "lastSyncedAt": null
} }
```
profiles 행이 없으면(가입 트리거가 실패한 경우 등) `401 INVALID_TOKEN`을 돌려준다. 서명은 맞지만 이 서비스의 사용자로 등록되지 않은 토큰으로 본다.

## GET /bookmarks

쿼리: `sort`(created_desc 기본 / visits_30d / visited_desc / title_asc / custom), `groupId`(uuid 또는 `none`), `tag`.
검색어 필터는 클라이언트에서 하므로 한 번에 전체를 받는다. 고정된 북마크가 항상 앞에 온다.
4주차(BM-01~05)에는 `created_desc`만, 쿼리 없이 구현한다. 정렬 5종·필터는 SEARCH-04에서 붙인다.

```json
{
  "data": [{
    "id": "b1c2...", "title": "GitHub", "url": "https://github.com",
    "iconUrl": null, "groupId": "g1...", "tags": ["개발"],
    "isPinned": true, "position": 1.0,
    "clickCount": 42, "recentVisits": 7,
    "lastVisitedAt": "2026-09-16T12:30:00Z",
    "createdAt": "2026-08-01T03:00:00Z"
  }],
  "meta": { "total": 1 }
}
```

## POST /bookmarks

| 필드 | 타입 | 필수 | 규칙 |
| --- | --- | --- | --- |
| url | string | 예 | http/https, 2048자 |
| title | string | 아니요 | 100자, 없거나 비어 있으면 도메인 |
| groupId | uuid | 아니요 | 본인 그룹 |
| tags | string[] | 아니요 | 10개, 각 20자 |
| iconUrl | string | 아니요 | https |

`201 Created` + 생성된 북마크.
- 제목이 없으면 도메인(`github.com`)을 제목으로 쓴다. 서버는 페이지를 가져오지 않는다. 제목 자동 채움은 앱이 저장 전에 `/metadata`로 한다
- 같은 사용자에게 정규화 URL이 같은 북마크가 있으면 `409 DUPLICATE_URL`, `details: { "existingId": "b1..." }`. 중복 저장은 허용하지 않는다(DB 제약 `uq_bm_user_url`). 앱은 "기존 북마크 열기/수정 또는 취소"를 고르게 한다
- `groupId`가 내 그룹이 아니면 `404 GROUP_NOT_FOUND` (FK 검사는 RLS를 받지 않으므로 코드에서 확인한다)

## PATCH /bookmarks/:id

POST와 같은 필드(모두 선택, 최소 1개) + `isPinned`. `200 OK` + 수정된 북마크. URL을 바꿔 다른 북마크와 겹치면 `409 DUPLICATE_URL`.

## GET /bookmarks/:id, DELETE /bookmarks/:id

GET은 `200 OK` + 북마크. DELETE는 `204 No Content`(방문 기록은 FK cascade로 함께 삭제). 삭제 5초 되돌리기(BM-05)는 앱이 5초 기다렸다가 DELETE를 보내는 방식이라 서버는 바로 지운다.

`:id`가 없거나, 남의 북마크이거나, uuid 형식이 아니면 모두 `404 BOOKMARK_NOT_FOUND`. 403을 쓰지 않는 이유: 남의 북마크가 **있다는 사실**도 알려 주지 않기 위해서다(RLS로도 안 보인다). PATCH도 같다.

## POST /bookmarks/:id/visit

바디 없음. `record_visit` 호출 후 `204 No Content`.

## PATCH /bookmarks/reorder

```json
{ "id": "b3...", "prevId": "b1...", "nextId": "b2..." }
→ { "data": { "id": "b3...", "position": 1.5 } }
```
맨 앞이면 prevId, 맨 뒤면 nextId를 null로.

## POST /bookmarks/bulk

```json
{ "action": "delete" | "move", "ids": ["b1...", "b2..."], "groupId": "g1..." }
→ { "data": { "affected": 2 } }
```
ids 최대 200개.

## GET /metadata?url=

앱이 북마크를 저장하기 전에 제목·아이콘을 미리 채우려고 부른다. 서버가 사용자 대신 임의의 주소를 여는 구조라 SSRF 차단이 핵심이다. DB는 쓰지 않는다.

```json
{ "data": { "title": "GitHub", "iconUrl": "https://www.google.com/s2/favicons?domain=github.com&sz=64" } }
```

- `url`: POST /bookmarks와 같은 규칙(`httpUrl`: 스킴 없으면 https://, http/https만)
- `title`: `og:title` → `<title>` 순. 공백을 한 칸으로 줄이고 100자까지 자른다. 둘 다 없으면 `null`(앱은 제목을 비워 저장하고, 서버가 도메인을 쓴다)
- `iconUrl`: rel에 `icon`이 들어간 `<link>`를 차례로 보며(`apple-touch-icon`은 제외) 최종 주소(또는 `<base href>`) 기준으로 풀어 **https인 첫 주소**를 쓴다. 없으면 Google 파비콘 주소(`?domain=<최종 호스트>&sz=64`). 서버는 아이콘을 받아 보지 않는다
- 가져오기 제한: 전체 3초, 본문 1MB까지만 읽고 나머지는 버린다(제목은 앞부분에 있다), `Content-Type`이 `text/html`일 때만 파싱, 리다이렉트는 서버가 직접 따라가며 최대 3회
- 문자 인코딩: `Content-Type`의 charset → `<meta charset>`/`http-equiv` → UTF-8 순. EUC-KR 사이트도 제목이 깨지지 않는다

SSRF 차단 (처음 주소와 **리다이렉트마다** 같은 검사를 한다):
- 포트는 **80·443만** 허용 (`http://example.com:8080` → 400)
- `localhost`, `*.localhost`, 주소에 아이디·비밀번호가 든 URL → 400
- 접속할 IP는 **공인 unicast만** 허용(`ipaddr.js`의 `range() === 'unicast'`): 사설(10/8, 172.16/12, 192.168/16), 루프백(127/8, ::1), 링크 로컬(169.254/16, fe80::/10), CGNAT(100.64/10), 0.0.0.0, 멀티캐스트, ULA(fc00::/7), IPv4 매핑 IPv6(`::ffff:127.0.0.1`은 127.0.0.1로 보고 검사) 등 나머지는 모두 차단. `2130706433`, `0x7f.1` 같은 숫자 표기도 URL 파서가 127.0.0.1로 바꾼 뒤 검사한다
- IP 검사는 **실제로 소켓을 여는 시점**에 한다(`undici` 연결 함수에서 DNS를 풀고, 검사한 IP로 바로 접속). 검사 따로·접속 따로 DNS를 두 번 풀면 그 사이 답이 바뀌는 DNS 리바인딩에 뚫리기 때문이다. DNS 답 중 하나라도 차단 대상이면 거절한다
- 차단되면 `400 INVALID_URL`(리다이렉트 목적지가 차단돼도 같다). 사이트가 응답하지 않음·시간 초과·2xx 아님·HTML 아님·리다이렉트 초과는 `422 METADATA_FETCH_FAILED`

## POST /tokens

```json
{ "name": "회사 PC 크롬" }
→ 201 { "data": { "id": "t1...", "name": "회사 PC 크롬", "prefix": "baro_ab1", "token": "baro_ab12cd34...", "createdAt": "..." } }
```
- 앱 토큰으로만 부른다(확장 토큰으로 토큰을 만들거나 지울 수 없다). 아래 GET·DELETE도 같다
- `name`: 앞뒤 공백을 자르고 1~30자. 모르는 필드는 400
- 토큰: 32바이트 난수를 base64url(43자)로, 앞에 `baro_`. DB에는 SHA-256 해시(hex 64자)와 `prefix`(앞 8자, 목록 표시용)만 저장한다
- **원본은 이 응답에서만** 돌려준다(`Cache-Control: no-store`). 로그·오류 메시지·다른 응답에 싣지 않는다. 잃어버리면 폐기하고 새로 발급한다
- 사용자당 5개. 넘으면 `409 TOKEN_LIMIT_EXCEEDED` (DB 트리거가 검사해 동시 요청에서도 지킨다)

## GET /tokens

```json
{ "data": [{ "id": "t1...", "name": "회사 PC 크롬", "prefix": "baro_ab1", "lastUsedAt": null, "createdAt": "..." }], "meta": { "total": 1 } }
```
최근 발급순. 해시·원본은 절대 싣지 않는다. `lastUsedAt`은 5분 단위로만 갱신된다(아래 DB 문서).

## DELETE /tokens/:id

`204 No Content`. 바로 폐기되어 그 토큰의 다음 요청은 401. 없거나 남의 토큰이거나 uuid 형식이 아니면 `404 TOKEN_NOT_FOUND`(북마크와 같은 이유로 403을 쓰지 않는다).

## POST /sync/chrome

앱은 Bookmarks 파일 파싱 결과를, 확장은 `chrome.bookmarks` 결과를 같은 형식으로 평탄화해 보낸다. 앱 토큰·확장 토큰 모두 받는다.

```json
{
  "mode": "full",
  "source": "app",
  "profile": "Default",
  "folders": [{ "chromeId": "5", "parentChromeId": "1", "title": "개발" }],
  "bookmarks": [{ "chromeId": "12", "parentChromeId": "5", "title": "GitHub", "url": "https://github.com", "addedAt": "2026-08-01T03:00:00Z" }],
  "deletedChromeIds": [],
  "confirmDeleteCount": 300
}
→ { "data": { "created": 230, "updated": 4, "deleted": 2, "skipped": 11,
              "skippedReasons": { "invalidUrl": 3, "duplicateUrl": 6, "manualExists": 2 },
              "syncedAt": "2026-09-17T09:00:00Z" } }
```

| 필드 | 설명 |
| --- | --- |
| mode | `full`: 보낸 목록 기준 추가·수정·삭제 / `partial`: 보낸 항목 추가·수정과 deletedChromeIds 삭제만 |
| source | `app`(→ DB `app_sync`) 또는 `extension`(→ `ext_sync`). **토큰 종류와 맞아야 한다**: 앱 토큰은 `app`, 확장 토큰은 `extension`. 다르면 400 |
| profile | 크롬 프로필 이름(선택, 50자). 앱만 보낸다(확장은 알 수 없음). `profiles.chrome_profile`에 저장 |
| folders | 크롬 폴더 → groups (`chrome_folder_id` 매칭). **최상위 폴더(북마크바·기타·모바일)는 넣지 않는다.** 최대 1,000개 |
| bookmarks | `chrome_id` 매칭, 없으면 생성. 최대 5,000개. `url`이 http/https가 아니면(`javascript:` 북마클릿, `chrome://` 등) 그 항목만 건너뛴다(요청 전체를 거절하지 않음) |
| deletedChromeIds | `partial`에서 지울 크롬 id(북마크·폴더 공통 번호). 최대 5,000개. `full`에서는 무시 |
| confirmDeleteCount | 대량 삭제 확인(`full`만). 아래 '대량 삭제 확인' |

처리 규칙:
- 한 트랜잭션으로 실행, 중간 실패 시 전체 롤백. 같은 사용자의 동기화는 시작할 때 profiles 행을 잠가 한 번에 하나씩 처리한다(앱·확장 동시 요청)
- 쿼리 수는 북마크 수와 상관없이 일정하다: 기존 북마크·그룹을 한 번에 읽고, 메모리에서 계획을 세운 뒤 삭제 → 수정 → 추가를 묶음(500행) 쿼리로 쓴다. 바뀐 게 없는 행은 쓰지 않는다
- `full`에서 요청에 없는 chrome_id의 북마크는 삭제하되 `source`가 `manual`·`html_import`인 것은 유지(이들은 chrome_id가 없다. DB CHECK로 보장). 요청에 없는 폴더의 그룹도 삭제(안의 북마크는 미분류로)
- 삭제된 북마크의 방문 기록(`visit_logs`)도 함께 지워진다(되돌릴 수 없음)
- 앱과 확장이 같은 chrome_id를 보내면 나중 요청이 갱신(source도 나중 값으로)
- 제목은 100자로 자르고, 비어 있으면 도메인. `addedAt`은 새로 만드는 행의 `created_at`이 된다
- 본문 최대 2MB(넘으면 `413 PAYLOAD_TOO_LARGE`). 함수 제한 시간 60초
- 확장 쪽 약속(EXT-02): 폴더를 옮기거나 이름을 바꾸면 그 폴더의 하위 트리를 함께 보낸다(하위 그룹 이름이 경로라서)

**같은 URL 충돌** (`uq_bm_user_url` 때문에 한 사용자에게 같은 정규화 URL은 한 행뿐). 충돌은 쓰기 전에 메모리에서 정리하고 해당 항목만 건너뛴다. 충돌 하나로 전체가 실패하지 않는다.
- 크롬 안에서 같은 URL이 여러 폴더에 있으면 한 행만 만든다. 대표: 이미 DB에 연결된 chrome_id가 요청에 있으면 그것, 없으면 요청 순서(트리 순서)의 첫 번째. 나머지는 `duplicateUrl`
- 바로에서 직접 추가한(`manual`)·HTML로 가져온(`html_import`) 북마크와 같은 URL이면 크롬 쪽을 `manualExists`로 건너뛴다. 기존 행은 건드리지 않는다(EXT-04)
- 수정으로 URL이 바뀌어 다른 행과 겹치면 그 항목은 이전 URL을 유지하고 `duplicateUrl`. 두 북마크가 URL을 맞바꾸는 경우 한쪽이 건너뛰어지고 다음 `full`에서 맞춰진다
- 계획을 세운 뒤 다른 요청(`POST /bookmarks`)이 끼어들어 유니크 위반이 나면 동기화 전체를 한 번 다시 시도한다

**폴더 → 그룹**
- 폴더마다 그룹 하나, 이름은 경로 `상위/하위`(IO-01과 같은 규칙). 부모가 folders에 없는 폴더가 맨 위(최상위 폴더 바로 아래). 부모가 folders에 없는 북마크는 미분류(`groupId: null`)
- 30자를 넘으면 끝을 살린다(`…/프론트/리액트`). 같은 이름이 있으면 ` (2)`, ` (3)`
- 그룹 순서(position)는 처음 만들 때만 정한다(v1.1 탭 순서 변경을 덮어쓰지 않게)

**대량 삭제 확인** (`full`만)
- 지워질 동기화 북마크 수가 **(기존 동기화 북마크의 절반 이상 그리고 20개 이상) 또는 100개 이상**이면 아무것도 쓰지 않고 `409 MASS_DELETE_CONFIRM_REQUIRED`, `details: { "deleteCount": 300, "syncedTotal": 420, "preview": [{ "title": "GitHub", "url": "https://github.com/" }] }`
  - `preview`: 지워질 북마크 중 최대 5개의 제목·URL(확인 화면용). 요청한 사용자 자신의 북마크만 담긴다
- 사용자가 확인하면 같은 요청에 `confirmDeleteCount: <details.deleteCount>`를 붙여 다시 보낸다. 실제 삭제 수가 이 값 **이하**일 때만 실행하고, 더 많으면(확인하는 사이 크롬에서 더 지운 경우) 다시 409
- 이유: 파일을 일부만 읽은 경우(예: 북마크바만 읽힘)는 클라이언트에게 성공처럼 보인다. 지워진 북마크는 방문 기록까지 사라져 되돌릴 수 없다. 앱이 다른 크롬 프로필로 전체 동기화하는 경우(프로필 교체)도 이 확인에 걸린다
- 그룹 삭제는 세지 않는다(북마크는 미분류로 남음). `partial`의 `deletedChromeIds`도 세지 않는다(사용자가 크롬에서 직접 지운 이벤트)
- 클라이언트 처리: 앱은 DESK-03, 확장은 EXT-03 참고(docs/01-spec.md)

**v1 한계: 크롬 프로필은 사용자당 하나.** 크롬 id는 프로필마다 1부터 다시 매겨진다. 두 프로필을 섞으면 서로 다른 북마크가 같은 id로 뒤섞이므로, 앱이 다른 프로필로 `full`을 보내면 프로필 교체로 본다(이전 프로필분은 삭제 규칙대로 지워지고, 대량이면 위 확인을 거친다). 확장은 앱과 같은 프로필이라고 가정한다.

## POST /import/chrome

`multipart/form-data`, 필드 `file`(HTML, 5MB). 폴더 → 그룹(중첩은 '상위/하위'로 평탄화), 중복 URL 건너뜀.

```json
{ "data": { "imported": 238, "skipped": 12, "groupsCreated": 7 } }
```

## 에러 코드

| HTTP | code | 상황 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | 형식·규칙 위반 (details에 필드별 사유) |
| 400 | INVALID_URL | http/https가 아님, `/metadata`에서 차단한 주소(사설 IP·localhost·80/443 외 포트) |
| 400 | INVALID_IMPORT_FILE | 크롬 북마크 형식 아님 |
| 401 | UNAUTHORIZED | Authorization 헤더 없음 |
| 401 | INVALID_TOKEN | 액세스 토큰 서명·만료·발급자 오류, API 토큰 없음·폐기됨, 확장 토큰을 받지 않는 엔드포인트 |
| 403 | FORBIDDEN | (지금은 쓰지 않음) 남의 북마크·그룹은 존재를 숨기려고 404로 답한다 |
| 404 | BOOKMARK_NOT_FOUND / GROUP_NOT_FOUND / TOKEN_NOT_FOUND | 없음 |
| 409 | DUPLICATE_URL / DUPLICATE_GROUP_NAME | 중복 |
| 409 | TOKEN_LIMIT_EXCEEDED | 토큰 5개 초과 |
| 409 | MASS_DELETE_CONFIRM_REQUIRED | `/sync/chrome` full이 대량 삭제를 하려 함. `details.deleteCount`로 확인 후 `confirmDeleteCount`를 붙여 재요청 |
| 413 | PAYLOAD_TOO_LARGE | 파일 5MB / 동기화 2MB 초과 |
| 422 | METADATA_FETCH_FAILED | 대상 사이트 응답 없음·시간 초과·HTML 아님·리다이렉트 3회 초과 |
| 429 | RATE_LIMITED | 한도 초과 |
| 500 | INTERNAL_ERROR | 서버 오류 |
