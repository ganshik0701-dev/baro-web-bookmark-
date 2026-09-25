// 아이콘 하나 (SCR-03). 클릭하면 기본 브라우저로 연다(OPEN-01). 우클릭·Shift+F10·메뉴 키는 보조 메뉴(OPEN-03).
// 아이콘 그리는 규칙(글자 타일 → 파비콘)은 TileIcon에 있다.
import { memo, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import type { Bookmark } from '@baro/shared'
import { tileLabel } from '../lib/tile'
import TileIcon from './TileIcon'

type Props = {
  bookmark: Bookmark
  onOpen: (bookmark: Bookmark) => void
  /** 보조 메뉴. 키보드로 열었으면 타일 아래 좌표(창 기준), 마우스면 좌표 없음(메인이 마우스 위치에 띄운다) */
  onMenu: (bookmark: Bookmark, at: { x: number; y: number } | null) => void
}

/** 브라우저가 contextmenu로 바꿔 주는 키. 이 키 뒤에 오는 contextmenu는 키보드로 연 것이다 */
function isMenuKey(e: KeyboardEvent): boolean {
  return e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')
}

function BookmarkTile({ bookmark, onOpen, onMenu }: Props) {
  const label = tileLabel(bookmark.title, bookmark.url)

  const fromKeyboard = useRef(false)
  const openMenu = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    const keyboard = fromKeyboard.current
    fromKeyboard.current = false
    // 키보드로 열면 Chromium은 이벤트 좌표로 타일 한가운데를 준다(실제 확인). 그대로 쓰면 메뉴가 타일을 가리므로
    // 타일 왼쪽 아래를 넘긴다. 마우스면 좌표 없이 보내 메인이 포인터 자리에 띄운다
    const r = e.currentTarget.getBoundingClientRect()
    onMenu(bookmark, keyboard ? { x: r.left, y: r.bottom } : null)
  }

  return (
    <button
      type="button"
      className="tile"
      title={`${label}\n${bookmark.url}`}
      onClick={() => onOpen(bookmark)}
      onKeyDown={(e) => {
        if (!isMenuKey(e)) return
        // 키를 누르고 있으면 자동 반복 keydown마다 contextmenu가 다시 생겨 메뉴가 계속 열린다. 첫 입력만 받는다
        if (e.repeat) e.preventDefault()
        else fromKeyboard.current = true
      }}
      onContextMenu={openMenu}
    >
      <TileIcon title={bookmark.title} url={bookmark.url} iconUrl={bookmark.iconUrl} />
      <span className="tile-label">{label}</span>
    </button>
  )
}

// 목록을 다시 불러와도 바뀌지 않은 타일은 다시 그리지 않는다
export default memo(BookmarkTile)
