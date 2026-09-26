// SCR-03 메인 그리드 (docs/01-spec.md '메인 그리드 규칙', 시안 project/Main.dc.html).
// 이번 구성: 상단바(동기화·계정) + 그리드 + 상태바. 검색·정렬·추가·그룹 탭은 해당 기능 때 붙인다.
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { AuthSession, AuthStatus, Bookmark } from '@baro/shared'
import AccountMenu from '../components/AccountMenu'
import BookmarkModal, { type BookmarkModalMode } from '../components/BookmarkModal'
import BookmarkGrid from '../components/BookmarkGrid'
import StatusBar, { type StatusMessage } from '../components/StatusBar'
import { usePinMutation, useBookmarks, useSortSetting } from '../lib/queries'
import { useSortSaver } from '../lib/use-sort-saver'
import { SORT_LABELS, SORT_OPTIONS, sortBookmarks, toSortOption, type SortOption } from '../lib/order'
import { buildSearchIndex, filterBookmarks, searchTerms } from '../lib/search'
import { tileLabel } from '../lib/tile'
import { usePendingDelete } from '../lib/use-pending-delete'
import type { SyncState } from '../types'
import { useScreenTitle } from './use-screen-title'

type Props = {
  session: AuthSession
  lastAttempt: AuthStatus['lastAttempt']
  sync: SyncState | null
  waitingLogout: boolean
  onLogout: () => void
}

