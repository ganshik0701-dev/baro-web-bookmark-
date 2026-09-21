// AUTH-01: Google 로그인 (루프백 서버 + PKCE, Supabase Auth와 직접 코드 교환).
// 흐름: PKCE 쌍 생성 → 127.0.0.1 임의 포트로 서버 → 시스템 브라우저로 authorize 주소
//       → /callback?code=... 수신 → POST /auth/v1/token?grant_type=pkce → 세션을 메모리에 둔다.
// code_verifier와 토큰은 이 파일(메인 프로세스) 밖으로 나가지 않는다. 로그에도 찍지 않는다.
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { shell } from 'electron'
import type { AuthStatus } from '@baro/shared'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// 브라우저에서 로그인을 끝내지 않고 창을 닫는 경우를 대비한 대기 시간
const LOGIN_TIMEOUT_MS = 2 * 60 * 1000

type Session = {
  accessToken: string
  refreshToken: string
  /** 유닉스 초. 갱신 시점 판단(AUTH-02)에 쓴다 */
  expiresAt: number
  user: { id: string; email: string | null }
}

// 토큰은 메모리에만 둔다. 디스크 저장(safeStorage)은 AUTH-02에서 한다.
let session: Session | null = null
// 로그인 버튼을 여러 번 눌러도 루프백 서버는 하나만 띄운다
let pendingLogin: Promise<AuthStatus> | null = null

export function getAuthStatus(): AuthStatus {
  if (!session) return { loggedIn: false }
  return { loggedIn: true, email: session.user.email, expiresAt: session.expiresAt }
}

export function login(): Promise<AuthStatus> {
  pendingLogin ??= runLogin().finally(() => {
    pendingLogin = null
  })
  return pendingLogin
}

async function runLogin(): Promise<AuthStatus> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY가 apps/desktop/.env에 없습니다')
  }

  // PKCE: verifier는 32바이트 난수(base64url 43자), challenge는 그 SHA-256을 base64url로.
  // 로그인 한 번에 새 쌍을 만든다. code는 이 verifier로만 교환되므로
  // 남이 끼워 넣은 code는 교환에 실패한다(state 없이도 CSRF가 막히는 이유).
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')

  const { server, port, code } = await startCallbackServer()
  try {
    const authorizeUrl = new URL('/auth/v1/authorize', SUPABASE_URL)
    authorizeUrl.searchParams.set('provider', 'google')
    authorizeUrl.searchParams.set('redirect_to', `http://127.0.0.1:${port}/callback`)
    authorizeUrl.searchParams.set('code_challenge', challenge)
    authorizeUrl.searchParams.set('code_challenge_method', 's256')
    await shell.openExternal(authorizeUrl.toString())

    session = await exchangeCode(await code, verifier)
    return getAuthStatus()
  } finally {
    // 보통은 callback을 받을 때 이미 닫혔다. 브라우저 열기 실패처럼 callback 전에 끝난 경우를 위해 한 번 더 닫는다
    if (server.listening) server.close()
    server.closeAllConnections()
  }
}

// 127.0.0.1에만 붙는다(localhost로 하면 외부 인터페이스나 IPv6로 열릴 수 있다).
// 포트 0 = OS가 빈 포트를 골라 준다. Supabase 허용 목록은 포트 와일드카드로 받는다.
async function startCallbackServer(): Promise<{ server: Server; port: number; code: Promise<string> }> {
  let resolveCode!: (code: string) => void
  let rejectCode!: (err: Error) => void
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })
  // 첫 결과(code·오류·타임아웃) 하나만 받는다. 받는 즉시 새 연결을 받지 않도록 서버를 닫는다.
  // 방금 보낸 안내 페이지는 Connection: close라 응답을 마친 뒤 소켓이 정리된다.
  let settled = false
  const settle = (fn: () => void): void => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    server.close()
    fn()
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    // 파비콘 요청 등 /callback이 아닌 것은 무시한다
    if (req.method !== 'GET' || url.pathname !== '/callback') {
      res.writeHead(404).end()
      return
    }
    // 서버를 닫은 직후, 이미 열려 있던 연결로 들어온 요청
    if (settled) {
      sendPage(res, 410, '이미 처리된 요청입니다', '이 창을 닫고 앱으로 돌아가세요.')
      return
    }

    // 로그인 실패·취소 시 Supabase가 error, error_description을 붙여 돌려보낸다
    const error = url.searchParams.get('error')
    if (error) {
      const reason = url.searchParams.get('error_description') ?? error
      sendPage(res, 400, '로그인하지 못했습니다', '앱으로 돌아가 다시 시도하세요.')
      settle(() => rejectCode(new Error(`로그인 실패: ${reason}`)))
      return
    }
    // code도 error도 없는 요청은 Supabase가 보낸 것이 아니다. 거절만 하고 로그인은 계속 기다린다
    const received = url.searchParams.get('code')
    if (!received) {
      res.writeHead(400).end()
      return
    }

    sendPage(res, 200, '로그인되었습니다', '이 창을 닫고 바로 앱으로 돌아가세요.')
    settle(() => resolveCode(received))
  })

  const timer = setTimeout(() => {
    settle(() => rejectCode(new Error('로그인 대기 시간(2분)이 지났습니다')))
  }, LOGIN_TIMEOUT_MS)
  // 브라우저 열기에 실패해 서버를 먼저 닫는 경우에도 타이머가 남지 않게 한다
  server.once('close', () => clearTimeout(timer))

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo
  return { server, port, code }
}

function sendPage(res: ServerResponse, status: number, title: string, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' })
  res.end(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>바로</title></head>` +
      `<body style="font-family:sans-serif;text-align:center;padding-top:80px">` +
      `<h1>${title}</h1><p>${body}</p></body></html>`
  )
}

// curl로 확인한 형식 그대로: apikey 헤더 + JSON 바디 { auth_code, code_verifier }
async function exchangeCode(authCode: string, verifier: string): Promise<Session> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth_code: authCode, code_verifier: verifier }),
    signal: AbortSignal.timeout(10_000)
  })
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null

  if (!res.ok || !body || typeof body.access_token !== 'string') {
    // 실패 응답에는 토큰이 없다. 코드·메시지만 올린다
    const reason = body?.msg ?? body?.error_description ?? body?.error ?? `HTTP ${res.status}`
    throw new Error(`토큰 교환 실패: ${String(reason)}`)
  }

  // provider_token(Google 쪽 토큰)은 쓰지 않으므로 받지 않고 버린다
  const user = body.user as { id: string; email?: string } | undefined
  return {
    accessToken: body.access_token,
    refreshToken: String(body.refresh_token),
    expiresAt: Number(body.expires_at),
    user: { id: String(user?.id), email: user?.email ?? null }
  }
}
