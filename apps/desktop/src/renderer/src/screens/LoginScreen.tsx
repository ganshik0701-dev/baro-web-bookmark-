// SCR-01 로그인 화면. 시안(docs/04-design.md의 캔버스) '로그인'을 토큰 값으로 옮겼다.
// 시안의 창 상단 표시줄은 그리지 않는다(Windows 기본 창틀을 쓴다).
import type { AuthStatus } from '@baro/shared'
import { useScreenTitle } from './use-screen-title'

type Props = {
  auth: AuthStatus
  waitingLogin: boolean
  waitingLogout: boolean
  onLogin: () => void
  onCancelLogin: () => void
  onLogout: () => void
}

// 미리보기 타일. 색은 --tile-1~8을 차례로 쓴다
const PREVIEW_LETTERS = ['G', 'N', 'F', '유', 'S', 'M', '네', 'V', 'T', '인', 'Z', '토']

export default function LoginScreen({ auth, waitingLogin, waitingLogout, onLogin, onCancelLogin, onLogout }: Props) {
  const headingRef = useScreenTitle('바로 — 로그인')
  // 세션 없이 저장된 로그인만 있다 = 오프라인으로 시작해 자동 로그인을 다시 시도하는 중.
  // 이때는 로그인 대신 로그아웃을 준다(AUTH-03: 공용 PC에서 나중에 연결될 때 자동 로그인되지 않게)
  const reconnecting = auth.stored

  return (
    <div className="login">
      <main className="login-main">
        <div className="login-intro">
          <h1 ref={headingRef} tabIndex={-1} className="login-logo">
            <span className="logo-mark" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 3L5 13h6l-1 8 8-10h-6z" />
              </svg>
            </span>
            바로
          </h1>
          <p className="login-tagline">
            크롬 북마크를
            <br />
            폰 홈 화면처럼 한 번에.
          </p>
          <p className="login-desc">
            Google 계정으로 로그인하면 이 PC의 크롬 북마크를 읽어 아이콘으로 정리합니다. 자주 여는 것부터 볼 수도
            있습니다.
          </p>

          {reconnecting ? (
            <button type="button" className="button-login" onClick={onLogout} disabled={waitingLogout}>
              로그아웃
            </button>
          ) : (
            <button type="button" className="button-login" onClick={onLogin} disabled={waitingLogin}>
              {!waitingLogin && (
                <span className="google-mark" aria-hidden="true">
                  G
                </span>
              )}
              {waitingLogin ? '브라우저에서 로그인하는 중…' : 'Google로 계속하기'}
            </button>
          )}

          {/* 진행 중인 상황. 처음부터 두고 내용만 바꾼다(스크린리더가 바뀐 내용을 읽도록) */}
          <p role="status" className="login-note">
            {statusText(auth, waitingLogin, waitingLogout)}
          </p>
          {waitingLogin && (
            <button type="button" className="button-secondary" onClick={onCancelLogin}>
              취소
            </button>
          )}
          {/* 실패. 바로 읽히도록 alert로 둔다 */}
          <p role="alert" className="login-error">
            {!waitingLogin && errorText(auth)}
          </p>
        </div>

        <section className="login-preview" aria-labelledby="preview-title">
          <h2 id="preview-title" className="preview-title">
            로그인 후 이렇게 보입니다
          </h2>
          {/* 그림일 뿐이라 스크린리더에는 숨긴다 */}
          <div className="preview-grid" aria-hidden="true">
            {PREVIEW_LETTERS.map((letter, i) => (
              <div key={i} className="preview-item">
                <span className="preview-tile" style={{ background: `var(--tile-${(i % 8) + 1})` }}>
                  {letter}
                </span>
                <span className="preview-label" />
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="login-footer">
        바로는 북마크의 제목·주소와 앱에서 연 횟수를 저장합니다. 크롬의 방문 기록이나 비밀번호는 읽지 않습니다.
      </footer>
    </div>
  )
}

function statusText(auth: AuthStatus, waitingLogin: boolean, waitingLogout: boolean): string {
  if (waitingLogin) return '기본 브라우저에서 로그인을 마쳐 주세요. 브라우저 창을 닫았다면 취소를 누르세요.'
  if (waitingLogout) return '로그아웃하는 중…'
  if (auth.stored) return '저장된 로그인으로 다시 연결하는 중… (인터넷 연결 대기)'
  const last = auth.lastAttempt
  // 로그아웃은 됐지만 서버에 알리지 못한 경우. 실패는 아니라서 안내로만 보여준다
  if (last?.kind === 'logout' && last.ok && last.message) return `로그아웃했습니다 · ${last.message}`
  return '기본 브라우저가 열리고, 로그인이 끝나면 앱으로 돌아옵니다. 첫 로그인 시 계정이 자동으로 만들어집니다.'
}

function errorText(auth: AuthStatus): string | null {
  const last = auth.lastAttempt
  if (!last || last.ok) return null
  switch (last.kind) {
    case 'login':
      return `로그인하지 못했습니다 · ${last.message}`
    // 저장된 토큰을 서버가 거절해 지운 경우. 네트워크 오류면 stored가 남아 위의 '다시 연결하는 중'이 보인다
    case 'restore':
      return auth.stored ? null : '저장된 로그인이 만료되었습니다. 다시 로그인해 주세요.'
    case 'refresh':
      return '로그인이 만료되었습니다. 다시 로그인해 주세요.'
    case 'logout':
      // 파일을 지우지 못했다. 다음 실행 때 자동 로그인될 수 있으니 다시 누르게 한다
      return `로그아웃을 마치지 못했습니다 · ${last.message}. 다시 눌러 주세요.`
  }
}
