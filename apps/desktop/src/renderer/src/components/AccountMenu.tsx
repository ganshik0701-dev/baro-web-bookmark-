// 사이드바 아래 '설정' 버튼과 작은 계정 패널 (SCR-03).
// 임시다: 설정 화면(SCR-05, 디자인 교체 6단계)이 생기면 '설정'은 그 화면을 열고, 이 패널은 없앤다.
// 방향키로 고르는 메뉴(role="menu")가 아니라 '펼치기' 버튼이다. 안에는 글과 로그아웃 버튼 하나뿐이라서다
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { AuthSession } from '@baro/shared'

/** 패널과 창 가장자리 사이 최소 여백 */
const EDGE = 8
/** 버튼과 패널 사이 */
const GAP = 8

type Props = {
  session: AuthSession
  waitingLogout: boolean
  onLogout: () => void
  /** 사이드바가 접혔을 때: 이니셜만, 이름은 aria-label·title로 */
  compact?: boolean
}

export default function AccountMenu({ session, waitingLogout, onLogout, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // 패널은 position: fixed다. 사이드바의 overflow(접기 애니메이션·낮은 창 스크롤용)가 사이드바 밖으로 나온 부분을
  // 잘라내서(z-index로는 안 된다) 창 기준으로 띄운다. 위치는 열 때와 창 크기가 바뀔 때 버튼 위치로 다시 잰다
  const [pos, setPos] = useState<CSSProperties | null>(null)
  const initial = session.email?.trim().charAt(0).toLocaleUpperCase('ko') || '?'

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const place = () => {
      const button = buttonRef.current?.getBoundingClientRect()
      const width = panelRef.current?.offsetWidth ?? 0
      if (!button) return
      // 버튼 왼쪽에 맞추되 창 밖으로 나가지 않게(오른쪽이 넘치면 왼쪽으로 민다)
      const left = Math.max(EDGE, Math.min(button.left, window.innerWidth - width - EDGE))
      setPos({ left, bottom: window.innerHeight - button.top + GAP })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  // 열려 있을 때만: Esc로 닫고 버튼으로 포커스를 돌린다, 바깥을 누르면 닫는다
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div className="account" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="account-button"
        aria-expanded={open}
        aria-controls="account-panel"
        aria-label={compact ? '설정' : undefined}
        title={compact ? '설정' : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="account-initial" aria-hidden="true">
          {initial}
        </span>
        {!compact && '설정'}
      </button>
      {open && (
        <div
          ref={panelRef}
          id="account-panel"
          className="account-panel"
          role="group"
          aria-label="계정"
          // 위치를 재기 전 첫 그리기에서는 보이지 않게(자리를 잡은 뒤 보인다)
          style={pos ?? { visibility: 'hidden' }}
        >
          <p className="account-email">{session.email ?? '이메일 없음'}</p>
          <p className="account-note">
            {session.persisted
              ? '이 PC에 로그인이 저장되어 있습니다.'
              : '로그인을 이 PC에 저장하지 못해 앱을 다시 켜면 로그아웃됩니다.'}
          </p>
          <button type="button" className="button-secondary" onClick={onLogout} disabled={waitingLogout}>
            {waitingLogout ? '로그아웃하는 중…' : '로그아웃'}
          </button>
        </div>
      )}
    </div>
  )
}
