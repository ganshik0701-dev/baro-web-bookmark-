// AUTH-01: Google 로그인 (루프백 서버 + PKCE, Supabase Auth와 직접 코드 교환).
// 흐름: PKCE 쌍 생성 → 127.0.0.1 임의 포트로 서버 → 시스템 브라우저로 authorize 주소
//       → /callback?code=... 수신 → POST /auth/v1/token?grant_type=pkce → 세션을 메모리에 둔다.
// AUTH-02: 리프레시 토큰은 safeStorage로 암호화해 저장하고(token-store.ts), 앱 시작 시 그걸로 자동 로그인한다.
//          액세스 토큰 만료 전에 grant_type=refresh_token으로 직접 갱신한다.
// SCR-01: 브라우저 대기 중인 로그인은 cancelLogin()으로 끝낼 수 있다(브라우저 창을 닫아 버린 경우).
// AUTH-03: 로그아웃은 로컬(메모리·타이머·파일)을 먼저 비우고, 그다음 서버에 이 세션만 무효화를 요청한다.
// code_verifier와 토큰은 이 파일(메인 프로세스) 밖으로 나가지 않는다. 로그에도 찍지 않는다.
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { app, powerMonitor, shell } from 'electron'
import type { AuthAttempt, AuthStatus } from '@baro/shared'
import { clearRefreshToken, loadRefreshToken, saveRefreshToken } from './token-store'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// 브라우저에서 로그인을 끝내지 않고 창을 닫는 경우를 대비한 대기 시간
const LOGIN_TIMEOUT_MS = 2 * 60 * 1000
// 액세스 토큰(1시간) 만료 5분 전에 갱신한다. PC 시계가 조금 틀리거나 요청이 느려도
// 만료된 토큰으로 API를 부르지 않을 만큼의 여유다
const REFRESH_MARGIN_SEC = devRefreshMargin() ?? 5 * 60
// 네트워크·서버 오류로 갱신이나 자동 로그인에 실패하면 이 간격으로 다시 시도한다
const RETRY_MS = 60 * 1000

// 개발 확인용. BARO_REFRESH_MARGIN_SEC=3590 으로 켜면 로그인 10초 뒤부터 10초마다 갱신된다.
// 설치 파일(app.isPackaged)에서는 무시한다
function devRefreshMargin(): number | null {
  if (app.isPackaged) return null
  const sec = Number(process.env.BARO_REFRESH_MARGIN_SEC)
  return Number.isFinite(sec) && sec > 0 ? sec : null
}

type Session = {
  accessToken: string
  refreshToken: string
  /** 유닉스 초. 갱신 시점 판단에 쓴다 */
  expiresAt: number
  user: { id: string; email: string | null }
}

// 액세스 토큰은 메모리에만. 디스크에는 리프레시 토큰만 암호화해 둔다
let session: Session | null = null
// session.bin이 있는가. 세션이 있으면 '이 PC에 저장됨' 여부이고, 세션이 없어도
// 오프라인 시작 후 자동 로그인을 재시도하는 동안에는 true다(이때도 로그아웃할 수 있어야 한다)
let stored = false
let restoring = false
let lastAttempt: AuthAttempt | null = null
// 세션이 바뀔 때마다 1 올린다. 갱신 응답을 기다리는 사이 새로 로그인했으면 그 응답은 버린다
let generation = 0
let refreshTimer: NodeJS.Timeout | null = null
// 로그인 버튼을 여러 번 눌러도 루프백 서버는 하나만 띄운다
let pendingLogin: Promise<AuthStatus> | null = null
// 콜백을 기다리는 동안만 채워진다. 부르면 대기를 '취소됨'으로 끝내고 루프백 서버를 닫는다
let cancelWaiting: (() => void) | null = null
// 갱신도 한 번에 하나만. rotation 때문에 같은 토큰으로 두 번 보내면 안 된다
let pendingRefresh: Promise<void> | null = null
// 로그아웃 버튼을 여러 번 눌러도 한 번만 처리한다
let pendingLogout: Promise<AuthStatus> | null = null
// 파일 쓰기·삭제 순서를 세션이 바뀐 순서와 같게 맞춘다(마지막 세션이 파일에 남도록)
let diskQueue: Promise<unknown> = Promise.resolve()

const listeners = new Set<(status: AuthStatus) => void>()

