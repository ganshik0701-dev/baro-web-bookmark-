// 사이드바 전체 / 고정됨 / 최근 추가 (docs/01-spec.md '사이드바 규칙')
import { describe, expect, it } from 'vitest'
import type { Bookmark } from '@baro/shared'
import { filterView, viewCounts, viewItemName } from '../src/renderer/src/lib/view'

const NOW = Date.parse('2026-09-28T12:00:00.000Z')
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString()
const bm = (id: string, createdAt: string, isPinned = false) => ({ id, createdAt, isPinned }) as Bookmark

const LIST = [
  bm('new', daysAgo(1)),
  bm('edge', daysAgo(30)),
  bm('old', daysAgo(31)),
  bm('oldPinned', daysAgo(400), true),
  bm('newPinned', daysAgo(2), true)
]
const ids = (l: Bookmark[]) => l.map((b) => b.id)

describe('filterView', () => {
  it('전체는 그대로(순서 유지)', () => {
    expect(ids(filterView(LIST, 'all', NOW))).toEqual(['new', 'edge', 'old', 'oldPinned', 'newPinned'])
  })

  it('고정됨은 isPinned만', () => {
    expect(ids(filterView(LIST, 'pinned', NOW))).toEqual(['oldPinned', 'newPinned'])
  })

  it('최근 추가는 30일 안(30일째 포함, 31일은 빠짐). 고정 여부와 상관없이', () => {
    expect(ids(filterView(LIST, 'recent', NOW))).toEqual(['new', 'edge', 'newPinned'])
  })
})

describe('viewCounts', () => {
  it('항목별 개수', () => {
    expect(viewCounts(LIST, new Set(), NOW)).toEqual({ all: 5, pinned: 2, recent: 3 })
  })

  it('지우는 중인 것은 빼고 센다', () => {
    expect(viewCounts(LIST, new Set(['newPinned']), NOW)).toEqual({ all: 4, pinned: 1, recent: 2 })
  })
})

describe('viewItemName (사이드바 스크린리더 이름·툴팁)', () => {
  it('받은 목록이 있으면 "이름 N개"', () => {
    const counts = { all: 111, pinned: 4, recent: 12 }
    expect(viewItemName('all', counts)).toBe('전체 111개')
    expect(viewItemName('pinned', counts)).toBe('고정됨 4개')
    expect(viewItemName('recent', counts)).toBe('최근 추가 12개')
  })

  it('받은 목록이 비었으면 0은 진짜 값이라 0개', () => {
    expect(viewItemName('all', viewCounts([], new Set(), NOW))).toBe('전체 0개')
  })

  it('받은 목록이 없으면(null) 이름만. "0개"로 읽히지 않게', () => {
    expect(viewItemName('all', null)).toBe('전체')
    expect(viewItemName('pinned', null)).toBe('고정됨')
    expect(viewItemName('recent', null)).toBe('최근 추가')
  })
})
