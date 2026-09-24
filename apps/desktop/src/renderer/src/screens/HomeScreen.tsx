// SCR-03 메인 그리드 (docs/01-spec.md '메인 그리드 규칙', 시안 project/Main.dc.html).
// 이번 구성: 상단바(동기화·계정) + 그리드 + 상태바. 검색·정렬·추가·그룹 탭은 해당 기능 때 붙인다.
import { useCallback, useEffect, useState } from 'react'
import type { AuthSession, AuthStatus, Bookmark } from '@baro/shared'
import AccountMenu from '../components/AccountMenu'
import BookmarkGrid from '../components/BookmarkGrid'
import StatusBar from '../components/StatusBar'
import { useBookmarks } from '../lib/queries'
import type { SyncState } from '../types'
import { useScreenTitle } from './use-screen-title'

type Props = {
  session: AuthSession
  lastAttempt: AuthStatus['lastAttempt']
  sync: SyncState | null
  waitingLogout: boolean
  onLogout: () => void
}

/** 불러오기가 300ms 안에 끝나면 '불러오는 중'을 띄우지 않는다(깜빡임 방지, SCR-01과 같은 규칙) */
function useDelayed(active: boolean, ms: number): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!active) return setShown(false)
    const id = window.setTimeout(() => setShown(true), ms)
    return () => window.clearTimeout(id)
  }, [active, ms])
  return shown
}

export default function HomeScreen({ session, lastAttempt, sync, waitingLogout, onLogout }: Props) {
  const headingRef = useScreenTitle('바로')
  const list = useBookmarks()
  const showLoading = useDelayed(list.isPending, 300)
  const [openFailed, setOpenFailed] = useState(false)

  const syncing = sync?.phase === 'syncing' || sync?.phase === 'needs_confirm'

  // OPEN-01. 기본 브라우저로 연다. 주소 검사(http/https만)는 메인이 한다.
  // 방문 기록(OPEN-02)은 다음 단계에서 이 뒤에 붙는다(열기를 먼저 하고 기록은 뒤에서)
  const open = useCallback((b: Bookmark) => {
    window.baro.openExternal(b.url).then(
      () => setOpenFailed(false),
      () => setOpenFailed(true)
    )
  }, [])

  // 상태바 오른쪽에는 가장 급한 것 하나만
  const refreshFailing = lastAttempt?.kind === 'refresh' && !lastAttempt.ok
  const message = syncing
    ? { text: sync?.phase === 'needs_confirm' ? '삭제 확인을 기다리는 중' : '동기화하는 중…', error: false }
    : sync?.phase === 'error' && sync.error
      ? { text: `동기화 실패 · ${sync.error.message}`, error: true }
      : openFailed
        ? { text: '브라우저를 열지 못했습니다', error: true }
        : list.isError && list.data
          ? { text: `목록을 새로 고치지 못했습니다 · ${list.error.message}`, error: true }
          : refreshFailing
            ? { text: `토큰 갱신 실패 · ${lastAttempt.message} (1분 뒤 다시 시도합니다)`, error: true }
            : null

  return (
    <div className="home">
      <header className="topbar">
        <h1 ref={headingRef} tabIndex={-1} className="visually-hidden">
          북마크
        </h1>
        <button
          type="button"
          className="button-secondary toolbar-button"
          onClick={() => void window.baro.syncNow()}
          disabled={syncing}
        >
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M16 5.5A7 7 0 1 0 17 10" />
            <path d="M16 2v4h-4" />
          </svg>
          {syncing ? '동기화 중…' : '동기화'}
        </button>
        <AccountMenu session={session} waitingLogout={waitingLogout} onLogout={onLogout} />
      </header>

      <main className="home-main">
        {list.data ? (
          list.data.length > 0 ? (
            <BookmarkGrid bookmarks={list.data} onOpen={open} />
          ) : (
            <div className="home-state">
              <p>아직 북마크가 없습니다. 크롬 북마크를 가져오려면 동기화하세요.</p>
              <button type="button" className="button-primary" onClick={() => void window.baro.syncNow()} disabled={syncing}>
                지금 동기화
              </button>
            </div>
          )
        ) : list.isError ? (
          <div className="home-state" role="alert">
            <p>북마크를 불러오지 못했습니다 · {list.error.message}</p>
            <button type="button" className="button-secondary" onClick={() => void list.refetch()} disabled={list.isFetching}>
              다시 시도
            </button>
          </div>
        ) : (
          <p className="home-state" role="status">
            {showLoading && '북마크를 불러오는 중…'}
          </p>
        )}
      </main>

      <StatusBar sync={sync} message={message} />
    </div>
  )
}
