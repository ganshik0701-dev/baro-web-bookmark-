// 메인 그리드의 왼쪽 사이드바 (docs/01-spec.md '사이드바 규칙', 시안 '3 · 메인 그리드').
// 로고 / 북마크 추가 / 전체·고정됨·최근 추가 / (아래) 동기화 시각·지금 동기화·설정.
// 그룹 목록과 "그룹" 제목은 두지 않는다(GROUP-01~02, v1.1).
import type { AuthSession } from '@baro/shared'
import { relativeTime } from '../lib/relative-time'
import { useNow } from '../lib/use-now'
import { VIEW_LABELS, VIEWS, type View } from '../lib/view'
import type { SyncState } from '../types'
import AccountMenu from './AccountMenu'

type Props = {
  view: View
  counts: Record<View, number>
  onView: (view: View) => void
  onAdd: () => void
  sync: SyncState | null
  syncing: boolean
  session: AuthSession
  waitingLogout: boolean
  onLogout: () => void
  /** 모달이 열린 동안 Tab·클릭이 닿지 않게 */
  inert?: boolean
}

export default function Sidebar({ view, counts, onView, onAdd, sync, syncing, session, waitingLogout, onLogout, inert }: Props) {
  const now = useNow(30_000)
  const syncedAt = sync?.lastSyncedAt ? `${relativeTime(sync.lastSyncedAt, now)} 동기화` : '아직 동기화하지 않음'
  const profile = sync?.profile ? `크롬 프로필 ${sync.profile.displayName ?? sync.profile.name}` : null

  return (
    <nav className="sidebar" aria-label="바로" inert={inert}>
      <div className="sidebar-logo">
        <span className="sidebar-mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
            <path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />
          </svg>
        </span>
        <span className="sidebar-name">바로</span>
      </div>

      <button type="button" className="button-primary sidebar-add" onClick={onAdd}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        북마크 추가
      </button>

      <ul className="sidebar-views">
        {VIEWS.map((v) => (
          <li key={v}>
            <button
              type="button"
              className="sidebar-item"
              aria-pressed={view === v}
              onClick={() => onView(v)}
            >
              <span>{VIEW_LABELS[v].label}</span>
              <span className="sidebar-count">{counts[v]}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-foot">
        <div className="sidebar-sync">
          <span className="sidebar-sync-text">
            <span className="sidebar-sync-time">{syncing ? '동기화하는 중…' : syncedAt}</span>
            {profile && <span className="sidebar-sync-profile">{profile}</span>}
          </span>
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label="지금 동기화"
            title="지금 동기화"
            onClick={() => void window.baro.syncNow()}
            disabled={syncing}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.3-5.6" />
              <path d="M20 4v5h-5" />
            </svg>
          </button>
        </div>
        {/* 임시: 설정 화면(SCR-05, 디자인 교체 6단계) 전까지 '설정'은 예전 계정 패널(이메일·로그아웃)을 연다 */}
        <AccountMenu session={session} waitingLogout={waitingLogout} onLogout={onLogout} />
      </div>
    </nav>
  )
}