/** 상태가 바뀔 때마다 불린다. 메인 프로세스가 렌더러에 알리는 데 쓴다 */
export function onAuthChange(fn: (status: AuthStatus) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit(): void {
  const status = getAuthStatus()
  for (const fn of listeners) fn(status)
}

export function getAuthStatus(): AuthStatus {
  return {
    session: session && { email: session.user.email, expiresAt: session.expiresAt, persisted: stored },
    restoring,
    stored,
    lastAttempt
  }
}

function record(kind: AuthAttempt['kind'], err?: unknown): void {
  lastAttempt = {
    kind,
    ok: err === undefined,
    message: err === undefined ? null : err instanceof Error ? err.message : String(err),
    at: Date.now()
  }
}

/** 앱 시작 시 한 번. 저장된 토큰이 있으면 자동 로그인하고, 절전 복귀 때 갱신 시점을 다시 잡는다 */
export function initAuth(): void {
  restoring = true
  void refresh('restore').finally(() => {
    restoring = false
    emit()
  })
  // 절전 중에는 타이머가 멈춰 있다가 늦게 울릴 수 있다. 깨어나면 남은 시간으로 다시 계산한다
  powerMonitor.on('resume', () => scheduleRefresh())
}

export function login(): Promise<AuthStatus> {
  pendingLogin ??= runLogin()
    .then(
      () => {
        record('login')
        return getAuthStatus()
      },
      (err: unknown) => {
        // 실패해도 기존 세션은 건드리지 않는다. 화면은 lastAttempt로만 실패를 보여준다.
        // 취소는 사용자가 고른 것이라 실패로 남기지 않는다(이전 실패 문구도 지운다)
        if (err instanceof LoginCancelled) lastAttempt = null
        else record('login', err)
        throw err
      }
    )
    .finally(() => {
      pendingLogin = null
      emit()
    })
  return pendingLogin
}

/** 브라우저 대기 중이면 끝낸다. 토큰 교환이 이미 시작됐으면 아무것도 하지 않는다 */
export function cancelLogin(): void {
  cancelWaiting?.()
}

class LoginCancelled extends Error {}

// 새 토큰을 받았을 때만 부른다. Supabase는 갱신할 때마다 리프레시 토큰을 바꾸므로(rotation)
// 받자마자 파일도 바꿔야 한다. curl 확인: 바로 전 토큰은 재사용하면 최신 토큰을 돌려주지만,
// 두 세대 전 토큰은 400 refresh_token_already_used로 거절된다.
async function adoptSession(next: Session): Promise<void> {
  generation++
  session = next
  scheduleRefresh()
  stored = await onDisk(() => saveRefreshToken(next.refreshToken))
}

/** 파일까지 지웠으면 true. 삭제에 실패하면 stored를 그대로 둬서 화면에 로그아웃 버튼이 남게 한다 */
async function dropSession(): Promise<boolean> {
  generation++
  session = null
  clearTimer()
  try {
    await onDisk(clearRefreshToken)
    stored = false
    return true
  } catch (err) {
    console.error('[auth] 세션 파일 삭제 실패:', err instanceof Error ? err.message : String(err))
    return false
  }
}

function onDisk<T>(fn: () => Promise<T>): Promise<T> {
  const run = diskQueue.then(fn)
  diskQueue = run.catch(() => undefined)
  return run
}

function clearTimer(): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
}

/** 만료 REFRESH_MARGIN_SEC 전에 갱신하도록 타이머를 건다. 이미 지났으면 바로 갱신한다 */
function scheduleRefresh(): void {
  clearTimer()
  if (!session) return
  const delay = Math.max(0, session.expiresAt * 1000 - Date.now() - REFRESH_MARGIN_SEC * 1000)
  refreshTimer = setTimeout(() => void refresh('refresh'), delay)
}

function refresh(kind: 'restore' | 'refresh'): Promise<void> {
  pendingRefresh ??= runRefresh(kind).finally(() => {
    pendingRefresh = null
    emit()
  })
  return pendingRefresh
}

async function runRefresh(kind: 'restore' | 'refresh'): Promise<void> {
  const gen = generation
  const token = kind === 'restore' ? await loadRefreshToken() : (session?.refreshToken ?? null)
  // 파일을 읽는 사이 로그아웃했으면 그 토큰은 쓰지 않는다
  if (gen !== generation) return
  // 저장된 토큰이 없으면(처음 실행, 암호화 불가) 시도할 것이 없다
  if (!token) return
  if (kind === 'restore') {
    stored = true
    emit()
  }

  try {
    const next = await requestToken('refresh_token', { refresh_token: token })
    if (gen !== generation) return
    await adoptSession(next)
    record(kind)
  } catch (err) {
    if (gen !== generation) return
    record(kind, err)
    if (err instanceof AuthRejected) {
      // 토큰이 무효하다(폐기·재사용·만료). 다시 쓸 수 없으므로 세션과 파일을 지운다
      await dropSession()
    } else {
      // 네트워크·서버 오류. 토큰은 아직 유효할 수 있으니 지우지 않고 잠시 뒤 다시 시도한다.
      // 오프라인에서 앱을 켰다고 로그인이 풀리면 안 된다
      clearTimer()
      refreshTimer = setTimeout(() => void refresh(kind), RETRY_MS)
    }
  }
}

