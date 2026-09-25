// 아이콘 타일 (SCR-03 그리드, SCR-04 미리보기가 같이 쓴다).
// 글자 타일을 먼저 그리고, 파비콘이 제대로 불러와진 뒤에만 파비콘 타일로 바꾼다.
// 그래서 오프라인이거나 실패해도 깨진 이미지가 보이지 않고, 두 타일은 크기가 같아 줄이 흔들리지 않는다.
// 크기는 부모가 정한 --tile-size를 따른다.
import { useState } from 'react'
import { faviconUrl, isUsableFavicon, tileColor, tileLetter } from '../lib/tile'

type Props = { title: string; url: string; iconUrl: string | null }

type IconState = { src: string | null; status: 'loading' | 'ok' | 'failed' }

export default function TileIcon({ title, url, iconUrl }: Props) {
  const src = faviconUrl(iconUrl, url)
  const [icon, setIcon] = useState<IconState>({ src, status: src ? 'loading' : 'failed' })
  // 주소가 바뀌면(수정·동기화·모달 입력) 처음부터 다시 불러온다
  if (icon.src !== src) setIcon({ src, status: src ? 'loading' : 'failed' })

  const showFavicon = icon.status === 'ok'

  return (
    <span
      className={`tile-icon ${showFavicon ? 'is-favicon' : 'is-letter'}`}
      style={showFavicon ? undefined : { background: `var(--tile-${tileColor(url)})` }}
      aria-hidden="true"
    >
      {!showFavicon && tileLetter(title, url)}
      {src && icon.status !== 'failed' && (
        <img
          className="tile-favicon"
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          referrerPolicy="no-referrer"
          onLoad={(e) => setIcon({ src, status: isUsableFavicon(e.currentTarget.naturalWidth) ? 'ok' : 'failed' })}
          onError={() => setIcon({ src, status: 'failed' })}
        />
      )}
    </span>
  )
}
