import { useEffect, useState } from 'react'
import { pickLayout, readGridTokens, type GridLayout } from './grid-layout'

/** 지금 창 너비의 배치. 창 크기가 바뀔 때마다 tokens.css를 다시 읽는다(토큰을 고치면 크기를 한 번 바꿔 반영) */
function current(): GridLayout {
  return pickLayout(window.innerWidth, readGridTokens(getComputedStyle(document.documentElement)))
}

export function useGridLayout(): GridLayout {
  const [layout, setLayout] = useState(current)
  useEffect(() => {
    const onResize = () =>
      setLayout((prev) => {
        const next = current()
        // 같은 배치면 이전 객체를 그대로 둔다(창을 끌 때마다 그리드 전체를 다시 그리지 않게)
        return prev.cols === next.cols && prev.tile === next.tile ? prev : next
      })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return layout
}
