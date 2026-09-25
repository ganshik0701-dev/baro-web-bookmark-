// 목록 순서 (docs/03-api.md GET /bookmarks). 순수 함수라 단위 테스트로 확인한다.
import type { Bookmark } from '@baro/shared'

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * 서버 GET /bookmarks와 같은 순서: 고정 먼저, 그다음 최근 추가순(created_desc), 같으면 id 오름차순.
 * 캐시를 직접 고칠 때(고정 바꾸기) 이 순서로 다시 세운다. 안 그러면 오래된 북마크의 고정을 풀었을 때
 * 아래 섹션 맨 앞에 잘못 놓인다. SEARCH-04에서 정렬이 늘면 고른 정렬 기준으로 바꾼다.
 * id는 localeCompare가 아니라 문자 그대로 비교한다(Postgres uuid 순서 = 소문자 16진 문자열 순서).
 * 한계: 응답 시각은 밀리초까지라, DB에서 마이크로초만 다른 두 행은 여기서 id 순이 된다(다음 목록 요청 때 서버 순서로 돌아온다)
 */
export function orderLikeServer(list: Bookmark[]): Bookmark[] {
  return [...list].sort(
    (a, b) =>
      Number(b.isPinned) - Number(a.isPinned) || byString(b.createdAt, a.createdAt) || byString(a.id, b.id)
  )
}
