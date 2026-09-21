# 03. API 명세

Next.js Route Handler, 기본 경로 `/api/v1`, JSON.

## 공통 규칙

- 인증: 앱은 `Authorization: Bearer <Supabase 액세스 토큰>`, 확장은 `Authorization: Bearer baro_<API 토큰>`. 서버는 접두사로 구분한다
  - 액세스 토큰은 서버가 직접 서명을 검증한다: 프로젝트 JWKS(`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`), 알고리즘 `ES256`, `iss` = `<SUPABASE_URL>/auth/v1`, `aud` = `authenticated`, `role` = `authenticated`, `sub` = uuid. Supabase에 요청마다 묻지 않는다(로그아웃한 토큰도 만료 전까지는 통과한다. 액세스 토큰 수명 1시간)
  - 헤더가 없으면 `401 UNAUTHORIZED`, 서명·만료·발급자·대상이 틀리면 `401 INVALID_TOKEN`
- DB 접근: 요청마다 트랜잭션을 열고 `SET LOCAL ROLE authenticated` + `request.jwt.claims`(검증한 토큰의 claims)를 넣은 뒤 쿼리한다. RLS가 API 경로에서도 적용되고, 쿼리에는 `user_id` 조건도 직접 붙인다(docs/02-db.md). 서비스 키는 쓰지 않는다
- 성공: `{ "data": ... }`, 목록은 `{ "data": [...], "meta": { "total": 120 } }`
- 실패: `{ "error": { "code": "BOOKMARK_NOT_FOUND", "message": "북마크를 찾을 수 없습니다" } }`
- 시간: ISO 8601 UTC
- 응답 필드는 camelCase, DB는 snake_case
- CORS: `chrome-extension://<확장 ID>`만 허용. 앱은 메인 프로세스(Node)에서 요청하므로 Origin이 없어 CORS와 무관하고, 토큰으로만 검증한다. 렌더러에서 직접 호출하면 Origin이 붙어 CORS에 막힌다
- 속도 제한: 사용자당 분당 120회, `/metadata` 20회, `/sync/chrome` 10회

## 엔드포인트

| 메서드 | 경로 | 설명 | 호출 | 기능 |
| --- | --- | --- | --- | --- |
| GET | /me | 프로필·설정 조회 | 앱 | SET |
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
| title | string | 아니요 | 100자, 없으면 메타데이터로 |
| groupId | uuid | 아니요 | 본인 그룹 |
| tags | string[] | 아니요 | 10개, 각 20자 |
| iconUrl | string | 아니요 | https |

`201 Created` + 생성된 북마크.
- 제목이 없으면 도메인(`github.com`)을 제목으로 쓴다. 서버는 페이지를 가져오지 않는다. 제목 자동 채움은 앱이 저장 전에 `/metadata`로 한다
- 같은 사용자에게 정규화 URL이 같은 북마크가 있으면 `409 DUPLICATE_URL`, `details: { "existingId": "b1..." }`. 중복 저장은 허용하지 않는다(DB 제약 `uq_bm_user_url`). 앱은 "기존 북마크 열기/수정 또는 취소"를 고르게 한다
- `groupId`가 내 그룹이 아니면 `404 GROUP_NOT_FOUND` (FK 검사는 RLS를 받지 않으므로 코드에서 확인한다)

## PATCH /bookmarks/:id

POST와 같은 필드(모두 선택, 최소 1개) + `isPinned`. `200 OK` + 수정된 북마크. URL을 바꿔 다른 북마크와 겹치면 `409 DUPLICATE_URL`.

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

HTML의 `<title>`, `og:title`, 파비콘 링크 추출. 3초·1MB·리다이렉트 3회 제한, 사설 IP 차단.

```json
{ "data": { "title": "GitHub", "iconUrl": "https://www.google.com/s2/favicons?domain=github.com&sz=64" } }
```

## POST /tokens

```json
{ "name": "회사 PC 크롬" }
→ 201 { "data": { "id": "t1...", "name": "회사 PC 크롬", "prefix": "baro_ab1", "token": "baro_ab12cd34..." } }
```
32바이트 난수 + `baro_` 접두사, SHA-256 해시만 저장. 원본은 이 응답에서만 반환.

## POST /sync/chrome

앱은 Bookmarks 파일 파싱 결과를, 확장은 `chrome.bookmarks` 결과를 같은 형식으로 평탄화해 보낸다.

```json
{
  "mode": "full",
  "source": "app",
  "profile": "Default",
  "folders": [{ "chromeId": "5", "parentChromeId": "1", "title": "개발" }],
  "bookmarks": [{ "chromeId": "12", "parentChromeId": "5", "title": "GitHub", "url": "https://github.com", "addedAt": "2026-08-01T03:00:00Z" }],
  "deletedChromeIds": []
}
→ { "data": { "created": 230, "updated": 4, "deleted": 2, "skipped": 11, "syncedAt": "2026-09-17T09:00:00Z" } }
```

| 필드 | 설명 |
| --- | --- |
| mode | `full`: 보낸 목록 기준 추가·수정·삭제 / `partial`: 보낸 항목과 deletedChromeIds만 |
| source | `app` 또는 `extension` → 저장되는 bookmarks.source |
| folders | 크롬 폴더 → groups (`chrome_folder_id` 매칭) |
| bookmarks | `chrome_id` 매칭, 없으면 생성. http/https 아닌 URL은 skipped |

처리 규칙:
- 한 트랜잭션으로 실행, 중간 실패 시 전체 롤백
- `full`에서 요청에 없는 chrome_id는 삭제하되 `source`가 `manual`·`html_import`인 것은 유지
- 앱과 확장이 같은 chrome_id를 보내면 나중 요청이 갱신
- 북마크 최대 5,000개, 본문 최대 2MB

## POST /import/chrome

`multipart/form-data`, 필드 `file`(HTML, 5MB). 폴더 → 그룹(중첩은 '상위/하위'로 평탄화), 중복 URL 건너뜀.

```json
{ "data": { "imported": 238, "skipped": 12, "groupsCreated": 7 } }
```

## 에러 코드

| HTTP | code | 상황 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | 형식·규칙 위반 (details에 필드별 사유) |
| 400 | INVALID_URL | http/https가 아님 |
| 400 | INVALID_IMPORT_FILE | 크롬 북마크 형식 아님 |
| 401 | UNAUTHORIZED | 세션 없음·만료 |
| 401 | INVALID_TOKEN | API 토큰 없음·폐기됨 |
| 403 | FORBIDDEN | 타인 리소스 |
| 404 | BOOKMARK_NOT_FOUND / GROUP_NOT_FOUND | 없음 |
| 409 | DUPLICATE_URL / DUPLICATE_GROUP_NAME | 중복 |
| 409 | TOKEN_LIMIT_EXCEEDED | 토큰 5개 초과 |
| 413 | PAYLOAD_TOO_LARGE | 파일 5MB / 동기화 2MB 초과 |
| 422 | METADATA_FETCH_FAILED | 대상 사이트 응답 없음 |
| 429 | RATE_LIMITED | 한도 초과 |
| 500 | INTERNAL_ERROR | 서버 오류 |
