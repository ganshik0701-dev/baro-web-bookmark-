// 메인 프로세스에서만 하는 인증 API 호출 (CLAUDE.md: 앱의 API 호출은 메인 프로세스에서만).
// 토큰은 여기서 붙이고 렌더러로 돌려보내지 않는다. path에는 코드에 고정된 값만 넘긴다.
import { getAccessToken } from './auth'

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1'

/**
 * GET /me의 필요한 부분만. 실패하면 null(프로필 복원은 없으면 없는 대로 넘어간다).
 * lastSyncedAt은 SCR-02를 띄울지 판단하는 데 쓴다(null이면 아직 한 번도 동기화하지 않은 계정)
 */
export async function fetchMe(): Promise<{ chromeProfile: string | null; lastSyncedAt: string | null } | null> {
  const token = await getAccessToken()
  if (!token) return null
  try {
    const res = await fetch(`${API_BASE}/me`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return null
    const body = (await res.json()) as { data?: { chromeProfile?: string | null; lastSyncedAt?: string | null } }
    return { chromeProfile: body.data?.chromeProfile ?? null, lastSyncedAt: body.data?.lastSyncedAt ?? null }
  } catch {
    return null
  }
}
