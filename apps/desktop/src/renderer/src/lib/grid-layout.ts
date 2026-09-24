// 창 너비 → 열 수·아이콘 크기 (docs/04-design.md '그리드').
// CSS 변수는 @media 조건에 쓸 수 없어서 tokens.css의 값을 JS가 읽어 정한다.
// 고칠 곳은 tokens.css 하나다(--grid-bp-*, --grid-cols-*, --tile-size-*).

export type GridTokens = {
  bpSm: number
  bpMd: number
  cols: { sm: number; md: number; lg: number }
  tile: { sm: number; md: number; lg: number }
}

export type GridLayout = { size: 'sm' | 'md' | 'lg'; cols: number; tile: number }

/** 토큰을 못 읽었을 때(값 오타 등)의 기본값. docs/04-design.md 그리드 표와 같다 */
export const DEFAULT_GRID: GridTokens = {
  bpSm: 800,
  bpMd: 1100,
  cols: { sm: 6, md: 8, lg: 10 },
  tile: { sm: 56, md: 64, lg: 72 }
}

/** 기준점 '이하'면 그 배치. ~800 → sm, 801~1100 → md, 1101~ → lg */
export function pickLayout(width: number, t: GridTokens): GridLayout {
  const size = width <= t.bpSm ? 'sm' : width <= t.bpMd ? 'md' : 'lg'
  return { size, cols: t.cols[size], tile: t.tile[size] }
}

/** '56px'·'8' 같은 값을 숫자로. 양수가 아니면 대신 fallback */
function num(raw: string, fallback: number): number {
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** tokens.css의 그리드 토큰을 읽는다. 값이 이상하면 그 값만 기본값으로 */
export function readGridTokens(style: Pick<CSSStyleDeclaration, 'getPropertyValue'>): GridTokens {
  const v = (name: string) => style.getPropertyValue(name)
  const d = DEFAULT_GRID
  return {
    bpSm: num(v('--grid-bp-sm'), d.bpSm),
    bpMd: num(v('--grid-bp-md'), d.bpMd),
    cols: {
      sm: Math.round(num(v('--grid-cols-sm'), d.cols.sm)),
      md: Math.round(num(v('--grid-cols-md'), d.cols.md)),
      lg: Math.round(num(v('--grid-cols-lg'), d.cols.lg))
    },
    tile: {
      sm: num(v('--tile-size-sm'), d.tile.sm),
      md: num(v('--tile-size-md'), d.tile.md),
      lg: num(v('--tile-size-lg'), d.tile.lg)
    }
  }
}
