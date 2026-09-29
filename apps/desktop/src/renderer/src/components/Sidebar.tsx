// 메인 그리드의 왼쪽 사이드바 (docs/01-spec.md '사이드바 규칙', 시안 '3 · 메인 그리드').
// 메인: 로고 / 북마크 추가 / 전체·고정됨·최근 추가 / (아래) 동기화 시각·지금 동기화·설정.
// 설정 화면(settings를 넘기면): ← 그리드로 돌아가기 / '설정' / 동기화·확장 프로그램·계정(누르면 그 카드로 스크롤).
// 그룹 목록과 "그룹" 제목은 두지 않는다(GROUP-01~02, v1.1).
// 접으면 64px에 아이콘만 남는다(글자·개수는 aria-label과 title로). 창이 좁으면 저절로 접히고, 그동안 펴기 버튼은 비활성
// 개수는 받은 목록이 있을 때만 보인다(counts가 null이면 숫자·"N개" 모두 없음)
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import type { AuthSession } from '@baro/shared'
import { relativeTime } from '../lib/relative-time'
import { useNow } from '../lib/use-now'
import { VIEW_LABELS, VIEWS, viewItemName, type SidebarCounts, type View } from '../lib/view'
import type { SyncState } from '../types'
import { SETTINGS_LABELS, SETTINGS_SECTIONS, type SettingsSection } from '../lib/settings-sections'

type Props = {
  view: View
  counts: SidebarCounts
  onView: (view: View) => void
  onAdd: () => void
  sync: SyncState | null
  syncing: boolean
  session: AuthSession
  /** 메인의 '설정' 버튼 → 설정 화면 */
  onOpenSettings: () => void
  /** 설정에서 돌아왔을 때 포커스를 받을 '설정' 버튼 */
  settingsButtonRef: RefObject<HTMLButtonElement | null>
  /** 넘기면 설정 화면의 사이드바를 그린다 */
  settings?: { section: SettingsSection; onSection: (section: SettingsSection) => void; onBack: () => void }
  collapsed: boolean
  /** 창이 좁아 접혀 있다(펼 수 없다) */
  narrow: boolean
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

// 설정 화면의 접힌 아이콘(docs/04-design.md '접힌 사이드바의 아이콘')
const SYNC_ICON = (
  <>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 4v5h-5" />
  </>
)
const SETTINGS_ICON: Record<SettingsSection, ReactNode> = {
  sync: SYNC_ICON,
  // 퍼즐 조각
  extension: (
    <path d="M9.5 4.5a2 2 0 0 1 4 0V6H17a1 1 0 0 1 1 1v3.5h-1.5a2 2 0 0 0 0 4H18V18a1 1 0 0 1-1 1h-3.5v-1.5a2 2 0 0 0-4 0V19H6a1 1 0 0 1-1-1v-3.5h1.5a2 2 0 0 0 0-4H5V7a1 1 0 0 1 1-1h3.5z" />
  ),
  // 사람
  account: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.2-3.3 3.9-5 7-5s5.8 1.7 7 5" />
    </>
  )
}
const BACK_ICON = <path d="M15 6l-6 6 6 6" />

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export default function Sidebar(props: Props) {
  const { view, counts, onView, onAdd, sync, syncing, session, onOpenSettings, settingsButtonRef, settings, collapsed, narrow, onToggle, inert } = props
  const initial = session.email?.trim().charAt(0).toLocaleUpperCase('ko') || '?'
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
      title={narrow ? '창이 좁아 펼 수 없습니다' : collapsed ? '사이드바 펴기' : '사이드바 접기'}
      aria-expanded={!collapsed}
      disabled={narrow}
      onClick={() => {
        refocusToggle.current = true
        onToggle()
      }}
    >
      <Icon>{collapsed ? <path d="M7 6l6 6-6 6M13 6l6 6-6 6" /> : <path d="M17 6l-6 6 6 6M11 6l-6 6 6 6" />}</Icon>
    </button>
  )

  if (settings) {
    return (
      <nav className={`sidebar is-settings${collapsed ? ' is-collapsed' : ''}`} aria-label="설정" inert={inert}>
        {collapsed ? (
          <>
            {toggle}
            <button type="button" className="sidebar-item" aria-label="그리드로 돌아가기" title="그리드로 돌아가기" onClick={settings.onBack}>
              <Icon>{BACK_ICON}</Icon>
            </button>
          </>
        ) : (
          <div className="sidebar-back-row">
            <button type="button" className="sidebar-back" onClick={settings.onBack}>
              <Icon size={14}>{BACK_ICON}</Icon>
              그리드로 돌아가기
            </button>
            {toggle}
          </div>
        )}
        {!collapsed && (
          <p className="sidebar-heading" id="sidebar-settings-heading">
            설정
          </p>
        )}
        <ul className="sidebar-views" aria-labelledby={collapsed ? undefined : 'sidebar-settings-heading'}>
          {SETTINGS_SECTIONS.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="sidebar-item"
                aria-current={settings.section === s ? 'true' : undefined}
                aria-label={collapsed ? SETTINGS_LABELS[s] : undefined}
                title={collapsed ? SETTINGS_LABELS[s] : undefined}
                onClick={() => settings.onSection(s)}
              >
                {collapsed ? <Icon>{SETTINGS_ICON[s]}</Icon> : SETTINGS_LABELS[s]}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    )
  }

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
          const name = viewItemName(v, counts)
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
                    {counts && <span className="sidebar-count">{counts[v]}</span>}
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
            <Icon>{SYNC_ICON}</Icon>
          </button>
        </div>
        <button
          ref={settingsButtonRef}
          type="button"
          className="sidebar-settings"
          aria-label={collapsed ? '설정' : undefined}
          title={collapsed ? '설정' : undefined}
          onClick={onOpenSettings}
        >
          <span className="sidebar-initial" aria-hidden="true">
            {initial}
          </span>
          {!collapsed && '설정'}
        </button>
      </div>
    </nav>
  )
}
