// /tokens(EXT-01)와 확장 토큰 인증을 실제 DB로 확인한다. 가짜 사용자 A·B를 만들고 끝나면 지운다.
// DATABASE_POOLER_URL이 없으면(CI 등) 건너뛴다. 실행: pnpm --filter @baro/api test lib/api-tokens.test.ts
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTokenInput } from '@baro/shared'
import {
  createToken,
  deleteToken,
  generateApiToken,
  hashApiToken,
  isApiTokenFormat,
  listTokens,
  resolveApiToken
} from './api-tokens'
import { withAuth, type AuthContext } from './auth'
import { closeRawDb, getRawDb } from './db-client'
import { ApiError } from './errors'

function fakeUser(): AuthContext {
  const userId = randomUUID()
  return { userId, claims: { sub: userId, role: 'authenticated', aud: 'authenticated' }, via: 'session' }
}
const A = fakeUser()
const B = fakeUser()

const issue = (auth: AuthContext, name = '테스트 토큰') => createToken(auth, createTokenInput.parse({ name }))

async function apiError(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (err) {
    if (err instanceof ApiError) return err.code
    throw err
  }
  throw new Error('오류가 나야 하는데 성공했습니다')
}

/** 소유자 권한(RLS 없음)으로 DB에 실제 저장된 행을 본다 */
async function rawRows(userId: string) {
  return getRawDb().execute<Record<string, unknown>>(sql`select * from public.api_tokens where user_id = ${userId}`)
}

