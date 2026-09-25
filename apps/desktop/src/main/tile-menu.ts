// OPEN-03 보조 메뉴의 항목 (docs/01-spec.md '열기와 보조 메뉴 규칙').
// 무엇을 보여줄지만 정하는 순수 함수다(electron을 import하지 않아 단위 테스트로 확인한다).
// 띄우기(Menu.popup)는 index.ts가 한다.
import type { BookmarkSource } from '@baro/shared'

export type TileMenuChoice = 'pin' | 'unpin' | 'edit' | 'delete'

export type TileMenuInput = { isPinned: boolean; source: BookmarkSource }

export type TileMenuItem =
  | { kind: 'action'; choice: TileMenuChoice; label: string; enabled: boolean }
  | { kind: 'note'; label: string }
  | { kind: 'separator' }

/** 크롬에서 온 것. 바로에서 지워도 다음 동기화에 되살아나고, 고쳐도 크롬 값으로 되돌아가므로 수정·삭제를 막는다 */
export function isFromChrome(source: BookmarkSource): boolean {
  return source === 'app_sync' || source === 'ext_sync'
}

export function tileMenuItems({ isPinned, source }: TileMenuInput): TileMenuItem[] {
  const fromChrome = isFromChrome(source)
  const items: TileMenuItem[] = [
    isPinned
      ? { kind: 'action', choice: 'unpin', label: '고정 해제', enabled: true }
      : { kind: 'action', choice: 'pin', label: '고정', enabled: true },
    { kind: 'action', choice: 'edit', label: '수정', enabled: !fromChrome },
    { kind: 'separator' },
    { kind: 'action', choice: 'delete', label: '삭제', enabled: !fromChrome }
  ]
  // 막은 이유를 바로 아래에 비활성 줄로 보여준다(누를 수 없는 안내)
  if (fromChrome) items.push({ kind: 'note', label: '크롬에서 고치거나 지우면 다음 동기화 때 반영됩니다' })
  return items
}

/** 렌더러가 보낸 값을 확인한다. 모양이 다르면 null(메뉴를 띄우지 않는다) */
export function parseTileMenuInput(raw: unknown): (TileMenuInput & { x?: number; y?: number }) | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const sources: BookmarkSource[] = ['manual', 'app_sync', 'ext_sync', 'html_import']
  if (typeof r.isPinned !== 'boolean' || !sources.includes(r.source as BookmarkSource)) return null
  const pos = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined)
  return { isPinned: r.isPinned, source: r.source as BookmarkSource, x: pos(r.x), y: pos(r.y) }
}
