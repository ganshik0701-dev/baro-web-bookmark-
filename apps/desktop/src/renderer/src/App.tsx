// 로그인 상태(메인 프로세스가 알려 줌)를 보고 화면을 고른다.
//   확인 중 → Loading / 세션 있음 → 임시 홈 / 그 밖 → SCR-01 로그인
// 6주차에 임시 홈이 메인 그리드(SCR-03)로 바뀐다.
import { useEffect, useState } from 'react'
import type { AuthStatus } from '@baro/shared'
import type { SyncState } from './types'
import MassDeleteModal from './components/MassDeleteModal'
import Loading from './screens/Loading'
import LoginScreen from './screens/LoginScreen'
import SyncScreen from './screens/SyncScreen'
import TempHome from './screens/TempHome'

export default function App() {
  // 로그인 상태와 버튼을 눌러 기다리는 중인지를 따로 둔다.
  // 재로그인이 실패해도 status.session은 그대로라 화면이 바뀌지 않는다
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [waitingLogin, setWaitingLogin] = useState(false)
  const [waitingLogout, setWaitingLogout] = useState(false)
  // 동기화 상태도 메인이 알려 준다(자동 동기화가 메인에서 일어나므로)
  const [sync, setSync] = useState<SyncState | null>(null)
  // 첫 동기화 화면을 열었는지와, 사용자가 닫았는지를 따로 둔다.
  // 동기화가 성공하면 메인이 firstSync를 false로 바꾸는데, 그때 화면이 사라지면
  // 결과('가져왔습니다')와 '시작하기'를 볼 수 없다. 그래서 한 번 열면 닫을 때까지 유지한다
  const [openedFirstSync, setOpenedFirstSync] = useState(false)
  const [closedFirstSync, setClosedFirstSync] = useState(false)

  // 먼저 구독하고 현재 상태를 읽는다. 자동 로그인이 끝나는 순간을 놓치지 않기 위해서다
  useEffect(() => {
    const unsubscribe = window.baro.onAuthChanged(setAuth)
    window.baro.getAuthStatus().then(setAuth, () => undefined)
    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = window.baro.onSyncChanged(setSync)
    window.baro.getSyncState().then(setSync, () => undefined)
    return unsubscribe
  }, [])

  // 서버가 '아직 한 번도 동기화하지 않았다'고 하면 첫 동기화 화면을 연다
  useEffect(() => {
    if (sync?.firstSync === true) setOpenedFirstSync(true)
  }, [sync?.firstSync])

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
  function screen() {
  if (!auth || auth.restoring) return <Loading />

  if (auth.session) {
    // SCR-02. 서버 lastSyncedAt이 null인 계정에만 열린다. 동기화가 끝나 firstSync가 false가 돼도
    // 결과를 보여줘야 하므로, 사용자가 '시작하기'·'나중에 하기'를 누를 때까지 닫지 않는다
    if (sync && openedFirstSync && !closedFirstSync) {
      return <SyncScreen sync={sync} onSkip={() => setClosedFirstSync(true)} />
    }

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

  // 대량 삭제 확인은 어느 화면 위에도 떠야 한다. 자동 동기화는 홈에서도 일어나고,
  // 그때 모달이 뜨지 않으면 메인 프로세스가 답을 영원히 기다린다(DESK-03)
  return (
    <>
      {screen()}
      {sync?.phase === 'needs_confirm' && sync.confirm && <MassDeleteModal details={sync.confirm} />}
    </>
  )
}