/** 역할을 바꿔 한 문장을 실행하고 오류 메시지를 돌려준다(성공하면 null). 끝나면 롤백 */
async function asRole(role: string, query: ReturnType<typeof sql>): Promise<string | null> {
  try {
    await getRawDb().transaction(async (tx) => {
      await tx.execute(sql`select set_config('role', ${role}, true)`)
      await tx.execute(query)
      throw new Error('__ok__')
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === '__ok__') return null
    const cause = (err as { cause?: { message?: string } }).cause?.message
    return cause ?? msg
  }
  return null
}

describe('형식·생성 (DB 없음)', () => {
  it('baro_ + base64url 43자, 매번 다르다', () => {
    const a = generateApiToken()
    const b = generateApiToken()
    expect(a).toMatch(/^baro_[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
    expect(isApiTokenFormat(a)).toBe(true)
  })

  it.each(['baro_', 'baro_short', `baro_${'a'.repeat(44)}`, `BARO_${'a'.repeat(43)}`, `baro_${'a'.repeat(42)}=`, 'eyJhbGciOi.x.y'])(
    '형식 오류: %s',
    async (t) => {
      expect(isApiTokenFormat(t)).toBe(false)
      expect(await resolveApiToken(t)).toBeNull()
    }
  )

  it('해시는 SHA-256 hex 64자', () => {
    expect(hashApiToken('baro_x')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe.skipIf(!process.env.DATABASE_POOLER_URL)('/tokens (EXT-01, 실제 DB)', () => {
  beforeAll(async () => {
    for (const u of [A, B]) {
      await getRawDb().execute(sql`insert into auth.users (id, aud, role, email)
        values (${u.userId}, 'authenticated', 'authenticated', ${`tok-test-${u.userId}@example.com`})`)
    }
  })

  afterAll(async () => {
    await getRawDb().execute(sql`delete from auth.users where id in (${A.userId}, ${B.userId})`)
    await closeRawDb()
  })

  beforeEach(async () => {
    await getRawDb().execute(sql`delete from public.api_tokens where user_id in (${A.userId}, ${B.userId})`)
  })

  it('발급: 원본은 응답에만, DB에는 해시와 앞 8자만', async () => {
    const t = await issue(A, '  회사 PC 크롬 ')
    expect(t).toMatchObject({ name: '회사 PC 크롬', prefix: t.token.slice(0, 8), lastUsedAt: null })
    expect(t.token).toMatch(/^baro_[A-Za-z0-9_-]{43}$/)

    const [row] = await rawRows(A.userId)
    expect(row!.token_hash).toBe(hashApiToken(t.token))
    // 원본도, 원본의 앞 8자 뒤 부분도 어느 컬럼에도 없다
    const stored = JSON.stringify(row)
    expect(stored).not.toContain(t.token)
    expect(stored).not.toContain(t.token.slice(8, 20))
  })

  it('목록: 내 것만, 해시·원본 없음, 최근 발급순', async () => {
    const first = await issue(A, '첫째')
    const second = await issue(A, '둘째')
    await issue(B, 'B의 것')
    const list = await listTokens(A)
    expect(list.map((t) => t.name)).toEqual(['둘째', '첫째'])
    for (const item of list) {
      expect(Object.keys(item).sort()).toEqual(['createdAt', 'id', 'lastUsedAt', 'name', 'prefix'])
    }
    const text = JSON.stringify(list)
    expect(text).not.toContain(first.token)
    expect(text).not.toContain(second.token)
    expect(text).not.toContain(hashApiToken(first.token))
  })

  it('확장 토큰 → 주인 id, 폐기하면 바로 null', async () => {
    const t = await issue(A)
    expect(await resolveApiToken(t.token)).toBe(A.userId)
    expect(await resolveApiToken(generateApiToken())).toBeNull()
    await deleteToken(A, t.id)
    expect(await resolveApiToken(t.token)).toBeNull()
  })

  it('남의 토큰 폐기 → 404, 그 토큰은 계속 동작', async () => {
    const t = await issue(A)
    expect(await apiError(deleteToken(B, t.id))).toBe('TOKEN_NOT_FOUND')
    expect(await apiError(deleteToken(A, randomUUID()))).toBe('TOKEN_NOT_FOUND')
    expect(await resolveApiToken(t.token)).toBe(A.userId)
  })

  it('5개 제한: 3개 있을 때 동시에 10개 발급 → 정확히 2개만 성공', async () => {
    for (let i = 0; i < 3; i++) await issue(A, `기존 ${i}`)
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => issue(A, `동시 ${i}`)))
    const ok = results.filter((r) => r.status === 'fulfilled')
    const codes = results.flatMap((r) => (r.status === 'rejected' ? [(r.reason as ApiError).code] : []))
    expect(ok).toHaveLength(2)
    expect(codes).toEqual(Array(8).fill('TOKEN_LIMIT_EXCEEDED'))
    expect(await rawRows(A.userId)).toHaveLength(5)
    // B는 A의 제한과 무관
    expect((await issue(B)).name).toBe('테스트 토큰')
  })

  it('last_used_at: 첫 사용에 기록, 5분 안에는 다시 쓰지 않고, 5분 지나면 기록', async () => {
    const t = await issue(A)
    // raw 쿼리는 시간을 문자열로 준다. 같은지는 문자열(마이크로초까지)로, 나중인지는 Date로 본다
    const lastUsed = async () => (await rawRows(A.userId))[0]!.last_used_at as string | null
    expect(await lastUsed()).toBeNull()
    await resolveApiToken(t.token)
    const first = await lastUsed()
    expect(first).not.toBeNull()
    await resolveApiToken(t.token)
    await resolveApiToken(t.token)
    expect(await lastUsed()).toBe(first)
    await getRawDb().execute(sql`update public.api_tokens set last_used_at = now() - interval '6 minutes' where user_id = ${A.userId}`)
    const old = await lastUsed()
    await resolveApiToken(t.token)
    expect(new Date((await lastUsed())!).getTime()).toBeGreaterThan(new Date(old!).getTime())
  })

  it('조회 함수: 인자 char(64), security definer, search_path 고정, 실행 권한은 resolver만', async () => {
    const [fn] = await getRawDb().execute<{ args: string; definer: boolean; config: string[] | null }>(sql`
      select pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as definer, p.proconfig as config
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private' and p.proname = 'resolve_api_token'`)
    expect(fn).toEqual({ args: 'p_token_hash character', definer: true, config: ['search_path=""'] })

    const call = sql`select private.resolve_api_token(repeat('a', 64)::char(64))`
    for (const role of ['anon', 'authenticated', 'service_role']) {
      expect(await asRole(role, call), role).toMatch(/permission denied/)
    }
    expect(await asRole('baro_token_resolver', call)).toBeNull()
    // resolver는 함수 말고는 아무것도 못 한다
    expect(await asRole('baro_token_resolver', sql`select * from public.api_tokens`)).toMatch(/permission denied/)
    expect(await asRole('baro_token_resolver', sql`select * from public.profiles`)).toMatch(/permission denied/)
  })

  it('해시 조회는 idx_tokens_hash 인덱스를 쓴다', async () => {
    const plan = await getRawDb().transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`)
      return tx.execute<{ 'QUERY PLAN': string }>(
        sql`explain select user_id from public.api_tokens where token_hash = ${hashApiToken('x')}::char(64)`
      )
    })
    expect(plan.map((r) => r['QUERY PLAN']).join('\n')).toContain('Index Scan using idx_tokens_hash')
  })

  describe('withAuth', () => {
    type Route = (req: NextRequest, ctx: { params: Promise<Record<string, never>> }) => Promise<Response>
    const call = (handler: Route, token: string) =>
      handler(new NextRequest('http://localhost/api/v1/x', { headers: { authorization: `Bearer ${token}` } }), {
        params: Promise.resolve({})
      })
    const echo = async (_req: NextRequest, { auth }: { auth: AuthContext }) => Response.json({ userId: auth.userId, via: auth.via })

    it('받는 엔드포인트: 유효 토큰 200, 없는·폐기된·형식 오류 토큰은 같은 401', async () => {
      const handler = withAuth(echo, { allowApiToken: true })
      const t = await issue(A)
      const res = await call(handler, t.token)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ userId: A.userId, via: 'apiToken' })

      await deleteToken(A, t.id)
      const bodies = []
      for (const bad of [t.token, generateApiToken(), 'baro_short']) {
        const r = await call(handler, bad)
        expect(r.status).toBe(401)
        bodies.push(await r.json())
      }
      expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1)
    })

    it('받지 않는 엔드포인트(기본값): 유효 토큰이어도 401', async () => {
      const t = await issue(A)
      const res = await call(withAuth(echo), t.token)
      expect(res.status).toBe(401)
      expect((await res.json()).error.code).toBe('INVALID_TOKEN')
    })
  })
})
