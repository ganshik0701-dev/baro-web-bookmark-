// GET·PATCH /me 서비스를 실제 DB로 확인한다(SEARCH-05). 가짜 사용자 A·B를 만들고 끝나면 지운다.
// DATABASE_POOLER_URL이 없으면(CI 등) 건너뛴다
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { updateMeInput } from '@baro/shared'
import type { AuthContext } from './auth'
import { closeRawDb, getRawDb } from './db-client'
import { getMe, updateMe } from './me'

function fakeUser(): AuthContext {
  const userId = randomUUID()
  return { userId, claims: { sub: userId, role: 'authenticated', aud: 'authenticated' }, via: 'session' }
}
const A = fakeUser()
const B = fakeUser()

describe.skipIf(!process.env.DATABASE_POOLER_URL)('me (SEARCH-05)', () => {
  beforeAll(async () => {
    for (const u of [A, B]) {
      await getRawDb().execute(sql`insert into auth.users (id, aud, role, email)
        values (${u.userId}, 'authenticated', 'authenticated', ${`me-test-${u.userId}@example.com`})`)
    }
  })

  afterAll(async () => {
    await getRawDb().execute(sql`delete from auth.users where id in (${A.userId}, ${B.userId})`)
    await closeRawDb()
  })

  it('처음에는 DB 기본값 created_desc', async () => {
    expect((await getMe(A))?.sortOption).toBe('created_desc')
  })

  it('정렬을 바꾸면 GET /me와 같은 모양으로 돌려주고, 다시 읽어도 그 값', async () => {
    const me = await updateMe(A, updateMeInput.parse({ sortOption: 'visits_30d' }))
    expect(me).toMatchObject({ id: A.userId, sortOption: 'visits_30d', email: `me-test-${A.userId}@example.com` })
    expect((await getMe(A))?.sortOption).toBe('visits_30d')
  })

  it('다른 사용자의 설정은 바뀌지 않는다', async () => {
    await updateMe(A, updateMeInput.parse({ sortOption: 'title_asc' }))
    expect((await getMe(B))?.sortOption).toBe('created_desc')
  })
})
