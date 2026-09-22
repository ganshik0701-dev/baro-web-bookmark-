# apps/extension — 바로 크롬 확장 (EXT-01~04)

크롬 북마크를 바로 API(`POST /sync/chrome`)로 보낸다. 동작 규칙은 `docs/01-spec.md` '확장 동작 규칙'.

## 빌드와 설치 (개발자 모드)

```bash
pnpm --filter @baro/extension build       # 운영 API(https://baro-web-bookmark-api.vercel.app)
pnpm --filter @baro/extension build:dev   # 로컬 개발 서버(http://localhost:3000)
```

1. 크롬 주소창에 `chrome://extensions` → 오른쪽 위 '개발자 모드' 켜기
2. '압축해제된 확장 프로그램을 로드합니다' → `apps/extension/dist` 폴더 선택
3. 확장 ID가 `odhbbplpjlmkpggjocgiliebnmappfib`인지 확인(manifest `key`로 고정)
4. 팝업 오른쪽 위에 어느 서버에 붙는 빌드인지(API 호스트) 표시된다. 다시 빌드한 뒤에는 확장 카드의 새로고침(↻)을 누른다

## 파일

| 파일 | 역할 |
| --- | --- |
| `manifest.json` | MV3. 권한 `bookmarks`·`storage`, host_permissions는 운영 API와 `http://localhost:3000/*`만. `key`는 공개키(ID 고정용) |
| `src/background.ts` | 서비스 워커. 크롬 이벤트·팝업 메시지를 `engine`에 잇는다. fetch·북마크 읽기는 여기서만 |
| `src/engine.ts` | 토큰·연결 확인·전체 동기화·409 확인·실시간 대기열 |
| `src/tree.ts` | 북마크 트리 → 요청 변환(폴더 → 그룹 매핑 규칙, URL 거르기, 바이트 계산) |
| `src/popup.*` | 팝업. 메시지만 보내고 storage 상태를 읽어 그린다(토큰 원본은 읽지 않음) |

## manifest `key`

개발자 모드로 설치하면 경로마다 확장 ID가 바뀌므로 `key`(RSA 공개키, base64 DER)로 ID를 고정한다.
ID = 공개키 DER의 SHA-256 앞 32자리 16진수를 `a`~`p`로 바꾼 값. 개인키는 저장소에 두지 않는다(만든 사람 PC의 `~/.baro/extension-key.pem`).
압축해제 설치에는 개인키가 필요 없고, 웹스토어에 같은 ID로 올릴 때만 쓴다(게시 여부는 남은 결정).
