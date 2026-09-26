// 인증이 필요한 API 호출의 공통 부분 (메인 프로세스 전용).
// electron을 import하지 않고 의존성을 주입받는다 → 가짜 fetch로 테스트한다(test/api-client.test.ts).
// 토큰은 여기서 헤더에 붙이기만 하고 돌려주지 않는다.
import { createBookmarkInput, httpUrl, updateBookmarkInput, updateMeInput, type ApiFailure, type Bookmark } from '@baro/shared'

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
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: string; timeoutMs: number },
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

// ─── 북마크 하나에 대한 요청 (OPEN-02·03, BM-05) ─────────────────────────
// id는 렌더러에서 오지만 주소에 들어간다. uuid 모양이 아니면 요청하지 않는다('../me' 같은 값으로 다른 경로를 못 부르게)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isBookmarkId(id: unknown): id is string {
  return typeof id === 'string' && UUID.test(id)
}

/** 성공하면 { ok: true } 또는 { data }, 실패하면 { error }. 예외를 던지지 않는다 */
export type DoneResult = { ok: true } | ApiFailure
export type BookmarkResult = { data: Bookmark } | ApiFailure

const INVALID_ID: ApiFailure = { error: { code: 'INVALID_ID', message: '북마크 id가 올바르지 않습니다' } }

/** 응답 본문의 { error }를 꺼내거나, 없으면 상태 코드로 만든다. details(409의 existingId 등)도 넘긴다 */
async function failureOf(res: Response): Promise<ApiFailure> {
  const body = (await res.json().catch(() => null)) as ApiFailure | null
  if (body && 'error' in body && body.error) {
    const { code, message, details } = body.error
    return { error: details === undefined ? { code, message } : { code, message, details } }
  }
  return { error: { code: `HTTP_${res.status}`, message: `서버가 ${res.status}로 응답했습니다` } }
}

/** POST /bookmarks/:id/visit (OPEN-02). 204면 성공 */
export async function postVisit(deps: ApiDeps, id: unknown): Promise<DoneResult> {
  if (!isBookmarkId(id)) return INVALID_ID
  const r = await authedFetch(deps, `/bookmarks/${id}/visit`, { method: 'POST', timeoutMs: 10_000 })
  if (r.kind === 'error') return { error: { code: r.code, message: r.message } }
  return r.res.ok ? { ok: true } : failureOf(r.res)
}

/** 성공 응답의 { data: 북마크 }를 꺼낸다 */
async function bookmarkOf(r: AuthedFetchResult): Promise<BookmarkResult> {
  if (r.kind === 'error') return { error: { code: r.code, message: r.message } }
  if (!r.res.ok) return failureOf(r.res)
  const body = (await r.res.json().catch(() => null)) as { data?: Bookmark } | null
  return body?.data ? { data: body.data } : { error: { code: `HTTP_${r.res.status}`, message: '응답을 읽지 못했습니다' } }
}

/** 렌더러가 보낸 값이 스키마를 통과하지 못했을 때. 요청은 보내지 않는다 */
function invalidInput(message: string | undefined): ApiFailure {
  return { error: { code: 'INVALID_INPUT', message: message ?? '입력이 올바르지 않습니다' } }
}

