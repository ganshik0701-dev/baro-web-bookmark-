// SCR-05 설정 (docs/01-spec.md '설정 화면 규칙', 시안 '8 · 설정').
// 그리드 본문(.home-body) 위를 덮는 칸이다. 그리드는 뒤에 그대로 있어 검색어·정렬·스크롤이 남는다.
// 카드 셋: 동기화(6-(3)에서 채움) · 확장 프로그램(6-(4)에서 채움) · 계정
import { useEffect, useRef, type RefObject } from 'react'
import type { AuthSession } from '@baro/shared'
import { SETTINGS_LABELS, SETTINGS_SECTIONS, settingsCardId, type SettingsSection } from '../lib/settings-sections'

type Props = {
  session: AuthSession
  waitingLogout: boolean
  onLogout: () => void
  /** 스크롤해서 화면 위쪽에 먼저 보이는 카드가 바뀌면 */
  onVisibleSection: (section: SettingsSection) => void
  /** 사이드바에서 마지막으로 누른 카드. 맨 아래까지 스크롤해 위로 못 올라와도 그 카드를 고른 채로 둔다 */
  clickedSection: RefObject<SettingsSection | null>
}

export default function SettingsScreen({ session, waitingLogout, onLogout, onVisibleSection, clickedSection }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // 창 제목과 포커스. 나갈 때 창 제목을 되돌린다(그리드 쪽은 다시 그려지지 않아 제목을 바꾸지 않는다)
  useEffect(() => {
    const previous = document.title
    document.title = '설정'
    headingRef.current?.focus()
    return () => {
      document.title = previous
    }
  }, [])

  // 화면 위쪽에 먼저 보이는 카드를 사이드바에 알린다
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const top = el.getBoundingClientRect().top
      const cards = SETTINGS_SECTIONS.map((s) => [s, document.getElementById(settingsCardId(s))] as const)
      const visible = (card: HTMLElement | null) => {
        const r = card?.getBoundingClientRect()
        return r ? r.bottom > top + 1 && r.top < el.getBoundingClientRect().bottom : false
      }
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      const clicked = clickedSection.current
      if (atBottom && clicked && visible(document.getElementById(settingsCardId(clicked)))) {
        onVisibleSection(clicked)
        return
      }
      const first = cards.find(([, card]) => (card?.getBoundingClientRect().bottom ?? 0) > top + 1)
      if (first) onVisibleSection(first[0])
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [onVisibleSection, clickedSection])

  return (
    <div ref={scrollRef} className="settings">
      <h1 ref={headingRef} tabIndex={-1} className="settings-title">
        설정
      </h1>

      <section id={settingsCardId('sync')} className="settings-card" aria-labelledby="settings-sync-title">
        <h2 id="settings-sync-title" className="settings-card-title">
          {SETTINGS_LABELS.sync}
        </h2>
      </section>

      <section id={settingsCardId('extension')} className="settings-card" aria-labelledby="settings-extension-title">
        <h2 id="settings-extension-title" className="settings-card-title">
          {SETTINGS_LABELS.extension}
        </h2>
      </section>

      {/* 보드처럼 제목은 보이지 않는다. 스크린리더가 카드 셋을 같은 방식으로 찾도록 안 보이는 제목을 둔다 */}
      <section id={settingsCardId('account')} className="settings-card settings-row" aria-labelledby="settings-account-title">
        <h2 id="settings-account-title" className="visually-hidden">
          {SETTINGS_LABELS.account}
        </h2>
        <span className="settings-text">
          <span className="settings-name settings-account-name">Google 계정 · {session.email ?? '이메일 없음'}</span>
          <span className="settings-detail">
            {session.persisted
              ? '이 PC에 로그인이 저장되어 있습니다.'
              : '로그인을 이 PC에 저장하지 못해 앱을 다시 켜면 로그아웃됩니다.'}
          </span>
        </span>
        <button type="button" className="button-secondary settings-button" onClick={onLogout} disabled={waitingLogout}>
          {waitingLogout ? '로그아웃하는 중…' : '로그아웃'}
        </button>
      </section>
    </div>
  )
}
