import { useLayoutEffect, useState, type RefObject } from 'react'
import { DEFAULT_GRID, pickLayout, readGridTokens, type GridLayout } from './grid-layout'

/** 이 폭에서의 배치. 잴 때마다 tokens.css를 다시 읽는다(토큰을 고치면 크기가 한 번 바뀔 때 반영) */
function layoutFor(width: number): GridLayout {
  return pickLayout(width, readGridTokens(getComputedStyle(document.documentElement)))
}

/**
 * 그리드 영역의 폭으로 배치를 정한다(docs/04-design.md '그리드').
 * 창 너비가 아니라 영역 폭이라, 사이드바를 접고 펼 때도 창 크기와 상관없이 다시 계산된다(ResizeObserver).
 * 첫 그리기 전에 한 번 재서(useLayoutEffect) 잘못된 열 수로 한 번 그려졌다 바뀌는 일이 없게 한다
 */
export function useGridLayout(ref: RefObject<HTMLElement | null>): GridLayout {
  const [layout, setLayout] = useState<GridLayout>(() => pickLayout(Number.POSITIVE_INFINITY, DEFAULT_GRID))
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const apply = (width: number) =>
      setLayout((prev) => {
        const next = layoutFor(width)
        // 같은 배치면 이전 객체를 그대로 둔다(폭이 조금씩 바뀔 때마다 그리드 전체를 다시 그리지 않게)
        return prev.cols === next.cols && prev.tile === next.tile ? prev : next
      })
    apply(el.clientWidth)
    const ro = new ResizeObserver((entries) => apply(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return layout
}
