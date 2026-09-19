# 1주차 환경 설정 체크리스트

코드는 이미 들어 있다. 아래는 사람이 직접 해야 하는 계정·배포 작업이다.

## 1. 로컬에서 띄우기

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/desktop/.env.example apps/desktop/.env
pnpm dev:api      # 터미널 1
pnpm dev:desktop  # 터미널 2
```

- [ ] `http://localhost:3000/api/v1/health` 가 `{"data":{"status":"ok",...}}` 를 반환한다
- [ ] Electron 창이 뜨고 'API 상태 확인' 버튼이 초록색 응답을 보여준다
- [ ] `pnpm typecheck` 가 통과한다

막히는 곳: `pnpm install`에서 Electron 다운로드가 느리면 사내망·VPN을 확인한다.

## 2. GitHub 저장소

```bash
git init
git add .
git commit -m "chore: 1주차 환경 설정"
git branch -M main
git remote add origin https://github.com/<계정>/baro.git
git push -u origin main
```

- [ ] `apps/api/.env`, `apps/desktop/.env` 가 커밋되지 않았는지 확인한다 (`.gitignore`의 `.env` 규칙은 모든 폴더에 적용된다)
- [ ] Actions 탭에서 CI가 초록색인지 본다

## 3. Vercel 배포 (API만)

1. vercel.com에서 GitHub 저장소를 import
2. Root Directory를 `apps/api` 로 지정
3. Framework는 Next.js 자동 인식
4. 배포 후 `https://<프로젝트>.vercel.app/api/v1/health` 확인

- [ ] 배포 주소에서 health가 응답한다
- [ ] `apps/desktop/.env` 의 `VITE_API_BASE_URL` 을 배포 주소로 바꿔도 앱이 동작한다

## 4. Supabase 프로젝트 생성

1. supabase.com에서 새 프로젝트 생성 (리전은 Seoul)
2. Settings → API에서 `URL`, `anon key`, `service_role key` 복사
3. 상단 Connect → Connection String → URI → Session pooler 주소 복사
   (직접 연결 주소는 IPv6 전용이라 IPv4만 되는 인터넷에서는 접속되지 않는다)
4. 네 값 모두 `apps/api/.env` 와 Vercel 환경 변수에 넣는다.
   `apps/desktop/.env` 에는 `URL` 과 `anon key` 만 넣는다

- [ ] `service_role key` 는 API 서버에만 넣는다. 앱·확장에 절대 넣지 않는다
- [ ] 테이블은 아직 만들지 않는다 (2주차 `docs/02-db.md`)

## 5. 마무리

- [ ] `docs/05-roadmap.md` 1주차 체크박스를 채운다
- [ ] 이번 주에 새로 안 것을 README나 메모에 두세 줄 남긴다

다음: 2주차 DB. `docs/02-db.md` 를 보고 마이그레이션을 작성한다.
