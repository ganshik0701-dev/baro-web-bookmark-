// 메인 그리드의 왼쪽 사이드바 (docs/01-spec.md '사이드바 규칙', 시안 '3 · 메인 그리드').
// 로고 / 북마크 추가 / 전체·고정됨·최근 추가 / (아래) 동기화 시각·지금 동기화·설정.
// 그룹 목록과 "그룹" 제목은 두지 않는다(GROUP-01~02, v1.1).
// 접으면 64px에 아이콘만 남는다(누를 때만 접힌다. 글자·개수는 aria-label과 title로)
import { useEffect, useRef, type ReactNode } from 'react'
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
  collapsed: boolean
  onToggle: () => void
  /** 모달이 열린 동안 Tab·클릭이 닿지 않게 */
  inert?: boolean
}

// 인라인 stroke SVG (docs/04-design.md '접힌 사이드바의 아이콘')
const ICON: Record<View, ReactNode> = {
  // 네모 네 칸
  all: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  // 핀('고정됨' 섹션 제목의 것과 같은 모양)
  pinned: (
    <>
      <path d="M9.6 3.6h4.8l-.72 6.24 3.72 3.12H6.6l3.72-3.12z" />
      <path d="M12 12.96V20.4" />
    </>
  ),
  // 시계
  recent: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  )
}

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export default function Sidebar(props: Props) {
  const { view, counts, onView, onAdd, sync, syncing, session, waitingLogout, onLogout, collapsed, onToggle, inert } = props
  const now = useNow(30_000)
  const syncedAt = sync?.lastSyncedAt ? `${relativeTime(sync.lastSyncedAt, now)} 동기화` : '아직 동기화하지 않음'
  const profile = sync?.profile ? `크롬 프로필 ${sync.profile.displayName ?? sync.profile.name}` : null
  // 접혔을 때 동기화 버튼이 시각·프로필을 대신 말한다
  const syncLabel = collapsed ? [syncing ? '동기화하는 중' : syncedAt, profile, '지금 동기화'].filter(Boolean).join(' · ') : '지금 동기화'

  // 접기 버튼은 펼침(로고 줄 안)과 접힘(맨 위)에서 자리가 달라 새로 만들어진다.
  // 키보드로 눌렀을 때 포커스가 사라지지 않게, 누른 뒤에는 새 버튼으로 포커스를 옮긴다
  const toggleRef = useRef<HTMLButtonElement>(null)
  const refocusToggle = useRef(false)
  useEffect(() => {
    if (!refocusToggle.current) return
    refocusToggle.current = false
    toggleRef.current?.focus()
  }, [collapsed])

  const toggle = (
    <button
      ref={toggleRef}
      type="button"
      className="sidebar-icon-button sidebar-toggle"
      aria-label={collapsed ? '사이드바 펴기' : '사이드바 접기'}
      title={collapsed ? '사이드바 펴기' : '사이드바 접기'}
      aria-expanded={!collapsed}
      onClick={() => {
        refocusToggle.current = true
        onToggle()
      }}
    >
      <Icon>{collapsed ? <path d="M7 6l6 6-6 6M13 6l6 6-6 6" /> : <path d="M17 6l-6 6 6 6M11 6l-6 6 6 6" />}</Icon>
    </button>
  )

  return (
    <nav className={`sidebar${collapsed ? ' is-collapsed' : ''}`} aria-label="바로" inert={inert}>
      {collapsed ? (
        toggle
      ) : (
        <div className="sidebar-logo">
          <span className="sidebar-mark" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
              <path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />
            </svg>
          </span>
          <span className="sidebar-name">바로</span>
          {toggle}
        </div>
      )}

      <button
        type="button"
        className="button-primary sidebar-add"
        onClick={onAdd}
        aria-label={collapsed ? '북마크 추가' : undefined}
        title={collapsed ? '북마크 추가' : undefined}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {!collapsed && '북마크 추가'}
      </button>

      <ul className="sidebar-views">
        {VIEWS.map((v) => {
          const name = `${VIEW_LABELS[v].label} ${counts[v]}개`
          return (
            <li key={v}>
              <button
                type="button"
                className="sidebar-item"
                aria-pressed={view === v}
                aria-label={collapsed ? name : undefined}
                title={collapsed ? name : undefined}
                onClick={() => onView(v)}
              >
                {collapsed ? (
                  <Icon>{ICON[v]}</Icon>
                ) : (
                  <>
                    <span>{VIEW_LABELS[v].label}</span>
                    <span className="sidebar-count">{counts[v]}</span>
                  </>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="sidebar-foot">
        <div className="sidebar-sync">
          {!collapsed && (
            <span className="sidebar-sync-text">
              <span className="sidebar-sync-time">{syncing ? '동기화하는 중…' : syncedAt}</span>
              {profile && <span className="sidebar-sync-profile">{profile}</span>}
            </span>
          )}
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label={syncLabel}
            title={syncLabel}
            onClick={() => void window.baro.syncNow()}
            disabled={syncing}
          >
            <Icon>
              <path d="M20 12a8 8 0 1 1-2.3-5.6" />
              <path d="M20 4v5h-5" />
            </Icon>
          </button>
        </div>
        {/* 임시: 설정 화면(SCR-05, 디자인 교체 6단계) 전까지 '설정'은 예전 계정 패널(이메일·로그아웃)을 연다 */}
        <AccountMenu session={session} waitingLogout={waitingLogout} onLogout={onLogout} compact={collapsed} />
      </div>
    </nav>
  )
}
