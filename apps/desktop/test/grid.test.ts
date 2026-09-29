// SCR-03 그리드의 순수 함수: 타일 글자·색·파비콘 주소, 그리드 영역 폭별 배치, 상대 시각, 목록 순서
import { describe, expect, it } from 'vitest'
import type { Bookmark } from '@baro/shared'
import { DEFAULT_GRID, pickLayout, readGridTokens } from '../src/renderer/src/lib/grid-layout'
import { orderLikeServer } from '../src/renderer/src/lib/order'
import { relativeTime } from '../src/renderer/src/lib/relative-time'
import { faviconUrl, isUsableFavicon, tileColor, tileHost, tileLabel, tileLetter } from '../src/renderer/src/lib/tile'

describe('tileLetter', () => {
  it.each([
    ['GitHub', 'https://github.com', 'G'],
    ['github', 'https://github.com', 'G'],
    ['네이버', 'https://naver.com', '네'],
    ['[공지] 모음', 'https://x.com', '공'],
    ['  ✨ Notion', 'https://notion.so', 'N'],
    ['🎉🎉', 'https://party.example.com', 'P'],
    ['', 'https://www.example.com/a', 'E'],
    ['', 'not a url', '?'],
    ['éclair', 'https://x.com', 'É']
  ])('%j (%s) → %s', (title, url, expected) => {
    expect(tileLetter(title, url)).toBe(expected)
  })

  it('조합된 한글(자모 분리 입력)도 한 글자로 자른다', () => {
    const decomposed = '한글'.normalize('NFD')
    expect(tileLetter(decomposed, 'https://x.com').normalize('NFC')).toBe('한')
  })
})

describe('tileHost·tileColor', () => {
  it('www.와 대소문자는 같은 호스트로 본다', () => {
    expect(tileHost('https://WWW.GitHub.com/a?b=1')).toBe('github.com')
    expect(tileColor('https://www.github.com/x')).toBe(tileColor('https://github.com/y'))
  })

  it('1~8 사이, 같은 입력엔 늘 같은 값', () => {
    const hosts = ['github.com', 'naver.com', 'youtube.com', 'notion.so', 'figma.com', 'vercel.com', 'supabase.com', 'mdn.dev']
    for (const h of hosts) {
      const c = tileColor(`https://${h}`)
      expect(c).toBeGreaterThanOrEqual(1)
      expect(c).toBeLessThanOrEqual(8)
      expect(tileColor(`https://${h}`)).toBe(c)
    }
    // 8개 호스트가 한두 색에 몰리지 않는다(해시가 퍼진다)
    expect(new Set(hosts.map((h) => tileColor(`https://${h}`))).size).toBeGreaterThanOrEqual(4)
  })

  it('주소가 이상해도 던지지 않는다', () => {
    expect(tileHost('::')).toBe('')
    expect(tileColor('::')).toBeGreaterThanOrEqual(1)
  })
})

describe('tileLabel', () => {
  it('제목이 비면 호스트', () => {
    expect(tileLabel('  ', 'https://www.example.com/a')).toBe('example.com')
    expect(tileLabel('제목', 'https://example.com')).toBe('제목')
  })
})

describe('faviconUrl', () => {
  it('iconUrl이 있으면 그대로', () => {
    expect(faviconUrl('https://cdn.x.com/i.png', 'https://x.com')).toBe('https://cdn.x.com/i.png')
  })
  it('없으면 Google 파비콘, sz=64 고정, 호스트만 보낸다(경로·쿼리는 보내지 않음)', () => {
    expect(faviconUrl(null, 'https://docs.github.com/a/b?token=secret#x')).toBe(
      'https://www.google.com/s2/favicons?domain=docs.github.com&sz=64'
    )
  })
  it('호스트를 알 수 없으면 null', () => {
    expect(faviconUrl(null, 'nope')).toBeNull()
  })
  it('16px 이하는 쓰지 않는다(Google 기본 아이콘)', () => {
    expect(isUsableFavicon(16)).toBe(false)
    expect(isUsableFavicon(0)).toBe(false)
    expect(isUsableFavicon(32)).toBe(true)
  })
})

describe('pickLayout (docs/04-design.md 그리드 계산)', () => {
  it.each([
    // [그리드 영역 폭, 열, 아이콘]
    [100, 2, 56], // 아주 좁아도 2열(최소), 아이콘은 최소 크기
    [277, 2, 72], // 최소 창 420px(접힘). 칸이 넓어도 아이콘은 최대 72px
    [315, 2, 72], // 3열 바로 아래
    [316, 3, 57], // 3열이 되는 가장 좁은 폭(칸 100px)
    [473, 4, 64], // 800px 창, 사이드바 편 채
    [953, 8, 64], // 1280px 창(보드), 편 채 → 8열 64px
    [973, 9, 58], // 1300px 창, 편 채
    [1157, 10, 62], // 1300px 창, 접힘
    [2000, 10, 72] // 아주 넓어도 10열(최대), 아이콘은 최대 크기
  ])('그리드 영역 폭 %i → %i열 %ipx', (w, cols, tile) => {
    expect(pickLayout(w, DEFAULT_GRID)).toEqual({ cols, tile })
  })
})

