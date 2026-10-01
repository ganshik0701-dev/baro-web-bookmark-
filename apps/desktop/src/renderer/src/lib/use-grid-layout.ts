import { useLayoutEffect, useState, type RefObject } from 'react'
import { DEFAULT_GRID, pickLayout, readGridTokens, type GridLayout } from './grid-layout'

/** 이 폭에서의 배치. 잴 때마다 tokens.css를 다시 읽는다(토큰을 고치면 크기가 한 번 바뀔 때 반영) */
function layoutFor(width: number): GridLayout {
  return pickLayout(width, readGridTokens(getComputedStyle(document.documentElement)))
}

// 마지막으로 잰 배치. 그리드가 사라졌다 다시 나타날 때(검색 결과 없음 → 지우기 등) 이 값으로 시작한다
let lastLayout: GridLayout | null = null

/**
 * 그리드 영역의 폭으로 배치를 정한다(docs/04-design.md '그리드').
 * 창 너비가 아니라 영역 폭이라, 사이드바를 접고 펼 때도 창 크기와 상관없이 다시 계산된다(ResizeObserver).
 * 폭은 ResizeObserver 콜백에서만 읽는다. 그리드가 나타날 때 바로 clientWidth를 읽으면 막 넣은 타일
 * 1,000개의 레이아웃을 그 자리에서 강제로 하게 된다(8주차 성능 확인: 검색어 지우기 1,000개에서 약 60ms).
 * 다시 나타날 때는 마지막으로 잰 배치로 시작하므로 폭이 그대로면 열 수가 바뀌지 않는다.
 * 콜백 안에서 flushSync로 바로 그리면 'ResizeObserver loop' 오류가 나서(8주차 회귀 확인) 보통의 setState로 둔다
 */
export function useGridLayout(ref: RefObject<HTMLElement | null>): GridLayout {
  const [layout, setLayout] = useState<GridLayout>(() => lastLayout ?? pickLayout(Number.POSITIVE_INFINITY, DEFAULT_GRID))
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const next = layoutFor(entries[0].contentRect.width)
      lastLayout = next
      // 같은 배치면 이전 객체를 그대로 둔다(폭이 조금씩 바뀔 때마다 그리드 전체를 다시 그리지 않게)
      setLayout((prev) => (prev.cols === next.cols && prev.tile === next.tile ? prev : next))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return layout
}
