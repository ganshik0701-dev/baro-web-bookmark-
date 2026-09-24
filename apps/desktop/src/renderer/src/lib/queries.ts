// TanStack Query 설정과 북마크 목록 (SCR-03, docs/01-spec.md '목록 캐시와 갱신').
import { focusManager, QueryClient, useQuery } from '@tanstack/react-query'
import type { Bookmark } from '@baro/shared'

/** 목록을 가리키는 키. 무효화·비우기에 같은 값을 쓴다 */
export const BOOKMARKS_KEY = ['bookmarks'] as const

/** 메인이 { error }로 돌려준 실패. 코드로 재시도 여부를 가른다 */
export class ApiCallError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 60초 안에는 창을 다시 눌러도 요청하지 않는다
      staleTime: 60_000,
      // 연결 실패만 1회 다시 해 본다. 401은 메인이 이미 갱신·재시도했고, 429·5xx는 곧바로 다시 해도 같다
      retry: (failures, err) => err instanceof ApiCallError && err.code === 'NETWORK' && failures < 1
    }
  }
})

// Electron에서는 다른 창으로 alt-tab해도 visibilitychange가 오지 않는다(창이 계속 '보이는' 상태).
// 그래서 기본 감지 대신 창의 focus·blur로 '창을 다시 봤다'를 알린다.
// 60초가 지났을 때만 다시 불러온다(staleTime). 확장이 실시간으로 넣은 북마크가 여기서 들어온다
focusManager.setEventListener((setFocused) => {
  const onFocus = () => setFocused(true)
  const onBlur = () => setFocused(false)
  window.addEventListener('focus', onFocus)
  window.addEventListener('blur', onBlur)
  return () => {
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('blur', onBlur)
  }
})

/** GET /bookmarks. 요청은 메인이 하고, 여기는 결과를 캐시에 담기만 한다 */
export function useBookmarks() {
  return useQuery({
    queryKey: BOOKMARKS_KEY,
    queryFn: async (): Promise<Bookmark[]> => {
      const r = await window.baro.listBookmarks()
      if ('error' in r) throw new ApiCallError(r.error.code, r.error.message)
      return r.data
    }
  })
}
