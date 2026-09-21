// 로그인 상태(메인 프로세스가 알려 줌)를 보고 화면을 고른다.
//   확인 중 → Loading / 세션 있음 → 임시 홈 / 그 밖 → SCR-01 로그인
// 6주차에 임시 홈이 메인 그리드(SCR-03)로 바뀐다.
import { useEffect, useState } from 'react'
import type { AuthStatus } from '@baro/shared'
import Loading from './screens/Loading'
import LoginScreen from './screens/LoginScreen'
import TempHome from './screens/TempHome'

export default function App() {
  // 로그인 상태와 버튼을 눌러 기다리는 중인지를 따로 둔다.
  // 재로그인이 실패해도 status.session은 그대로라 화면이 바뀌지 않는다
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [waitingLogin, setWaitingLogin] = useState(false)
  const [waitingLogout, setWaitingLogout] = useState(false)

  // 먼저 구독하고 현재 상태를 읽는다. 자동 로그인이 끝나는 순간을 놓치지 않기 위해서다
  useEffect(() => {
    const unsubscribe = window.baro.onAuthChanged(setAuth)
    window.baro.getAuthStatus().then(setAuth, () => undefined)
    return unsubscribe
  }, [])

  async function startLogin() {
    setWaitingLogin(true)
    try {
      // 메인 프로세스가 브라우저를 열고, 로그인이 끝날 때까지(최대 2분, 또는 취소까지) 기다린다.
      // 성공·실패 모두 메인 프로세스가 lastAttempt에 기록해 onAuthChanged로 알려 준다
      await window.baro.login()
    } catch {
      // 실패 이유는 status.lastAttempt로 보여준다. 취소는 기록하지 않는다
    } finally {
      setWaitingLogin(false)
    }
  }

  async function startLogout() {
    setWaitingLogout(true)
    try {
      // 로컬은 항상 로그아웃된다. 서버에 알리지 못한 경우는 lastAttempt.message로 보여준다
      await window.baro.logout()
    } catch {
      // 결과는 onAuthChanged로 온다
    } finally {
      setWaitingLogout(false)
    }
  }

  // 메인 프로세스는 창을 띄우기 전에 restoring=true로 둔다. 그래서 로그인된 사용자에게
  // 로그인 화면이 잠깐 보였다 사라지는 일이 없다
  if (!auth || auth.restoring) return <Loading />

  if (auth.session) {
    return (
      <TempHome
        session={auth.session}
        lastAttempt={auth.lastAttempt}
        waitingLogout={waitingLogout}
        onLogout={startLogout}
      />
    )
  }

  return (
    <LoginScreen
      auth={auth}
      waitingLogin={waitingLogin}
      waitingLogout={waitingLogout}
      onLogin={startLogin}
      onCancelLogin={() => void window.baro.cancelLogin()}
      onLogout={startLogout}
    />
  )
}
