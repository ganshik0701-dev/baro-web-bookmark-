// 1주차 확인용 화면: preload(IPC)와 API 연결이 둘 다 되는지만 본다.
// 3주차에 로그인 화면(SCR-01), 6주차에 아이콘 그리드(BookmarkGrid)로 바뀐다.
import { useEffect, useState } from 'react'
import type { AuthStatus, HealthResponse } from '@baro/shared'

// 화면에 주소를 보여주는 용도로만 쓴다. 실제 요청은 메인 프로세스가 같은 값으로 보낸다
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1'

type HealthState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: HealthResponse }
  | { kind: 'error'; message: string }

// AUTH-01 확인용. 로그인 화면(SCR-01)이 생기면 그쪽으로 옮긴다
type LoginState =
  | { kind: 'loading' }
  | { kind: 'done'; status: AuthStatus }
  | { kind: 'error'; message: string }

export default function App() {
  const [version, setVersion] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthState>({ kind: 'idle' })
  const [auth, setAuth] = useState<LoginState>({ kind: 'loading' })

  // 메인 프로세스에 IPC로 버전을 물어본다 (window.baro → preload → ipcMain.handle)
  useEffect(() => {
    window.baro.getVersion().then(setVersion, () => setVersion('알 수 없음'))
  }, [])

  useEffect(() => {
    window.baro.getAuthStatus().then(
      (status) => setAuth({ kind: 'done', status }),
      () => setAuth({ kind: 'done', status: { loggedIn: false } })
    )
  }, [])

  async function startLogin() {
    setAuth({ kind: 'loading' })
    try {
      // 메인 프로세스가 브라우저를 열고, 로그인이 끝날 때까지(최대 2분) 기다린다
      setAuth({ kind: 'done', status: await window.baro.login() })
    } catch (err) {
      // IPC 에러는 "Error invoking remote method 'auth:login': Error: ..." 모양이라 뒷부분만 보여준다
      const message = err instanceof Error ? err.message.replace(/^.*Error: /, '') : String(err)
      setAuth({ kind: 'error', message })
    }
  }

  async function checkHealth() {
    setHealth({ kind: 'loading' })
    try {
      // 렌더러는 fetch하지 않는다. preload → IPC → 메인 프로세스가 요청한다 (CORS 없음)
      const body = await window.baro.getHealth()
      if ('error' in body) {
        setHealth({ kind: 'error', message: `${body.error.code}: ${body.error.message}` })
      } else {
        setHealth({ kind: 'ok', data: body.data })
      }
    } catch (err) {
      setHealth({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <main className="page">
      <h1 className="logo">바로</h1>
      <p className="muted">앱 버전 {version ?? '확인 중…'}</p>

      <section className="card" aria-labelledby="health-title">
        <h2 id="health-title" className="section-title">
          API 연결
        </h2>
        <p className="caption">{API_BASE}</p>
        <button
          type="button"
          className="button-primary"
          onClick={checkHealth}
          disabled={health.kind === 'loading'}
        >
          API 상태 확인
        </button>
        <p role="status" className="status">
          {health.kind === 'loading' && '확인 중…'}
          {health.kind === 'ok' && (
            <span className="success">
              정상 · 버전 {health.data.version} · {health.data.time}
            </span>
          )}
          {health.kind === 'error' && <span className="danger">실패 · {health.message}</span>}
        </p>
      </section>

      <section className="card" aria-labelledby="auth-title">
        <h2 id="auth-title" className="section-title">
          Google 로그인
        </h2>
        <button
          type="button"
          className="button-primary"
          onClick={startLogin}
          disabled={auth.kind === 'loading'}
        >
          Google로 계속하기
        </button>
        <p role="status" className="status">
          {auth.kind === 'loading' && '브라우저에서 로그인을 기다리는 중…'}
          {auth.kind === 'done' && !auth.status.loggedIn && '로그인 전'}
          {auth.kind === 'done' && auth.status.loggedIn && (
            <span className="success">
              {auth.status.email} · 토큰 만료 {new Date(auth.status.expiresAt * 1000).toLocaleTimeString()}
            </span>
          )}
          {auth.kind === 'error' && <span className="danger">실패 · {auth.message}</span>}
        </p>
      </section>
    </main>
  )
}