/** 정렬 저장 실패 문구. 다음에 저장이 성공하면 이 문구일 때만 지운다 */
const SORT_SAVE_FAILED = '정렬을 저장하지 못했습니다'

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
  const sortSetting = useSortSetting()
  // 목록과 저장된 정렬(SEARCH-05)이 둘 다 와야 그린다. 최근 추가순으로 먼저 그렸다가 뒤섞이지 않게
  const showLoading = useDelayed(list.isPending || sortSetting.isPending, 300)
  // 열기·고정·삭제 실패 문구. 다음에 열기·고정이 성공하거나 삭제를 시작하면 지운다(지난 실패가 남아 있지 않게)
  const [notice, setNotice] = useState<string | null>(null)
  const pin = usePinMutation()
  const deletion = usePendingDelete({ onFailed: () => setNotice('삭제하지 못했습니다') })

  // SEARCH-01. 입력칸은 바로 바뀌고, 그리드는 useDeferredValue로 뒤따른다(디바운스 없음).
  // 비교할 글자는 목록이 바뀔 때만 만든다
  const [query, setQuery] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const deferredQuery = useDeferredValue(query)
  const terms = useMemo(() => searchTerms(deferredQuery), [deferredQuery])
  const searchIndex = useMemo(() => buildSearchIndex(list.data ?? []), [list.data])
  // SEARCH-04. 캐시는 서버 기본 순서 그대로 두고, 화면에 그릴 때만 고른 정렬로 다시 센다(거른 뒤 정렬).
  // SEARCH-05. 켤 때 저장된 정렬로 시작한다(custom·모르는 값·불러오기 실패면 최근 추가순, 서버 값은 덮어쓰지 않음).
  // 고르면 화면은 바로 바뀌고 저장은 뒤에서(useSortSaver). 실패해도 이번 실행 동안은 고른 정렬 그대로
  const [chosenSort, setChosenSort] = useState<SortOption | null>(null)
  const sort: SortOption = chosenSort ?? toSortOption(sortSetting.data)
  const saveSort = useSortSaver((saved) =>
    setNotice((n) => (saved ? (n === SORT_SAVE_FAILED ? null : n) : SORT_SAVE_FAILED))
  )
  const chooseSort = (value: SortOption) => {
    setChosenSort(value)
    saveSort(value)
  }
  const results = useMemo(() => sortBookmarks(filterBookmarks(searchIndex, terms), sort), [searchIndex, terms, sort])
  const searching = terms.length > 0
  const noResults = searching && results.every((b) => deletion.hidden.has(b.id))
  const clearSearch = () => {
    setQuery('')
    searchInput.current?.focus()
  }

  // SCR-04 추가·수정 모달. 닫으면 연 버튼(또는 타일)으로 포커스를 돌려준다
  const [modal, setModal] = useState<BookmarkModalMode | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const openModal = useCallback((mode: BookmarkModalMode) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setModal(mode)
  }, [])
  const closeModal = useCallback(() => setModal(null), [])
  // 뒤 화면의 inert가 풀린 다음에 포커스를 돌려준다(닫는 순간에는 아직 inert라 focus가 먹지 않는다)
  useEffect(() => {
    if (modal !== null || !returnFocus.current) return
    returnFocus.current.focus()
    returnFocus.current = null
  }, [modal])

  const syncing = sync?.phase === 'syncing' || sync?.phase === 'needs_confirm'

  // OPEN-01. 기본 브라우저로 연다. 주소 검사(http/https만)는 메인이 한다.
  // 열기에 성공한 뒤에만 방문을 기록한다(OPEN-02). 기록 실패는 알리지 않고, 목록도 다시 받지 않는다
  const open = useCallback((b: Bookmark) => {
    window.baro.openExternal(b.url).then(
      () => {
        setNotice(null)
        void window.baro.recordVisit(b.id)
      },
      () => setNotice('브라우저를 열지 못했습니다')
    )
  }, [])

  // OPEN-03. 메뉴는 메인이 네이티브로 띄우고 고른 항목 이름만 돌려준다. 요청은 여기서 항목별로 한다
  const { mutate: mutatePin } = pin
  const { start: startDelete } = deletion
  const openMenu = useCallback(
    async (b: Bookmark, at: { x: number; y: number } | null) => {
      const choice = await window.baro.showTileMenu({ isPinned: b.isPinned, source: b.source, ...at })
      if (choice === 'edit') {
        openModal({ kind: 'edit', bookmark: b })
      } else if (choice === 'pin' || choice === 'unpin') {
        mutatePin(
          { id: b.id, pinned: choice === 'pin' },
          { onSuccess: () => setNotice(null), onError: () => setNotice('고정하지 못했습니다') }
        )
      } else if (choice === 'delete') {
        setNotice(null)
        startDelete(b)
      }
    },
    [mutatePin, startDelete, openModal]
  )

  // 상태바 오른쪽에는 가장 급한 것 하나만.
  // 삭제 대기가 맨 먼저다: 5초 안에만 누를 수 있으므로 동기화 중에도 '실행 취소'가 보여야 한다
  const refreshFailing = lastAttempt?.kind === 'refresh' && !lastAttempt.ok
  const message: StatusMessage | null = deletion.pending
    ? {
        text: `‘${tileLabel(deletion.pending.title, deletion.pending.url)}’을(를) 지웠습니다`,
        error: false,
        action: { label: '실행 취소', onClick: deletion.undo }
      }
    : syncing
    ? { text: sync?.phase === 'needs_confirm' ? '삭제 확인을 기다리는 중' : '동기화하는 중…', error: false }
    : sync?.phase === 'error' && sync.error
      ? { text: `동기화 실패 · ${sync.error.message}`, error: true }
      : notice
        ? { text: notice, error: true }
        : list.isError && list.data
          ? { text: `목록을 새로 고치지 못했습니다 · ${list.error.message}`, error: true }
          : refreshFailing
            ? { text: `토큰 갱신 실패 · ${lastAttempt.message} (1분 뒤 다시 시도합니다)`, error: true }
            : null

  return (
    <div className="home">
      {/* 모달이 열린 동안 뒤 화면은 inert: Tab·클릭이 닿지 않는다(보이지 않는 타일이 열리지 않게) */}
      <header className="topbar" inert={modal !== null}>
        <label htmlFor="home-search" className="visually-hidden">
          북마크 검색
        </label>
        <div className="search">
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="9" cy="9" r="6" />
            <path d="M13.5 13.5L17 17" />
          </svg>
          <input
            ref={searchInput}
            id="home-search"
            className="search-input"
            type="search"
            placeholder="제목이나 주소로 검색"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="sort-select"
          aria-label="정렬 기준"
          value={sort}
          onChange={(e) => chooseSort(e.target.value as SortOption)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {SORT_LABELS[o].option}
            </option>
          ))}
        </select>
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
        <button type="button" className="button-primary toolbar-button" onClick={() => openModal({ kind: 'add' })}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M10 4v12M4 10h12" />
          </svg>
          북마크 추가
        </button>
        <AccountMenu session={session} waitingLogout={waitingLogout} onLogout={onLogout} />
      </header>

      <main className="home-main" inert={modal !== null}>
        {list.data && !sortSetting.isPending ? (
          list.data.length > 0 ? (
            noResults ? (
              <div className="home-state">
                <p>‘{deferredQuery.trim()}’와 맞는 북마크가 없습니다</p>
                <button type="button" className="button-secondary" onClick={clearSearch}>
                  검색어 지우기
                </button>
              </div>
            ) : (
              <BookmarkGrid
                bookmarks={results}
                hidden={deletion.hidden}
                sortTitle={SORT_LABELS[sort].section}
                searching={searching}
                onOpen={open}
                onMenu={openMenu}
              />
            )
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

      <StatusBar sync={sync} message={message} inert={modal !== null} />

      {modal && (
        <BookmarkModal
          initial={modal}
          bookmarks={list.data ?? []}
          onOpen={open}
          onAdded={() => setQuery('')}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
