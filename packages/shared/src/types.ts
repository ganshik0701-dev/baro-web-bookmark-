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
// '지금 로그인되어 있는가'(session)와 '마지막 시도가 어땠는가'(lastAttempt)를 따로 둔다.
// 재로그인에 실패해도 기존 세션은 그대로 보여야 하기 때문이다.
export type AuthSession = {
  email: string | null
  /** 액세스 토큰 만료 시각(유닉스 초) */
  expiresAt: number
  /** 리프레시 토큰을 이 PC에 암호화 저장했는가. false면 앱을 다시 켜면 로그인이 풀린다 */
  persisted: boolean
}

export type AuthAttempt = {
  /** login: 버튼 로그인, restore: 앱 시작 시 자동 로그인, refresh: 만료 전 갱신, logout: 로그아웃 */
  kind: 'login' | 'restore' | 'refresh' | 'logout'
  ok: boolean
  /**
   * 실패 이유. 토큰 값은 들어가지 않는다.
   * logout은 로컬 처리가 끝나면 ok다. 서버에 알리지 못했으면 ok인 채로 여기에 남긴다
   */
  message: string | null
  /** 밀리초 */
  at: number
}

export type AuthStatus = {
  session: AuthSession | null
  /** 저장된 토큰으로 자동 로그인하는 중 */
  restoring: boolean
  /**
   * 이 PC에 저장된 로그인(session.bin)이 있다. 세션이 없어도 true일 수 있다
   * (오프라인으로 시작해 자동 로그인을 재시도하는 중). 이때도 로그아웃할 수 있어야 한다
   */
  stored: boolean
  lastAttempt: AuthAttempt | null
}
