// 상단바 계정 버튼과 작은 메뉴 (SCR-03). SCR-05 설정 화면이 생기면 그리로 옮긴다.
// 방향키로 고르는 메뉴(role="menu")가 아니라 '펼치기' 버튼이다. 안에는 글과 로그아웃 버튼 하나뿐이라서다
import { useEffect, useRef, useState } from 'react'
import type { AuthSession } from '@baro/shared'

type Props = {
  session: AuthSession
  waitingLogout: boolean
  onLogout: () => void
}

export default function AccountMenu({ session, waitingLogout, onLogout }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const initial = session.email?.trim().charAt(0).toLocaleUpperCase('ko') || '?'

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
        aria-label="계정"
        aria-expanded={open}
        aria-controls="account-panel"
        onClick={() => setOpen((v) => !v)}
      >
        {initial}
      </button>
      {open && (
        <div id="account-panel" className="account-panel" role="group" aria-label="계정">
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
