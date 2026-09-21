// 1주차 확인용 화면: preload(IPC)와 API 연결이 둘 다 되는지만 본다.
// 3주차에 로그인 화면(SCR-01), 6주차에 아이콘 그리드(BookmarkGrid)로 바뀐다.
import { useEffect, useState } from 'react'
import type { AuthAttempt, AuthStatus, HealthResponse } from '@baro/shared'

// 화면에 주소를 보여주는 용도로만 쓴다. 실제 요청은 메인 프로세스가 같은 값으로 보낸다
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1'

type HealthState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: HealthResponse }
  | { kind: 'error'; message: string }

// AUTH-01·02 확인용. 로그인 화면(SCR-01)이 생기면 그쪽으로 옮긴다
const ATTEMPT_LABEL: Record<AuthAttempt['kind'], string> = {
  login: '로그인',
  restore: '자동 로그인',
  refresh: '토큰 갱신'
}

export default function App() {
  const [version, setVersion] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthState>({ kind: 'idle' })
  // 로그인 상태(메인 프로세스가 알려 줌)와 버튼을 눌러 기다리는 중인지를 따로 둔다.
  // 재로그인이 실패해도 status.session은 그대로라 이메일이 화면에서 사라지지 않는다
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [waitingLogin, setWaitingLogin] = useState(false)

  // 메인 프로세스에 IPC로 버전을 물어본다 (window.baro → preload → ipcMain.handle)
  useEffect(() => {
    window.baro.getVersion().then(setVersion, () => setVersion('알 수 없음'))
  }, [])

  // 먼저 구독하고 현재 상태를 읽는다. 자동 로그인이 끝나는 순간을 놓치지 않기 위해서다
  useEffect(() => {
    const unsubscribe = window.baro.onAuthChanged(setAuth)
    window.baro.getAuthStatus().then(setAuth, () => undefined)
    return unsubscribe
  }, [])

  async function startLogin() {
    setWaitingLogin(true)
    try {
      // 메인 프로세스가 브라우저를 열고, 로그인이 끝날 때까지(최대 2분) 기다린다.
      // 성공·실패 모두 메인 프로세스가 lastAttempt에 기록해 onAuthChanged로 알려 준다
      await window.baro.login()
    } catch {
      // 실패 이유는 status.lastAttempt로 보여준다
    } finally {
      setWaitingLogin(false)
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
          disabled={waitingLogin || !auth || auth.restoring}
        >
          Google로 계속하기
        </button>
        {/* 지금 상태 */}
        <p role="status" className="status">
          {!auth || auth.restoring ? (
            '저장된 로그인 확인 중…'
          ) : auth.session ? (
            <span className="success">
              {auth.session.email} · 토큰 만료{' '}
              {new Date(auth.session.expiresAt * 1000).toLocaleTimeString()} ·{' '}
              {auth.session.persisted ? '이 PC에 저장됨' : '저장 안 됨(앱을 다시 켜면 로그아웃)'}
            </span>
          ) : (
            '로그인 전'
          )}
        </p>
        {/* 마지막 시도 결과. 위의 상태와 따로 보여준다 */}
        <p className="caption">
          {waitingLogin
            ? '브라우저에서 로그인을 기다리는 중…'
            : auth?.lastAttempt && (
                <>
                  마지막 시도: {ATTEMPT_LABEL[auth.lastAttempt.kind]}{' '}
                  {auth.lastAttempt.ok ? (
                    <span className="success">성공</span>
                  ) : (
                    <span className="danger">실패 · {auth.lastAttempt.message}</span>
                  )}{' '}
                  · {new Date(auth.lastAttempt.at).toLocaleTimeString()}
                </>
              )}
        </p>
      </section>
    </main>
  )
}
