// SEARCH-04 정렬 4종 (docs/01-spec.md '정렬 규칙'). 고정은 어떤 정렬에서도 맨 앞(BM-07)
import { describe, expect, it } from 'vitest'
import type { Bookmark } from '@baro/shared'
import { SORT_OPTIONS, sortBookmarks, toSortOption } from '../src/renderer/src/lib/order'

type Over = Partial<Bookmark> & { id: string }
const bm = (o: Over): Bookmark => ({
  title: o.id,
  url: `https://${o.id}.example.com/`,
  iconUrl: null,
  groupId: null,
  tags: [],
  isPinned: false,
  position: 1,
  source: 'manual',
  clickCount: 0,
  recentVisits: 0,
  lastVisitedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...o
})
const ids = (list: Bookmark[]) => list.map((b) => b.id)

const T = (day: number) => `2026-09-${String(day).padStart(2, '0')}T00:00:00.000Z`
const LIST = [
  bm({ id: 'a', title: '강의 10', createdAt: T(1), recentVisits: 3, clickCount: 3, lastVisitedAt: T(20) }),
  bm({ id: 'b', title: '강의 2', createdAt: T(2), recentVisits: 1, clickCount: 9, lastVisitedAt: T(25) }),
  bm({ id: 'c', title: 'apple', createdAt: T(3) }),
  bm({ id: 'd', title: 'Banana', createdAt: T(4), recentVisits: 1, clickCount: 1, lastVisitedAt: T(10) }),
  bm({ id: 'e', title: '가나다', createdAt: T(5) })
]

describe('sortBookmarks', () => {
  it('최근 추가순: 추가 시각 최신', () => {
    expect(ids(sortBookmarks(LIST, 'created_desc'))).toEqual(['e', 'd', 'c', 'b', 'a'])
  })

  it('자주 방문순: 30일 방문 수 → 전체 방문 수 → 방문 없는 것끼리는 최근 추가순', () => {
    // b와 d는 30일 1회로 같고 전체 방문 수(9 > 1)로 갈린다. c·e는 0회라 최근 추가순(e가 먼저)
    expect(ids(sortBookmarks(LIST, 'visits_30d'))).toEqual(['a', 'b', 'd', 'e', 'c'])
  })

  it('자주 방문순은 전체 방문 수가 많아도 최근 30일이 적으면 뒤', () => {
    const list = [bm({ id: 'old', recentVisits: 0, clickCount: 100 }), bm({ id: 'new', recentVisits: 1, clickCount: 1 })]
    expect(ids(sortBookmarks(list, 'visits_30d'))).toEqual(['new', 'old'])
  })

  it('최근 방문순: 마지막 방문 최신, 방문 안 한 것은 뒤(그 안에서 최근 추가순)', () => {
    expect(ids(sortBookmarks(LIST, 'visited_desc'))).toEqual(['b', 'a', 'd', 'e', 'c'])
  })

  it('이름순: 한국어 규칙, 숫자는 크기대로, 대소문자 무시', () => {
    const sorted = sortBookmarks(LIST, 'title_asc').map((b) => b.title)
    expect(sorted.indexOf('강의 2')).toBeLessThan(sorted.indexOf('강의 10'))
    expect(sorted.indexOf('apple')).toBeLessThan(sorted.indexOf('Banana'))
    expect(sorted.indexOf('가나다')).toBeLessThan(sorted.indexOf('강의 2'))
  })

  it('이름순: 제목이 비면 화면에 보이는 호스트로', () => {
    const list = [bm({ id: 'z', title: '', url: 'https://zeta.com/' }), bm({ id: 'm', title: 'mango' })]
    expect(ids(sortBookmarks(list, 'title_asc'))).toEqual(['m', 'z'])
  })

  it.each(SORT_OPTIONS)('%s: 고정은 늘 맨 앞(고정끼리도 같은 기준)', (option) => {
    const list = LIST.map((b) => (b.id === 'c' || b.id === 'a' ? { ...b, isPinned: true } : b))
    const sorted = sortBookmarks(list, option)
    expect(sorted.slice(0, 2).every((b) => b.isPinned)).toBe(true)
    expect(sorted.slice(2).every((b) => !b.isPinned)).toBe(true)
  })

  it.each(SORT_OPTIONS)('%s: 기준이 모두 같으면 id 오름차순, 들어온 순서와 상관없이 같다', (option) => {
    const same = ['q', 'p', 'r'].map((id) => bm({ id, title: '같음' }))
    expect(ids(sortBookmarks(same, option))).toEqual(['p', 'q', 'r'])
    expect(ids(sortBookmarks([...same].reverse(), option))).toEqual(['p', 'q', 'r'])
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const copy = [...LIST]
    sortBookmarks(LIST, 'title_asc')
    expect(LIST).toEqual(copy)
  })
})

describe('toSortOption', () => {
  it.each([
    ['visits_30d', 'visits_30d'],
    ['custom', 'created_desc'],
    ['없는값', 'created_desc'],
    [undefined, 'created_desc']
  ])('%j → %s', (value, expected) => {
    expect(toSortOption(value)).toBe(expected)
  })
})
