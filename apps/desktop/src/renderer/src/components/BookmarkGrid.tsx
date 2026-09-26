// 아이콘 그리드 (SCR-03). '고정됨'(없으면 숨김) + 현재 정렬 이름의 섹션.
// 열 수·아이콘 크기는 useGridLayout이 tokens.css에서 읽어 --grid-cols·--tile-size로 넘긴다.
import type { CSSProperties } from 'react'
import type { Bookmark } from '@baro/shared'
import { useGridLayout } from '../lib/use-grid-layout'
import BookmarkTile from './BookmarkTile'

type TileHandlers = {
  onOpen: (bookmark: Bookmark) => void
  onMenu: (bookmark: Bookmark, at: { x: number; y: number } | null) => void
}

type Props = TileHandlers & {
  bookmarks: Bookmark[]
  /** 지우는 중(실행 취소 대기·전송 중)이라 숨길 id. 그 사이 목록을 다시 받아도 보이지 않게 한다 */
  hidden: ReadonlySet<string>
  /** 검색 중이면 아래 섹션 이름이 '검색 결과 N개'(SEARCH-01) */
  searching?: boolean
}

// 지금은 정렬이 하나뿐이다. SEARCH-04에서 고른 정렬의 이름이 들어온다
const SORT_TITLE = '최근 추가순'

export default function BookmarkGrid({ bookmarks, hidden, searching = false, onOpen, onMenu }: Props) {
  const layout = useGridLayout()
  const visible = hidden.size > 0 ? bookmarks.filter((b) => !hidden.has(b.id)) : bookmarks
  // 서버가 이미 고정을 앞에 두고 보내지만, 섹션은 여기서 나눈다
  const pinned = visible.filter((b) => b.isPinned)
  const rest = visible.filter((b) => !b.isPinned)
  const vars = { '--grid-cols': layout.cols, '--tile-size': `${layout.tile}px` } as CSSProperties

  return (
    <div className="grid-area" style={vars} data-grid-size={layout.size}>
      {pinned.length > 0 && (
        <section className="grid-section" aria-labelledby="grid-pinned">
          <h2 id="grid-pinned" className="grid-section-title">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M8 3h4l-.6 5.2 3.1 2.6H5.5l3.1-2.6z" />
              <path d="M10 10.8V17" />
            </svg>
            고정됨
          </h2>
          <TileList bookmarks={pinned} onOpen={onOpen} onMenu={onMenu} />
        </section>
      )}
      {rest.length > 0 && (
        <section className="grid-section" aria-labelledby="grid-rest">
          <h2 id="grid-rest" className="grid-section-title">
            {searching ? `검색 결과 ${visible.length}개` : SORT_TITLE}
          </h2>
          <TileList bookmarks={rest} onOpen={onOpen} onMenu={onMenu} />
        </section>
      )}
    </div>
  )
}

function TileList({ bookmarks, onOpen, onMenu }: TileHandlers & { bookmarks: Bookmark[] }) {
  return (
    <ul className="grid">
      {bookmarks.map((b) => (
        <li key={b.id}>
          <BookmarkTile bookmark={b} onOpen={onOpen} onMenu={onMenu} />
        </li>
      ))}
    </ul>
  )
}
