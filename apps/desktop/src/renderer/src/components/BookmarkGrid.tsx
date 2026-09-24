// 아이콘 그리드 (SCR-03). '고정됨'(없으면 숨김) + 현재 정렬 이름의 섹션.
// 열 수·아이콘 크기는 useGridLayout이 tokens.css에서 읽어 --grid-cols·--tile-size로 넘긴다.
import type { CSSProperties } from 'react'
import type { Bookmark } from '@baro/shared'
import { useGridLayout } from '../lib/use-grid-layout'
import BookmarkTile from './BookmarkTile'

type Props = {
  bookmarks: Bookmark[]
  onOpen: (bookmark: Bookmark) => void
}

// 지금은 정렬이 하나뿐이다. SEARCH-04에서 고른 정렬의 이름이 들어온다
const SORT_TITLE = '최근 추가순'

export default function BookmarkGrid({ bookmarks, onOpen }: Props) {
  const layout = useGridLayout()
  // 서버가 이미 고정을 앞에 두고 보내지만, 섹션은 여기서 나눈다
  const pinned = bookmarks.filter((b) => b.isPinned)
  const rest = bookmarks.filter((b) => !b.isPinned)
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
          <TileList bookmarks={pinned} onOpen={onOpen} />
        </section>
      )}
      {rest.length > 0 && (
        <section className="grid-section" aria-labelledby="grid-rest">
          <h2 id="grid-rest" className="grid-section-title">
            {SORT_TITLE}
          </h2>
          <TileList bookmarks={rest} onOpen={onOpen} />
        </section>
      )}
    </div>
  )
}

function TileList({ bookmarks, onOpen }: Props) {
  return (
    <ul className="grid">
      {bookmarks.map((b) => (
        <li key={b.id}>
          <BookmarkTile bookmark={b} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  )
}