/** PATCH /bookmarks/:id { isPinned } (OPEN-03). 바뀐 북마크를 돌려준다 */
export async function patchPinned(deps: ApiDeps, id: unknown, pinned: unknown): Promise<BookmarkResult> {
  if (!isBookmarkId(id) || typeof pinned !== 'boolean') return INVALID_ID
  return bookmarkOf(
    await authedFetch(deps, `/bookmarks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isPinned: pinned }),
      timeoutMs: 10_000
    })
  )
}

// ─── 추가·수정 (SCR-04, BM-01~04) ────────────────────────────────────────
// 렌더러가 보낸 값은 서버와 같은 shared 스키마로 여기서 한 번 더 검사하고, 받는 칸만 골라 보낸다

/** 추가·수정 모달이 보낼 수 있는 칸. 그룹·태그는 P1 때 */
export type BookmarkFields = { url?: unknown; title?: unknown; iconUrl?: unknown }

function pickFields(raw: unknown): BookmarkFields {
  if (typeof raw !== 'object' || raw === null) return {}
  const r = raw as Record<string, unknown>
  const out: BookmarkFields = {}
  for (const k of ['url', 'title', 'iconUrl'] as const) if (k in r) out[k] = r[k]
  return out
}

/** POST /bookmarks (BM-01). 409 DUPLICATE_URL이면 details.existingId가 함께 온다 */
export async function postBookmark(deps: ApiDeps, raw: unknown): Promise<BookmarkResult> {
  const parsed = createBookmarkInput.safeParse(pickFields(raw))
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)
  return bookmarkOf(
    await authedFetch(deps, '/bookmarks', { method: 'POST', body: JSON.stringify(parsed.data), timeoutMs: 10_000 })
  )
}

/** PATCH /bookmarks/:id (BM-04). 바뀐 칸만 받는다. 주소를 바꿔 다른 북마크와 겹치면 409 */
export async function patchBookmark(deps: ApiDeps, id: unknown, raw: unknown): Promise<BookmarkResult> {
  if (!isBookmarkId(id)) return INVALID_ID
  const parsed = updateBookmarkInput.safeParse(pickFields(raw))
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)
  return bookmarkOf(
    await authedFetch(deps, `/bookmarks/${id}`, { method: 'PATCH', body: JSON.stringify(parsed.data), timeoutMs: 10_000 })
  )
}

export type MetadataResult = { data: { title: string | null; iconUrl: string | null } } | ApiFailure

/** GET /metadata?url= (BM-01 자동 채움). 서버가 3초에 끊으므로 여유를 둬 8초 */
export async function getMetadata(deps: ApiDeps, rawUrl: unknown): Promise<MetadataResult> {
  const parsed = httpUrl.safeParse(rawUrl)
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)
  const r = await authedFetch(deps, `/metadata?url=${encodeURIComponent(parsed.data)}`, { timeoutMs: 8_000 })
  if (r.kind === 'error') return { error: { code: r.code, message: r.message } }
  if (!r.res.ok) return failureOf(r.res)
  const body = (await r.res.json().catch(() => null)) as { data?: { title?: unknown; iconUrl?: unknown } } | null
  if (!body?.data) return { error: { code: `HTTP_${r.res.status}`, message: '응답을 읽지 못했습니다' } }
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  return { data: { title: str(body.data.title), iconUrl: str(body.data.iconUrl) } }
}

/** DELETE /bookmarks/:id (BM-05). 5초 기다리기는 렌더러가 하고, 여기는 보내기만 한다 */
export async function deleteBookmarkById(deps: ApiDeps, id: unknown): Promise<DoneResult> {
  if (!isBookmarkId(id)) return INVALID_ID
  const r = await authedFetch(deps, `/bookmarks/${id}`, { method: 'DELETE', timeoutMs: 10_000 })
  if (r.kind === 'error') return { error: { code: r.code, message: r.message } }
  return r.res.ok ? { ok: true } : failureOf(r.res)
}

// ─── 정렬 저장·복원 (SEARCH-05) ────────────────────────────────────────
/** 저장된 정렬(DB 값 그대로. custom일 수도 있어 문자열). 렌더러가 모르는 값을 최근 추가순으로 보여준다 */
export type SortSettingResult = { data: { sortOption: string } } | ApiFailure

/** GET /me에서 정렬만 꺼낸다. 켤 때 한 번 부른다 */
export async function getSortSetting(deps: ApiDeps): Promise<SortSettingResult> {
  const r = await authedFetch(deps, '/me', { timeoutMs: 10_000 })
  if (r.kind === 'error') return { error: { code: r.code, message: r.message } }
  if (!r.res.ok) return failureOf(r.res)
  const body = (await r.res.json().catch(() => null)) as { data?: { sortOption?: unknown } } | null
  const v = body?.data?.sortOption
  return typeof v === 'string' ? { data: { sortOption: v } } : { error: { code: `HTTP_${r.res.status}`, message: '응답을 읽지 못했습니다' } }
}

/** PATCH /me { sortOption }. 값은 shared 스키마(4종)로 다시 검사하고, 틀리면 요청하지 않는다 */
export async function patchSortSetting(deps: ApiDeps, value: unknown): Promise<DoneResult> {
  const parsed = updateMeInput.safeParse({ sortOption: value })
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)
  const r = await authedFetch(deps, '/me', { method: 'PATCH', body: JSON.stringify(parsed.data), timeoutMs: 10_000 })
  if (r.kind === 'error') return { error: { code: r.code, message: r.message } }
  return r.res.ok ? { ok: true } : failureOf(r.res)
}