export function logout(): Promise<AuthStatus> {
  pendingLogout ??= runLogout().finally(() => {
    pendingLogout = null
    emit()
  })
  return pendingLogout
}

// 사용자가 로그아웃을 눌렀는데 안 되는 일은 없어야 한다. 그래서 로컬을 먼저 비우고
// 서버 요청은 그 뒤에 한다. 서버 요청이 실패해도 로컬은 이미 로그아웃된 상태다
async function runLogout(): Promise<AuthStatus> {
  // 세션 없이 파일만 있는 상태(오프라인 시작 후 재시도 중)면 null. 서버에 보낼 토큰이 없다
  const accessToken = session?.accessToken ?? null
  // 재시도 타이머도 refreshTimer라 여기서 같이 멈춘다. 진행 중인 갱신·자동 로그인 응답은 generation으로 버린다
  const cleared = await dropSession()
  restoring = false
  emit()

  const notes: string[] = []
  if (!cleared) notes.push('저장된 로그인 파일을 지우지 못했습니다')
  if (accessToken) {
    try {
      await revokeSession(accessToken)
    } catch (err) {
      notes.push(`서버에 알리지 못함(${err instanceof Error ? err.message : String(err)})`)
    }
  }
  // 파일이 남았으면 다음 실행 때 자동 로그인될 수 있으므로 실패로 알린다. 서버 실패만이면 로그아웃은 된 것이다
  lastAttempt = { kind: 'logout', ok: cleared, message: notes.join(' · ') || null, at: Date.now() }
  return getAuthStatus()
}

async function runLogin(): Promise<void> {
  assertConfig()

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

    const next = await requestToken('pkce', { auth_code: await code, code_verifier: verifier })
    await adoptSession(next)
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
    cancelWaiting = null
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
  // 브라우저 열기에 실패해 서버를 먼저 닫는 경우에도 타이머·취소 함수가 남지 않게 한다
  server.once('close', () => {
    clearTimeout(timer)
    cancelWaiting = null
  })
  cancelWaiting = () => settle(() => rejectCode(new LoginCancelled('로그인을 취소했습니다')))
  // 브라우저를 여는 중에 취소하면 code를 await하기 전에 거절된다. 처리되지 않은 거절 경고를 막는다
  code.catch(() => undefined)

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

function assertConfig(): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY가 apps/desktop/.env에 없습니다')
  }
}

// scope=local: 이 세션만 무효화한다. 기본값(global)은 다른 PC의 로그인까지 전부 푼다.
// Supabase는 세션 단위로 폐기하므로 이 세션에서 rotation으로 받은 리프레시 토큰이 모두 무효가 된다.
// 액세스 토큰이 이미 만료됐으면 401로 거절된다(로컬은 이미 지웠으니 결과 메시지로만 남긴다)
async function revokeSession(accessToken: string): Promise<void> {
  assertConfig()
  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY!, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000)
    })
  } catch {
    throw new Error('Supabase에 연결하지 못했습니다')
  }
  if (res.ok) return
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  throw new Error(String(body?.error_code ?? body?.msg ?? `HTTP ${res.status}`))
}

/** Supabase가 요청을 거절했다(4xx). 같은 토큰으로 다시 해도 소용없다 */
class AuthRejected extends Error {}

// curl로 확인한 형식 그대로: apikey 헤더 + JSON 바디
//   pkce:          { auth_code, code_verifier }
//   refresh_token: { refresh_token }  → 응답에 새 refresh_token이 온다(rotation)
async function requestToken(
  grant: 'pkce' | 'refresh_token',
  payload: Record<string, string>
): Promise<Session> {
  assertConfig()
  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000)
    })
  } catch {
    // 오프라인·DNS 실패·10초 타임아웃. 서버가 토큰을 거절한 것은 아니다
    throw new Error('Supabase에 연결하지 못했습니다')
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null

  if (
    !res.ok ||
    !body ||
    typeof body.access_token !== 'string' ||
    typeof body.refresh_token !== 'string'
  ) {
    // 실패 응답에는 토큰이 없다. 코드·메시지만 올린다
    const reason =
      body?.error_code ?? body?.msg ?? body?.error_description ?? body?.error ?? `HTTP ${res.status}`
    const message = `${grant === 'pkce' ? '토큰 교환' : '토큰 갱신'} 실패: ${String(reason)}`
    // 4xx는 토큰이 무효하다는 뜻(429 요청 과다는 제외). 5xx·429는 잠시 뒤 다시 해볼 만하다
    if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new AuthRejected(message)
    throw new Error(message)
  }

  // provider_token(Google 쪽 토큰)은 쓰지 않으므로 받지 않고 버린다
  const user = body.user as { id: string; email?: string } | undefined
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Number(body.expires_at),
    user: { id: String(user?.id), email: user?.email ?? null }
  }
}
