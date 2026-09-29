// 메인 프로세스에서만 하는 인증 API 호출 (CLAUDE.md: 앱의 API 호출은 메인 프로세스에서만).
// 토큰은 여기서 붙이고 렌더러로 돌려보내지 않는다. path에는 코드에 고정된 값만 넘긴다.
import {
  deleteBookmarkById,
  deleteTokenById,
  fetchBookmarks,
  fetchTokens,
  getMetadata,
  getAutoSyncSetting,
  getSortSetting,
  patchAutoSyncSetting,
  patchBookmark,
  patchSortSetting,
  patchPinned,
  postBookmark,
  postToken,
  postVisit,
  type ApiDeps,
  type AutoSyncSettingResult,
  type BookmarkListResult,
  type BookmarkResult,
  type DoneResult,
  type IssuedTokenResult,
  type MetadataResult,
  type SortSettingResult,
  type TokenListResult
} from './api-client'
import { forceRefresh, getAccessToken } from './auth'

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1'

/** 진짜 토큰·fetch·주소. 동기화(sync.ts)와 목록 조회가 같은 것을 쓴다 */
export const apiDeps: ApiDeps = {
  getAccessToken,
  forceRefresh,
  fetch: (...args) => fetch(...args),
  apiBaseUrl: API_BASE
}

/** GET /bookmarks (SCR-03). IPC bookmarks:list가 부른다 */
export function listBookmarks(): Promise<BookmarkListResult> {
  return fetchBookmarks(apiDeps)
}

/** OPEN-02·03, BM-05. id·값 검사는 api-client가 한다(렌더러가 보낸 값이 그대로 오므로) */
export const recordVisit = (id: unknown): Promise<DoneResult> => postVisit(apiDeps, id)
export const setPinned = (id: unknown, pinned: unknown): Promise<BookmarkResult> => patchPinned(apiDeps, id, pinned)
export const deleteBookmark = (id: unknown): Promise<DoneResult> => deleteBookmarkById(apiDeps, id)

/** SCR-04 추가·수정과 제목 자동 채움. 입력 검사는 api-client가 shared 스키마로 한다 */
export const createBookmark = (raw: unknown): Promise<BookmarkResult> => postBookmark(apiDeps, raw)
export const updateBookmark = (id: unknown, raw: unknown): Promise<BookmarkResult> => patchBookmark(apiDeps, id, raw)
export const fetchMetadata = (url: unknown): Promise<MetadataResult> => getMetadata(apiDeps, url)

/** SEARCH-05 정렬 저장·복원. 값 검사는 api-client가 shared 스키마로 한다 */
export const getSortOption = (): Promise<SortSettingResult> => getSortSetting(apiDeps)
export const saveSortOption = (value: unknown): Promise<DoneResult> => patchSortSetting(apiDeps, value)

/** SCR-05 앱을 열 때 자동 동기화. 값 검사는 api-client가 shared 스키마로 한다 */
export const getAutoSync = (): Promise<AutoSyncSettingResult> => getAutoSyncSetting(apiDeps)
export const saveAutoSync = (value: unknown): Promise<DoneResult> => patchAutoSyncSetting(apiDeps, value)

/** EXT-01 확장 토큰. 이름·id 검사는 api-client가 한다. 발급 원본은 렌더러로 한 번 넘기기만 한다 */
export const listTokens = (): Promise<TokenListResult> => fetchTokens(apiDeps)
export const createToken = (name: unknown): Promise<IssuedTokenResult> => postToken(apiDeps, name)
export const revokeToken = (id: unknown): Promise<DoneResult> => deleteTokenById(apiDeps, id)

/**
 * GET /me의 필요한 부분만. 실패하면 null(프로필 복원은 없으면 없는 대로 넘어간다).
 * lastSyncedAt은 SCR-02를 띄울지 판단하는 데 쓴다(null이면 아직 한 번도 동기화하지 않은 계정)
 */
export type MeSummary = { chromeProfile: string | null; lastSyncedAt: string | null; autoSync: boolean }

export async function fetchMe(): Promise<MeSummary | null> {
  const token = await getAccessToken()
  if (!token) return null
  try {
    const res = await fetch(`${API_BASE}/me`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return null
    const body = (await res.json()) as { data?: { chromeProfile?: string | null; lastSyncedAt?: string | null; autoSync?: unknown } }
    return {
      chromeProfile: body.data?.chromeProfile ?? null,
      lastSyncedAt: body.data?.lastSyncedAt ?? null,
      // 못 읽으면 켜진 것으로 본다(DB 기본값과 같다)
      autoSync: body.data?.autoSync !== false
    }
  } catch {
    return null
  }
}
