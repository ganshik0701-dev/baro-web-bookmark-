// 아이콘 하나 (SCR-03). 클릭하면 기본 브라우저로 연다(OPEN-01).
// 글자 타일을 먼저 그리고, 파비콘이 제대로 불러와진 뒤에만 파비콘 타일로 바꾼다.
// 그래서 오프라인이거나 실패해도 깨진 이미지가 보이지 않고, 두 타일은 크기가 같아 줄이 흔들리지 않는다.
import { memo, useState } from 'react'
import type { Bookmark } from '@baro/shared'
import { faviconUrl, isUsableFavicon, tileColor, tileLabel, tileLetter } from '../lib/tile'

type Props = {
  bookmark: Bookmark
  onOpen: (bookmark: Bookmark) => void
}

type IconState = { src: string | null; status: 'loading' | 'ok' | 'failed' }

function BookmarkTile({ bookmark, onOpen }: Props) {
  const src = faviconUrl(bookmark.iconUrl, bookmark.url)
  const [icon, setIcon] = useState<IconState>({ src, status: src ? 'loading' : 'failed' })
  // 주소가 바뀌면(수정·동기화) 처음부터 다시 불러온다
  if (icon.src !== src) setIcon({ src, status: src ? 'loading' : 'failed' })

  const label = tileLabel(bookmark.title, bookmark.url)
  const showFavicon = icon.status === 'ok'

  return (
    <button type="button" className="tile" title={`${label}\n${bookmark.url}`} onClick={() => onOpen(bookmark)}>
      <span
        className={`tile-icon ${showFavicon ? 'is-favicon' : 'is-letter'}`}
        style={showFavicon ? undefined : { background: `var(--tile-${tileColor(bookmark.url)})` }}
        aria-hidden="true"
      >
        {!showFavicon && tileLetter(bookmark.title, bookmark.url)}
        {src && icon.status !== 'failed' && (
          <img
            className="tile-favicon"
            src={src}
            alt=""
            loading="lazy"
            draggable={false}
            referrerPolicy="no-referrer"
            onLoad={(e) =>
              setIcon({ src, status: isUsableFavicon(e.currentTarget.naturalWidth) ? 'ok' : 'failed' })
            }
            onError={() => setIcon({ src, status: 'failed' })}
          />
        )}
      </span>
      <span className="tile-label">{label}</span>
    </button>
  )
}

// 목록을 다시 불러와도 바뀌지 않은 타일은 다시 그리지 않는다
export default memo(BookmarkTile)