describe('readGridTokens', () => {
  const style = (vars: Record<string, string>) => ({ getPropertyValue: (n: string) => vars[n] ?? '' })

  it('tokens.css 값을 숫자로 읽는다', () => {
    const t = readGridTokens(
      style({
        '--grid-cell-min': ' 120px',
        '--grid-gap-col': '10px',
        '--grid-cols-min': '3',
        '--grid-cols-max': '12',
        '--tile-size-min': '50px',
        '--tile-size-max': '80px',
        '--tile-size-ratio': '0.5'
      })
    )
    expect(t).toEqual({ cellMin: 120, gap: 10, colsMin: 3, colsMax: 12, tileMin: 50, tileMax: 80, tileRatio: 0.5 })
    // (650 + 10) ÷ (120 + 10) = 5.07 → 5열, 칸 (650 − 40) ÷ 5 = 122 → 61px
    expect(pickLayout(650, t)).toEqual({ cols: 5, tile: 61 })
  })

  it('없거나 오타인 값은 그 값만 기본값으로', () => {
    const t = readGridTokens(style({ '--grid-cols-max': 'ten', '--tile-size-max': '-3px' }))
    expect(t).toEqual(DEFAULT_GRID)
  })

  it('범위가 뒤집혀 있으면 그 범위를 기본값으로', () => {
    const t = readGridTokens(style({ '--grid-cols-min': '12', '--grid-cols-max': '4', '--tile-size-min': '90px' }))
    expect(t).toEqual(DEFAULT_GRID)
  })
})

describe('relativeTime', () => {
  const now = Date.parse('2026-09-25T12:00:00Z')
  it.each([
    ['2026-09-25T11:59:30Z', '방금'],
    ['2026-09-25T11:58:00Z', '2분 전'],
    ['2026-09-25T11:00:01Z', '59분 전'],
    ['2026-09-25T09:00:00Z', '3시간 전'],
    ['2026-09-26T12:00:00Z', '방금'] // 시계가 조금 어긋나 미래여도 이상한 글이 나오지 않게
  ])('%s → %s', (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected)
  })
  it('하루 넘으면 날짜, 이상한 값은 빈 문자열', () => {
    expect(relativeTime('2026-09-20T03:00:00Z', now)).toMatch(/^9월 20일$/)
    expect(relativeTime('nope', now)).toBe('')
  })
})

describe('orderLikeServer (서버 GET /bookmarks와 같은 순서)', () => {
  const bm = (id: string, createdAt: string, isPinned = false) => ({ id, createdAt, isPinned }) as Bookmark
  const ids = (list: Bookmark[]) => list.map((b) => b.id)

  it('고정 먼저, 그다음 최근 추가순', () => {
    const list = [bm('a', '2026-01-01T00:00:00.000Z'), bm('b', '2026-03-01T00:00:00.000Z'), bm('c', '2025-01-01T00:00:00.000Z', true)]
    expect(ids(orderLikeServer(list))).toEqual(['c', 'b', 'a'])
  })

  it('추가 시각이 같으면 id 오름차순. 들어온 순서와 상관없이 늘 같다', () => {
    const t = '2026-08-01T03:00:00.000Z'
    const x = '27190994-f11d-4125-a4fe-7a7da47e1c64'
    const y = '9532942e-bdbf-41f6-85cb-65a62d060154'
    const z = 'cdfe7a2b-1455-4636-a691-8d2deebf0de0'
    for (const order of [[x, y, z], [z, y, x], [y, z, x]]) {
      expect(ids(orderLikeServer(order.map((id) => bm(id, t))))).toEqual([x, y, z])
    }
  })

  it('고정을 풀면 원래 자리(추가 시각·id 순)로 돌아간다', () => {
    const t = '2026-08-01T03:00:00.000Z'
    const list = [bm('b', t, true), bm('a', t), bm('c', t)]
    expect(ids(orderLikeServer(list.map((b) => ({ ...b, isPinned: false }))))).toEqual(['a', 'b', 'c'])
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const list = [bm('b', '2026-01-01T00:00:00.000Z'), bm('a', '2026-02-01T00:00:00.000Z')]
    orderLikeServer(list)
    expect(ids(list)).toEqual(['b', 'a'])
  })
})
