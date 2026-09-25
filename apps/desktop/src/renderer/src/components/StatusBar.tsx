// 하단 상태바 (SCR-03). 왼쪽은 '마지막 동기화 · 크롬 프로필', 오른쪽은 지금 알릴 것 하나.
import { useEffect, useState } from 'react'
import { relativeTime } from '../lib/relative-time'
import type { SyncState } from '../types'

export type StatusMessage = {
  text: string
  error: boolean
  /** 문구 옆 글자 버튼(삭제 '실행 취소') */
  action?: { label: string; onClick: () => void }
}

type Props = {
  sync: SyncState | null
  /** 오른쪽에 띄울 문구. 없으면 비워 둔다 */
  message: StatusMessage | null
  /** 모달이 열린 동안 Tab이 닿지 않게 */
  inert?: boolean
}

/** '3분 전'이 멈춰 있지 않게 30초마다 다시 그린다 */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export default function StatusBar({ sync, message, inert }: Props) {
  const now = useNow(30_000)
  const parts: string[] = []
  if (sync?.lastSyncedAt) parts.push(`마지막 동기화 ${relativeTime(sync.lastSyncedAt, now)}`)
  if (sync?.profile) parts.push(`크롬 프로필 ${sync.profile.displayName ?? sync.profile.name}`)

  return (
    <footer className="statusbar" inert={inert}>
      <span className="statusbar-info">{parts.join(' · ')}</span>
      <span className="statusbar-right">
        {/* 비어 있어도 자리를 둔다(나중에 들어온 문구를 스크린리더가 읽게) */}
        <span role="status" className={`statusbar-message${message?.error ? ' is-error' : ''}`}>
          {message?.text}
        </span>
        {message?.action && (
          <button type="button" className="statusbar-action" onClick={message.action.onClick}>
            {message.action.label}
          </button>
        )}
      </span>
    </footer>
  )
}
