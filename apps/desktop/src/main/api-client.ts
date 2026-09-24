// 인증이 필요한 API 호출의 공통 부분 (메인 프로세스 전용).
// electron을 import하지 않고 의존성을 주입받는다 → 가짜 fetch로 테스트한다(test/api-client.test.ts).
// 토큰은 여기서 헤더에 붙이기만 하고 돌려주지 않는다.
import type { ApiFailure, Bookmark } from '@baro/shared'

export type ApiDeps = {
  /** 유효한 액세스 토큰. 만료가 가까우면 이 함수가 먼저 갱신한다 */
  getAccessToken: () => Promise<string | null>
  /** 401을 받은 뒤 한 번 더 갱신해 본다 */
  forceRefresh: () => Promise<boolean>
  fetch: typeof globalThis.fetch
  apiBaseUrl: string
}

export type AuthedFetchResult =
  | { kind: 'response'; res: Response }
  | { kind: 'error'; code: 'UNAUTHORIZED' | 'NETWORK'; message: string }

/**
 * 토큰을 붙여 한 번 보낸다. 401이면 갱신 후 **딱 1회만** 다시 보낸다(docs/01-spec.md '동기화 실행 규칙').
 * 재시도도 401이면 갱신으로 풀리지 않는 것이므로 거기서 끝낸다(무한 재시도 없음).
 * 그 밖의 상태 코드는 응답 그대로 돌려주고, 해석은 부른 쪽이 한다.
 * path에는 코드에 고정된 값만 넘긴다(렌더러가 보낸 문자열을 넣지 않는다)
 */
export async function authedFetch(
  deps: ApiDeps,
  path: `/${string}`,
  init: { method?: 'GET' | 'POST'; body?: string; timeoutMs: number },
  isRetry = false
): Promise<AuthedFetchResult> {
  const token = await deps.getAccessToken()
  if (!token) return { kind: 'error', code: 'UNAUTHORIZED', message: '로그인이 필요합니다' }

  let res: Response
  try {
    res = await deps.fetch(`${deps.apiBaseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body !== undefined && { 'content-type': 'application/json' })
      },
      body: init.body,
      signal: AbortSignal.timeout(init.timeoutMs)
    })
  } catch {
    return { kind: 'error', code: 'NETWORK', message: '서버에 연결하지 못했습니다' }
  }

  if (res.status === 401) {
    // 시계 오차나 서버가 토큰을 일찍 버린 경우. 한 번만 갱신해 다시 보낸다
    if (!isRetry && (await deps.forceRefresh())) return authedFetch(deps, path, init, true)
    return { kind: 'error', code: 'UNAUTHORIZED', message: '로그인이 만료됐습니다. 다시 로그인하세요' }
  }
  return { kind: 'response', res }
}

/** GET /bookmarks 응답. 렌더러에는 이 모양 그대로 넘긴다(getHealth와 같은 { data } | { error }) */
export type BookmarkListResult = { data: Bookmark[]; meta: { total: number } } | ApiFailure

/** GET /bookmarks (SCR-03). 목록은 크지 않아 10초면 충분하다 */
export async function fetchBookmarks(deps: ApiDeps): Promise<BookmarkListResult> {
  const r = await authedFetch(deps, '/bookmarks', { timeoutMs: 10_000 })
  if (r.kind === 'error') return { error: { code: r.code, message: r.message } }

  const { res } = r
  const body = (await res.json().catch(() => null)) as
    | { data?: unknown; meta?: { total?: unknown } }
    | ApiFailure
    | null

  if (res.ok && body && 'data' in body && Array.isArray(body.data)) {
    const data = body.data as Bookmark[]
    return { data, meta: { total: typeof body.meta?.total === 'number' ? body.meta.total : data.length } }
  }
  if (body && 'error' in body && body.error) return { error: { code: body.error.code, message: body.error.message } }
  return { error: { code: `HTTP_${res.status}`, message: `서버가 ${res.status}로 응답했습니다` } }
}
