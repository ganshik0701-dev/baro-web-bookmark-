// GET /me — 내 프로필·설정 (docs/03-api.md).
// 인증(withAuth) → 사용자 권한 트랜잭션(withUserDb) → RLS + user_id 조건으로 조회
// 확장 토큰도 받는다: 확장 팝업이 연결 상태를 확인할 때 부른다(EXT-P)
import { eq } from 'drizzle-orm'
import { profiles } from '@baro/db'
import { withAuth } from '@/lib/auth'
import { withUserDb } from '@/lib/db'
import { fail, ok } from '@/lib/errors'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (_req, { auth }) => {
  const [row] = await withUserDb(auth, (tx) =>
    tx
      .select({
        id: profiles.id,
        email: profiles.email,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
        sortOption: profiles.sortOption,
        openMode: profiles.openMode,
        theme: profiles.theme,
        autoSync: profiles.autoSync,
        chromeProfile: profiles.chromeProfile,
        lastSyncedAt: profiles.lastSyncedAt
      })
      .from(profiles)
      // RLS가 이미 내 행만 보여주지만, 조건을 직접 붙인다(이중 확인)
      .where(eq(profiles.id, auth.userId))
  )
  if (!row) return fail('INVALID_TOKEN', '가입이 끝나지 않은 계정입니다')
  return ok({ ...row, lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null })
}, { allowApiToken: true })
