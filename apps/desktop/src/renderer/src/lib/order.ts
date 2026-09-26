// 목록 순서 (docs/01-spec.md '정렬 규칙', docs/03-api.md GET /bookmarks). 순수 함수라 단위 테스트로 확인한다.
// 정렬은 앱 한 곳(여기)에서만 한다. 서버는 기본 순서(최근 추가순) 하나만 돌려준다.
import type { Bookmark } from '@baro/shared'
import { tileLabel } from './tile'

/** 드롭다운에 두는 정렬. custom(사용자 지정)은 드래그(SEARCH-06)와 함께 붙인다 */
export const SORT_OPTIONS = ['created_desc', 'visits_30d', 'visited_desc', 'title_asc'] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

/** 드롭다운 문구와 섹션 이름 (시안 메인 보드) */
export const SORT_LABELS: Record<SortOption, { option: string; section: string }> = {
  created_desc: { option: '최근 추가순', section: '최근 추가순' },
  visits_30d: { option: '자주 방문순 · 최근 30일', section: '자주 방문 · 최근 30일' },
  visited_desc: { option: '최근 방문순', section: '최근 방문순' },
  title_asc: { option: '이름순', section: '이름순' }
}

/** 저장된 값(profiles.sort_option 등)을 드롭다운 값으로. custom이나 모르는 값은 최근 추가순 */
export function toSortOption(value: unknown): SortOption {
  return (SORT_OPTIONS as readonly unknown[]).includes(value) ? (value as SortOption) : 'created_desc'
}

type Compare = (a: Bookmark, b: Bookmark) => number

/** 문자열 그대로 비교. id(Postgres uuid 순서 = 소문자 16진 문자열 순서)와 ISO 시각에 쓴다 */
const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const newestAdded: Compare = (a, b) => byString(b.createdAt, a.createdAt)
const idAsc: Compare = (a, b) => byString(a.id, b.id)
// 한국어 순서, 숫자는 크기대로('강의 2' < '강의 10'), 대소문자·악센트는 구분하지 않는다
const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' })

/** 고른 기준. 방문 기록이 없는 것끼리는 최근 추가순으로 떨어진다(id로만 끊으면 무작위처럼 보인다) */
const BY: Record<SortOption, Compare[]> = {
  created_desc: [newestAdded],
  visits_30d: [(a, b) => b.recentVisits - a.recentVisits, (a, b) => b.clickCount - a.clickCount, newestAdded],
  visited_desc: [
    // 방문 안 한 것(null)은 뒤로
    (a, b) => (a.lastVisitedAt === null ? 1 : 0) - (b.lastVisitedAt === null ? 1 : 0),
    (a, b) => byString(b.lastVisitedAt ?? '', a.lastVisitedAt ?? ''),
    newestAdded
  ],
  // 화면에 보이는 이름(제목이 비면 호스트)으로
  title_asc: [(a, b) => collator.compare(tileLabel(a.title, a.url), tileLabel(b.title, b.url))]
}

/**
 * 고정 먼저 → 고른 기준 → 같으면 id 오름차순. 원본 배열은 바꾸지 않는다.
 * 한계: 응답 시각은 밀리초까지라, DB에서 마이크로초만 다른 두 행은 여기서 다음 기준으로 넘어간다
 */
export function sortBookmarks(list: Bookmark[], option: SortOption): Bookmark[] {
  const rules: Compare[] = [(a, b) => Number(b.isPinned) - Number(a.isPinned), ...BY[option], idAsc]
  return [...list].sort((a, b) => {
    for (const rule of rules) {
      const r = rule(a, b)
      if (r !== 0) return r
    }
    return 0
  })
}

/**
 * 서버 GET /bookmarks와 같은 순서(고정 먼저, 최근 추가순, id). 캐시는 이 순서로 둔다.
 * 캐시를 직접 고칠 때(고정·수정·추가) 이 순서로 다시 세우고, 화면은 그 위에서 고른 정렬로 다시 센다
 */
export function orderLikeServer(list: Bookmark[]): Bookmark[] {
  return sortBookmarks(list, 'created_desc')
}
