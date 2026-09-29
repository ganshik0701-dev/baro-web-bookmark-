// 사이드바의 전체 / 고정됨 / 최근 추가 (docs/01-spec.md '사이드바 규칙'). 순수 함수라 단위 테스트로 확인한다.
// 서버 요청 없이 받아 둔 목록을 거른다. 순서: 거르기 → 검색 → 정렬
import type { Bookmark } from '@baro/shared'

export const VIEWS = ['all', 'pinned', 'recent'] as const
export type View = (typeof VIEWS)[number]

/** '최근 추가' 기간. '자주 방문 · 최근 30일'과 같게 둔다 */
export const RECENT_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

/** 이 북마크가 그 항목에 들어가는가. now는 테스트에서 고정한다 */
export function inView(b: Bookmark, view: View, now: number): boolean {
  if (view === 'pinned') return b.isPinned
  // 크롬에서 온 것의 createdAt은 크롬에 추가한 날짜(date_added)다
  if (view === 'recent') return now - Date.parse(b.createdAt) <= RECENT_DAYS * DAY_MS
  return true
}

export function filterView(list: Bookmark[], view: View, now: number): Bookmark[] {
  return view === 'all' ? list : list.filter((b) => inView(b, view, now))
}

/** 사이드바 개수. 지우는 중(실행 취소 대기)인 것은 빼고 센다(화면에 보이는 타일 수와 같게) */
export function viewCounts(list: Bookmark[], hidden: ReadonlySet<string>, now: number): Record<View, number> {
  const counts: Record<View, number> = { all: 0, pinned: 0, recent: 0 }
  for (const b of list) {
    if (hidden.has(b.id)) continue
    counts.all++
    if (inView(b, 'pinned', now)) counts.pinned++
    if (inView(b, 'recent', now)) counts.recent++
  }
  return counts
}

/**
 * 사이드바 문구, 아래 섹션 이름(검색 중이 아닐 때. '전체'는 정렬 이름을 쓴다),
 * 그 항목이 비었을 때 안내(북마크가 아예 없을 때는 원래의 "아직 북마크가 없습니다")
 */
export const VIEW_LABELS: Record<View, { label: string; section: string | null; empty: string | null }> = {
  all: { label: '전체', section: null, empty: null },
  pinned: { label: '고정됨', section: null, empty: '고정된 북마크가 없습니다. 타일을 우클릭해 ‘고정’을 고르세요.' },
  recent: { label: '최근 추가', section: `최근 추가 · ${RECENT_DAYS}일`, empty: `최근 ${RECENT_DAYS}일에 추가한 북마크가 없습니다.` }
}

/** 사이드바 개수. null = 아직 받은 목록이 없다(처음 불러오는 중·처음부터 불러오지 못함). 0과 다르다 */
export type SidebarCounts = Record<View, number> | null

/**
 * 사이드바 항목의 스크린리더 이름·툴팁. "전체 111개"
 * 받은 목록이 없으면 이름만 둔다. "전체 0개"로 읽히면 북마크가 사라진 것처럼 들린다(docs/01-spec.md '사이드바 규칙')
 */
export function viewItemName(view: View, counts: SidebarCounts): string {
  const label = VIEW_LABELS[view].label
  return counts ? `${label} ${counts[view]}개` : label
}
