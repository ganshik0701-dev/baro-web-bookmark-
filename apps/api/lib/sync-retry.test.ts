// /sync/chrome의 23505(유니크 위반) 재시도를 결정적으로 확인한다. 동시 요청으로 재현하지 않고,
// 이 파일에서만 withUserDb를 감싸 "쓰기를 다 한 뒤 23505로 실패"를 흉내 낸다(트랜잭션은 실제로 롤백된다).
// DATABASE_POOLER_URL이 없으면 건너뛴다.
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTokenInput, syncChromeInput } from '@baro/shared'
import { flattenChromeFile, loadFixture } from '../test/chrome-bookmarks'

vi.mock('./db', async (importOriginal) => {
  const real = await importOriginal<typeof import('./db')>()
  return { ...real, withUserDb: vi.fn(real.withUserDb) }
})

import { POST as syncRoute } from '@/app/api/v1/sync/chrome/route'
import { createToken } from './api-tokens'
import type { AuthContext } from './auth'
import * as db from './db'
import { closeRawDb, getRawDb } from './db-client'
import { syncChrome } from './sync'

const realWithUserDb = (await vi.importActual<typeof import('./db')>('./db')).withUserDb
const mocked = vi.mocked(db.withUserDb)

/** Drizzle이 던지는 모양: 바깥 오류의 cause에 드라이버 오류(code 23505) */
function fake23505() {
  const cause = Object.assign(new Error('duplicate key value violates unique constraint "uq_bm_user_url"'), { code: '23505' })
  return Object.assign(new Error('Failed query'), { cause })
}

/** 실제 트랜잭션에서 fn(쓰기)을 끝까지 실행한 뒤 23505를 던진다 → 롤백 */
const failAfterWrites: typeof realWithUserDb = (auth, fn) =>
  realWithUserDb(auth, async (tx) => {
    await fn(tx)
    throw fake23505()
  })

const userId = randomUUID()
const A: AuthContext = { userId, claims: { sub: userId, role: 'authenticated', aud: 'authenticated' }, via: 'session' }
const body = () => syncChromeInput.parse({ mode: 'full', source: 'app', ...flattenChromeFile(loadFixture()) })
const counts = async () => {
  const [r] = await getRawDb().execute<{ bookmarks: number; groups: number }>(sql`select
    (select count(*) from public.bookmarks where user_id = ${userId})::int as bookmarks,
    (select count(*) from public.groups where user_id = ${userId})::int as groups`)
  return r
}

describe.skipIf(!process.env.DATABASE_POOLER_URL)('/sync/chrome 23505 재시도', () => {
  beforeAll(async () => {
    await getRawDb().execute(sql`insert into auth.users (id, aud, role, email)
      values (${userId}, 'authenticated', 'authenticated', ${`retry-test-${userId}@example.com`})`)
  })
  afterAll(async () => {
    await getRawDb().execute(sql`delete from auth.users where id = ${userId}`)
    await closeRawDb()
  })
  beforeEach(async () => {
    await getRawDb().execute(sql`delete from public.bookmarks where user_id = ${userId}`)
    await getRawDb().execute(sql`delete from public.groups where user_id = ${userId}`)
  })
  afterEach(() => {
    mocked.mockReset()
    mocked.mockImplementation(realWithUserDb)
  })

  it('(a) 첫 시도만 23505 → 재시도 성공, 결과는 한 번만 반영', async () => {
    mocked.mockImplementationOnce(failAfterWrites)
    const r = await syncChrome(A, body())
    expect(mocked).toHaveBeenCalledTimes(2)
    expect(r).toMatchObject({ created: 10, updated: 0, deleted: 0 })
    // 첫 시도의 쓰기(10개·그룹 5개)는 롤백되고 재시도분만 남는다(20개가 아니다)
    expect(await counts()).toEqual({ bookmarks: 10, groups: 5 })
  })

  it('(b) 재시도도 23505 → 두 번에서 멈추고 500 INTERNAL_ERROR, 아무것도 반영 안 됨', async () => {
    const t = await createToken(A, createTokenInput.parse({ name: '재시도 테스트' }))
    mocked.mockReset()
    mocked.mockImplementation(failAfterWrites)
    const res = await syncRoute(
      new NextRequest('http://localhost/api/v1/sync/chrome', {
        method: 'POST',
        headers: { authorization: `Bearer ${t.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...body(), source: 'extension' })
      }),
      { params: Promise.resolve({}) }
    )
    expect(mocked).toHaveBeenCalledTimes(2)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다' } })
    expect(await counts()).toEqual({ bookmarks: 0, groups: 0 })
    mocked.mockImplementation(realWithUserDb)
    await getRawDb().execute(sql`delete from public.api_tokens where user_id = ${userId}`)
  })
})
