// withUserDb가 정말 사용자 권한(RLS 적용)으로 쿼리하는지 실제 DB로 확인한다.
// 역할 전환이 빠지면 에러 없이 소유자 권한(RLS 건너뜀)으로 돌아 겉으로는 정상처럼 보이므로
// "전환이 됐다"와 "빠지면 막힌다"를 둘 다 본다.
// DATABASE_POOLER_URL이 없으면(CI 등) 건너뛴다. 실행: pnpm --filter @baro/api test
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import type { AuthContext } from './auth'
import { assertUserContext, withUserDb } from './db'
import { closeRawDb, getRawDb } from './db-client'

// 연결 1개로 고정한다. 마지막 테스트('트랜잭션 후 원복')는 같은 연결을 다시 써야 의미가 있다
process.env.DB_POOL_MAX = '1'

// 존재하지 않는 사용자. 서명 검증을 마친 토큰에서 나온 것처럼 claims를 만든다
function fakeAuth(): AuthContext {
  const userId = randomUUID()
  return { userId, claims: { sub: userId, role: 'authenticated', aud: 'authenticated' } }
}

describe.skipIf(!process.env.DATABASE_POOLER_URL)('withUserDb', () => {
  afterAll(() => closeRawDb())

  it('트랜잭션 안에서 current_user가 authenticated이고 auth.uid()가 토큰 사용자다', async () => {
    const auth = fakeAuth()
    const row = await withUserDb(auth, async (tx) => {
      const [r] = await tx.execute<{ role: string; uid: string }>(
        sql`select current_user as role, auth.uid()::text as uid`
      )
      return r
    })
    expect(row).toEqual({ role: 'authenticated', uid: auth.userId })
  })

  it('역할 전환 없이 연 트랜잭션은 assertUserContext가 막는다', async () => {
    const auth = fakeAuth()
    await expect(
      getRawDb().transaction(async (tx) => {
        // 전환을 빠뜨린 경우를 흉내 낸다: 소유자(postgres 계열) 권한 그대로다
        const [r] = await tx.execute<{ role: string }>(sql`select current_user as role`)
        expect(r.role).not.toBe('authenticated')
        await assertUserContext(tx, auth.userId)
      })
    ).rejects.toThrow('DB 사용자 권한 전환 실패')
  })

  it('RLS가 적용된다: 소유자에게 보이는 profiles가 다른 사용자에게는 0행이다', async () => {
    // user_id 조건 없이 전체를 센다. 소유자 권한이면 RLS를 건너뛰어 전부 보인다
    const [owner] = await getRawDb().execute<{ n: number }>(sql`select count(*)::int as n from public.profiles`)
    expect(owner.n).toBeGreaterThan(0)

    const [asUser] = await withUserDb(fakeAuth(), (tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from public.profiles`)
    )
    expect(asUser.n).toBe(0)
  })

  it('트랜잭션이 끝나면 역할이 원래대로 돌아간다(풀러가 연결을 넘겨도 권한이 새지 않는다)', async () => {
    await withUserDb(fakeAuth(), async () => undefined)
    const [r] = await getRawDb().execute<{ role: string; claims: string | null }>(
      sql`select current_user as role, nullif(current_setting('request.jwt.claims', true), '') as claims`
    )
    expect(r.role).not.toBe('authenticated')
    expect(r.claims).toBeNull()
  })
})
