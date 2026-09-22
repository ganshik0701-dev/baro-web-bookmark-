// getTree → 요청 변환 (폴더 → 그룹 매핑 규칙, URL 거르기, 크기)
import { describe, expect, it } from 'vitest'
import { collectIds, flatten, isSendableUrl, jsonBytes } from '../src/tree'
import { findIn, fixtureTree } from './helpers'

describe('flatten (크롬 샘플 파일과 같은 트리)', () => {
  const tree = fixtureTree()
  const flat = flatten(tree)

  it('맨 위 노드(0)와 최상위 폴더(1·2·3)는 folders에 없다. 그 아래 폴더는 모두 있다', () => {
    expect(flat.folders.map((f) => f.chromeId)).toEqual(['7', '9', '11', '17', '20'])
    expect(flat.folders.find((f) => f.chromeId === '7')).toEqual({ chromeId: '7', parentChromeId: '1', title: '개발' })
    expect(flat.folders.find((f) => f.chromeId === '11')!.parentChromeId).toBe('9')
  })

  it('최상위 폴더 바로 아래 북마크의 parentChromeId는 최상위 폴더 id(서버가 미분류로 둔다)', () => {
    expect(flat.bookmarks.find((b) => b.chromeId === '6')!.parentChromeId).toBe('1')
    expect(flat.bookmarks.find((b) => b.chromeId === '22')!.parentChromeId).toBe('2')
  })

  it('javascript:·chrome:// 는 보내지 않고 개수만 센다(13개 중 2개)', () => {
    expect(flat.filtered).toBe(2)
    expect(flat.bookmarks).toHaveLength(11)
    expect(flat.bookmarks.some((b) => /^(javascript|chrome):/.test(b.url))).toBe(false)
  })

  it('dateAdded → addedAt(ISO), 같은 URL 중복은 서버가 정리하므로 그대로 보낸다', () => {
    expect(flat.bookmarks.find((b) => b.chromeId === '5')!.addedAt).toBe('2026-08-01T03:00:00.000Z')
    expect(flat.bookmarks.filter((b) => b.url.startsWith('https://github.com')).map((b) => b.chromeId)).toEqual(['5', '13'])
  })

  it('하위 트리(getSubTree 결과)도 같은 규칙: 폴더 자신과 하위를 넣는다', () => {
    const sub = flatten([findIn(tree, '9')!])
    expect(sub.folders.map((f) => f.chromeId)).toEqual(['9', '11'])
    expect(sub.bookmarks.map((b) => b.chromeId)).toEqual(['10', '12'])
  })

  it('collectIds: 지운 폴더와 하위 id 전부', () => {
    expect(collectIds(findIn(tree, '7')!)).toEqual(['7', '8', '9', '10', '11', '12', '13'])
  })
})

describe('isSendableUrl (서버 httpUrl과 같은 규칙)', () => {
  it.each([
    ['https://github.com/', true],
    ['http://example.org/old', true],
    ['javascript:void(0)', false],
    ['chrome://settings/', false],
    ['file:///C:/a.html', false],
    ['data:text/html,hi', false],
    [`https://x.example.com/${'a'.repeat(2048)}`, false] // 2048자 초과
  ])('%s → %s', (url, ok) => {
    expect(isSendableUrl(url)).toBe(ok)
  })
})

it('jsonBytes: 한글은 글자당 3바이트로 센다', () => {
  expect(jsonBytes({ t: '가' })).toBe(JSON.stringify({ t: '' }).length + 3)
})
