export const SORT_OPTIONS = [
  'created_desc',
  'visits_30d',
  'visited_desc',
  'title_asc',
  'custom'
] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

export const BOOKMARK_SOURCES = ['manual', 'app_sync', 'ext_sync', 'html_import'] as const
export type BookmarkSource = (typeof BOOKMARK_SOURCES)[number]

export type ApiSuccess<T> = { data: T }
export type ApiFailure = { error: { code: string; message: string; details?: unknown } }

export type HealthResponse = { status: string; time: string; version: string }

// 앱 메인 프로세스 → 렌더러로 넘기는 로그인 상태. 토큰은 넣지 않는다.
// expiresAt은 액세스 토큰 만료 시각(유닉스 초)
export type AuthStatus =
  | { loggedIn: false }
  | { loggedIn: true; email: string | null; expiresAt: number }
