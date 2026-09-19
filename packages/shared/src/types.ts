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
