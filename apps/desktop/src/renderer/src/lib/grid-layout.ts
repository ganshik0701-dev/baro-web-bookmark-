// 그리드 영역 폭 → 열 수·아이콘 크기 (docs/04-design.md '그리드').
// 기준점 표 대신 칸 최소 너비로 계산한다: 폭이 줄면 한 열씩 줄고(최소 2열), 줄어든 만큼 행이 늘어난다.
// CSS 변수는 @media 조건에 쓸 수 없어서 tokens.css의 값을 JS가 읽어 정한다.
// 고칠 곳은 tokens.css 하나다(--grid-cell-min, --grid-cols-min/-max, --tile-size-min/-max/-ratio, --grid-gap-col).

export type GridTokens = {
  /** 한 칸의 최소 폭(px) */
  cellMin: number
  /** 칸 사이 간격(px). --grid-gap-col */
  gap: number
  colsMin: number
  colsMax: number
  tileMin: number
  tileMax: number
  /** 아이콘 = 칸 폭 × 이 값(범위 안에서) */
  tileRatio: number
}

export type GridLayout = { cols: number; tile: number }

/** 토큰을 못 읽었을 때(값 오타 등)의 기본값. docs/04-design.md 그리드 토큰 표와 같다 */
export const DEFAULT_GRID: GridTokens = {
  cellMin: 88,
  gap: 4,
  colsMin: 2,
  colsMax: 10,
  tileMin: 48,
  tileMax: 64,
  tileRatio: 0.57
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/**
 * 열 수 = ⌊(폭 + 간격) ÷ (칸 최소 너비 + 간격)⌋ 을 열 수 범위로 자른 값.
 * 아이콘 = 칸 폭 × 비율을 반올림해 아이콘 범위로 자른 값(열이 적어 칸이 넓어도 최대 크기를 넘지 않는다)
 */
export function pickLayout(width: number, t: GridTokens): GridLayout {
  const cols = clamp(Math.floor((width + t.gap) / (t.cellMin + t.gap)), t.colsMin, t.colsMax)
  const cell = (width - t.gap * (cols - 1)) / cols
  const tile = clamp(Math.round(cell * t.tileRatio), t.tileMin, t.tileMax)
  return { cols, tile }
}

/** '56px'·'8' 같은 값을 숫자로. 양수가 아니면 대신 fallback */
function num(raw: string, fallback: number): number {
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** tokens.css의 그리드 토큰을 읽는다. 값이 이상하면 그 값만 기본값으로. 범위가 뒤집혀 있으면 그 범위를 기본값으로 */
export function readGridTokens(style: Pick<CSSStyleDeclaration, 'getPropertyValue'>): GridTokens {
  const v = (name: string) => style.getPropertyValue(name)
  const d = DEFAULT_GRID
  let colsMin = Math.round(num(v('--grid-cols-min'), d.colsMin))
  let colsMax = Math.round(num(v('--grid-cols-max'), d.colsMax))
  if (colsMin > colsMax) [colsMin, colsMax] = [d.colsMin, d.colsMax]
  let tileMin = num(v('--tile-size-min'), d.tileMin)
  let tileMax = num(v('--tile-size-max'), d.tileMax)
  if (tileMin > tileMax) [tileMin, tileMax] = [d.tileMin, d.tileMax]
  return {
    cellMin: num(v('--grid-cell-min'), d.cellMin),
    gap: num(v('--grid-gap-col'), d.gap),
    colsMin,
    colsMax,
    tileMin,
    tileMax,
    tileRatio: num(v('--tile-size-ratio'), d.tileRatio)
  }
}
