// SEARCH-01 검색 규칙 (docs/01-spec.md '검색 규칙')
import { describe, expect, it } from 'vitest'
import type { Bookmark } from '@baro/shared'
import { buildSearchIndex, filterBookmarks, searchTerms, searchText } from '../src/renderer/src/lib/search'

const bm = (id: string, title: string, url: string, tags: string[] = []) =>
  ({ id, title, url, tags, isPinned: false, createdAt: '2026-09-01T00:00:00.000Z' }) as Bookmark

const LIST = [
  bm('gh', 'GitHub', 'https://github.com/'),
  bm('react', 'React 문서', 'https://react.dev/learn'),
  bm('ghr', 'facebook/react', 'https://github.com/facebook/react'),
  bm('wiki', '', 'https://ko.wikipedia.org/wiki/%EC%9C%84%ED%82%A4'),
  bm('naver', '네이버', 'https://www.naver.com/', ['포털']),
  bm('bad', '깨진 주소', 'https://a.com/%E0%A4%A')
]
const ids = (q: string) => filterBookmarks(buildSearchIndex(LIST), searchTerms(q)).map((b) => b.id)

describe('searchTerms', () => {
  it.each([
    ['', []],
    ['   ', []],
    ['GitHub', ['github']],
    ['  github   REACT ', ['github', 'react']]
  ])('%j → %j', (q, expected) => {
    expect(searchTerms(q)).toEqual(expected)
  })

  it('한글 조합 방식이 달라도(NFD) 같은 낱말', () => {
    expect(searchTerms('위키'.normalize('NFD'))).toEqual(['위키'])
  })
})

describe('filterBookmarks', () => {
  it('검색어가 없으면 전부, 목록 순서 그대로', () => {
    expect(ids('')).toEqual(['gh', 'react', 'ghr', 'wiki', 'naver', 'bad'])
  })

  it('제목 부분 일치, 대소문자 무시', () => {
    expect(ids('GITHUB')).toEqual(['gh', 'ghr'])
    expect(ids('문서')).toEqual(['react'])
  })

  it('주소로도 찾는다', () => {
    expect(ids('react.dev')).toEqual(['react'])
  })

  it('낱말이 모두 들어 있어야 한다(AND)', () => {
    expect(ids('github react')).toEqual(['ghr'])
    expect(ids('github 네이버')).toEqual([])
  })

  it('퍼센트 인코딩된 주소는 디코딩한 글자로도 찾는다', () => {
    expect(ids('위키')).toEqual(['wiki'])
    expect(ids('%EC%9C%84')).toEqual(['wiki'])
  })

  it('태그로도 찾는다', () => {
    expect(ids('포털')).toEqual(['naver'])
  })

  it('잘못 인코딩된 주소도 오류 없이 원래 값으로 비교', () => {
    expect(ids('a.com')).toEqual(['bad'])
  })

  it('제목 끝과 주소 앞이 붙어 엉뚱하게 일치하지 않는다', () => {
    // 'GitHub' + 'https://…'가 이어지면 'bhttps'가 생긴다
    expect(ids('bhttps')).toEqual([])
    expect(searchText(LIST[0])).toContain('\n')
  })
})
