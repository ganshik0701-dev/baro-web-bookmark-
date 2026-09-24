// 속도 제한 (docs/03-api.md '속도 제한'). 실제 DB가 필요하다.
// DATABASE_POOLER_URL이 없으면(CI 등) 건너뛴다.
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeRawDb, getRawDb } from './db-client'
import { checkRateLimit, LIMITS } from './rate-limit'

const A = { userId: randomUUID(), email: `rl-a-${Date.now()}@example.test` }

async function countRows(userId: string): Promise<number> {
  const rows = await getRawDb().execute<{ n: string }>(
    sql`select count(*)::text as n from public.rate_limits where user_id = ${userId}`
  )
  return Number(rows[0]!.n)
}

describe.skipIf(!process.env.DATABASE_POOLER_URL)('속도 제한 (실제 DB)', () => {
  beforeAll(async () => {
    // profiles는 auth.users를 참조하므로 가짜 사용자를 먼저 만든다(다른 테스트와 같은 방식)
    await getRawDb().execute(sql`insert into auth.users (id, aud, role, email)
      values (${A.userId}, 'authenticated', 'authenticated', ${A.email})`)
  })

  afterAll(async () => {
    await getRawDb().execute(sql`delete from public.rate_limits where user_id = ${A.userId}`)
    await getRawDb().execute(sql`delete from auth.users where id = ${A.userId}`)
    await closeRawDb()
  })

  it('한도 안에서는 통과한다', async () => {
    const r = await checkRateLimit(A.userId)
    expect(r.ok).toBe(true)
  })

  it('global 한도(120)를 넘으면 막고 retry-after를 준다', async () => {
    const uid = A.userId
    // 남은 횟수를 한 번에 채운다. 119까지는 통과, 120째도 통과(같거나 작으면 통과), 121째부터 막힌다
    await getRawDb().execute(sql`
      insert into public.rate_limits (user_id, bucket, window_start, count)
      values (${uid}, 'global', date_trunc('minute', now()), ${LIMITS.global})
      on conflict (user_id, bucket, window_start) do update set count = ${LIMITS.global}`)

    const over = await checkRateLimit(uid)
    expect(over.ok).toBe(false)
    if (!over.ok) {
      expect(over.bucket).toBe('global')
      expect(over.retryAfter).toBeGreaterThan(0)
      expect(over.retryAfter).toBeLessThanOrEqual(60)
    }
  })

  it('엔드포인트 버킷이 먼저 걸린다(global은 여유가 있어도)', async () => {
    const uid = randomUUID()
    await getRawDb().execute(sql`insert into auth.users (id, aud, role, email)
      values (${uid}, 'authenticated', 'authenticated', ${`rl-b-${Date.now()}@example.test`})`)
    try {
      // sync 버킷만 한도까지 채운다
      await getRawDb().execute(sql`
        insert into public.rate_limits (user_id, bucket, window_start, count)
        values (${uid}, 'sync', date_trunc('minute', now()), ${LIMITS.sync})`)

      const r = await checkRateLimit(uid, 'sync')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.bucket).toBe('sync')

      // 같은 사용자라도 버킷이 다르면 통과한다(global은 아직 여유)
      const other = await checkRateLimit(uid, 'metadata')
      expect(other.ok).toBe(true)
    } finally {
      await getRawDb().execute(sql`delete from public.rate_limits where user_id = ${uid}`)
      await getRawDb().execute(sql`delete from auth.users where id = ${uid}`)
    }
  })

  it('버킷을 주면 global과 그 버킷 두 행이 생긴다(왕복 1회)', async () => {
    const uid = randomUUID()
    await getRawDb().execute(sql`insert into auth.users (id, aud, role, email)
      values (${uid}, 'authenticated', 'authenticated', ${`rl-c-${Date.now()}@example.test`})`)
    try {
      await checkRateLimit(uid, 'metadata')
      expect(await countRows(uid)).toBe(2)

      const rows = await getRawDb().execute<{ bucket: string; count: number }>(
        sql`select bucket, count from public.rate_limits where user_id = ${uid} order by bucket`
      )
      expect(rows.map((r) => [r.bucket, r.count])).toEqual([
        ['global', 1],
        ['metadata', 1]
      ])
    } finally {
      await getRawDb().execute(sql`delete from public.rate_limits where user_id = ${uid}`)
      await getRawDb().execute(sql`delete from auth.users where id = ${uid}`)
    }
  })

  it('앱과 확장이 같은 카운터를 나눠 쓴다(사용자당 합산)', async () => {
    const uid = randomUUID()
    await getRawDb().execute(sql`insert into auth.users (id, aud, role, email)
      values (${uid}, 'authenticated', 'authenticated', ${`rl-d-${Date.now()}@example.test`})`)
    try {
      // checkRateLimit은 토큰 종류를 받지 않는다 — 사용자 id만 본다
      await checkRateLimit(uid, 'sync')
      await checkRateLimit(uid, 'sync')
      const rows = await getRawDb().execute<{ count: number }>(
        sql`select count from public.rate_limits where user_id = ${uid} and bucket = 'sync'`
      )
      expect(rows[0]!.count).toBe(2)
    } finally {
      await getRawDb().execute(sql`delete from public.rate_limits where user_id = ${uid}`)
      await getRawDb().execute(sql`delete from auth.users where id = ${uid}`)
    }
  })

  it('세지 못하면 막지 않는다(fail-open)', async () => {
    // profiles에 없는 사용자 → 외래키 위반으로 함수가 실패한다
    const r = await checkRateLimit(randomUUID(), 'sync')
    expect(r.ok).toBe(true)
  })

  it('전용 역할은 다른 테이블을 건드리지 못한다', async () => {
    let denied = false
    try {
      await getRawDb().transaction(async (tx) => {
        await tx.execute(sql`set local role baro_rate_limiter`)
        await tx.execute(sql`select * from public.bookmarks limit 1`)
      })
    } catch {
      denied = true
    }
    expect(denied).toBe(true)
  })
})
