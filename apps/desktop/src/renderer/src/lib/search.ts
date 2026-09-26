// SEARCH-01 실시간 검색의 순수 함수 (docs/01-spec.md '검색 규칙'). 서버에 요청하지 않고 받아 둔 목록을 거른다.
// DOM을 쓰지 않아 단위 테스트로 확인한다(test/search.test.ts).
import type { Bookmark } from '@baro/shared'

/** 대소문자를 무시하고, 한글 조합 방식(NFC/NFD) 차이도 없앤다 */
function fold(text: string): string {
  return text.normalize('NFC').toLowerCase()
}

/** 검색어 → 낱말들. 공백뿐이면 [] (검색하지 않은 것과 같다) */
export function searchTerms(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean)
}

/** 주소를 사람이 읽는 모양으로. %EC%9C%84%ED%82%A4 → 위키. 잘못 인코딩돼 있으면 null */
function decodedUrl(url: string): string | null {
  try {
    const d = decodeURI(url)
    return d === url ? null : d
  } catch {
    return null
  }
}

/** 북마크 하나에서 비교할 글자: 제목 + 주소(+디코딩한 주소) + 태그 */
export function searchText(b: Bookmark): string {
  const parts = [b.title, b.url, decodedUrl(b.url), ...b.tags]
  // 줄바꿈으로 이어서 '제목 끝 + 주소 앞'이 붙어 엉뚱하게 일치하지 않게 한다
  return fold(parts.filter((p): p is string => Boolean(p)).join('\n'))
}

export type SearchIndex = { bookmark: Bookmark; text: string }[]

/** 목록이 바뀔 때만 만든다(글자를 칠 때마다 소문자 변환을 반복하지 않게) */
export function buildSearchIndex(list: Bookmark[]): SearchIndex {
  return list.map((bookmark) => ({ bookmark, text: searchText(bookmark) }))
}

/** 낱말이 모두 들어 있는 것만, 목록 순서 그대로. 낱말이 없으면 전부 */
export function filterBookmarks(index: SearchIndex, terms: string[]): Bookmark[] {
  if (terms.length === 0) return index.map((e) => e.bookmark)
  return index.filter((e) => terms.every((t) => e.text.includes(t))).map((e) => e.bookmark)
}
