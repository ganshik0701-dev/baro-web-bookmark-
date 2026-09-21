// 로그인 후 임시 화면. 메인 그리드(SCR-03, 6주차)가 들어오면 그걸로 바뀐다
import type { AuthSession, AuthStatus } from '@baro/shared'
import DevApiCard from '../components/DevApiCard'
import { useScreenTitle } from './use-screen-title'

type Props = {
  session: AuthSession
  lastAttempt: AuthStatus['lastAttempt']
  waitingLogout: boolean
  onLogout: () => void
}

export default function TempHome({ session, lastAttempt, waitingLogout, onLogout }: Props) {
  const headingRef = useScreenTitle('바로')
  // 갱신이 네트워크 오류로 실패하고 있으면(세션은 유지, 1분마다 재시도) 알려 준다
  const refreshFailing = lastAttempt?.kind === 'refresh' && !lastAttempt.ok

  return (
    <main className="home">
      <h1 ref={headingRef} tabIndex={-1} className="home-logo">
        바로
      </h1>

      <section className="card" aria-labelledby="account-title">
        <h2 id="account-title" className="section-title">
          계정
        </h2>
        <p className="home-email">{session.email ?? '이메일 없음'}</p>
        <p className="caption">
          {session.persisted ? '이 PC에 로그인이 저장되어 있습니다.' : '로그인을 이 PC에 저장하지 못해 앱을 다시 켜면 로그아웃됩니다.'}
        </p>
        <button type="button" className="button-secondary" onClick={onLogout} disabled={waitingLogout}>
          로그아웃
        </button>
        <p role="status" className="card-status">
          {waitingLogout
            ? '로그아웃하는 중…'
            : refreshFailing && `토큰 갱신 실패 · ${lastAttempt.message} (1분 뒤 다시 시도합니다)`}
        </p>
      </section>

      {import.meta.env.DEV && <DevApiCard />}
      <p className="home-note">북마크 화면은 6주차(SCR-03)에 이 자리에 들어옵니다.</p>
    </main>
  )
}
