// 내 프로필·설정 (GET·PATCH /me, docs/03-api.md). 라우트는 입력만 검증하고 여기를 부른다.
// 사용자 권한 트랜잭션(withUserDb) 안에서 RLS + id 조건으로 내 행만 다룬다
import { eq } from 'drizzle-orm'
import { profiles } from '@baro/db'
import type { Me, UpdateMeInput } from '@baro/shared'
import type { AuthContext } from './auth'
import { withUserDb, type Tx } from './db'

const columns = {
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
}

type Row = { [K in keyof typeof columns]: (typeof columns)[K]['_']['data'] | null } & { lastSyncedAt: Date | null }

function toMe(row: Row): Me {
  return { ...(row as Omit<Me, 'lastSyncedAt'>), lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null }
}

async function selectMe(tx: Tx, auth: AuthContext): Promise<Me | null> {
  // RLS가 이미 내 행만 보여주지만, 조건을 직접 붙인다(이중 확인)
  const [row] = await tx.select(columns).from(profiles).where(eq(profiles.id, auth.userId))
  return row ? toMe(row as Row) : null
}

/** 없으면 null(가입 트리거가 실패한 계정). 라우트가 401 INVALID_TOKEN으로 바꾼다 */
export function getMe(auth: AuthContext): Promise<Me | null> {
  return withUserDb(auth, (tx) => selectMe(tx, auth))
}

/** SEARCH-05. 받은 칸만 바꾸고 GET /me와 같은 모양을 돌려준다. updated_at은 트리거가 바꾼다 */
export function updateMe(auth: AuthContext, input: UpdateMeInput): Promise<Me | null> {
  return withUserDb(auth, async (tx) => {
    await tx
      .update(profiles)
      .set({ ...(input.sortOption !== undefined && { sortOption: input.sortOption }) })
      .where(eq(profiles.id, auth.userId))
    return selectMe(tx, auth)
  })
}
