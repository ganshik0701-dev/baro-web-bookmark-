// 앱 토큰(Supabase 액세스 토큰) 인증 경로: withAuth → verifyAccessToken (docs/03-api.md '공통 규칙').
// DB 없이 돈다. 공개키 묶음(JWKS)은 이 테스트가 127.0.0.1에 띄운 가짜 서버가 내주고,
// SUPABASE_URL도 그 서버를 가리키게 바꾼다. 속도 제한·확장 토큰 조회는 가짜로 바꿔 DB에 닿지 않게 한다.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWTPayload } from 'jose'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const rate = vi.hoisted(() => ({ calls: [] as string[], result: { ok: true } as { ok: true } | { ok: false; bucket: 'global'; retryAfter: number } }))
vi.mock('./rate-limit', () => ({
  checkRateLimit: async (userId: string) => {
    rate.calls.push(userId)
    return rate.result
  }
}))
const tokenLookup = vi.hoisted(() => ({ calls: 0 }))
vi.mock('./api-tokens', () => ({
  resolveApiToken: async () => {
    tokenLookup.calls++
    return null
  }
}))

import { verifyAccessToken, withAuth, type AuthContext } from './auth'

let server: Server
let base = ''
let jwksUp = true
let key: CryptoKey
let otherKey: CryptoKey
const KID = 'test-key'

beforeAll(async () => {
  const pair = await generateKeyPair('ES256')
  key = pair.privateKey
  otherKey = (await generateKeyPair('ES256')).privateKey
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'ES256', use: 'sig' }
  server = createServer((req, res) => {
    if (!jwksUp || req.url !== '/auth/v1/.well-known/jwks.json') {
      res.writeHead(503).end()
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  // auth.ts는 처음 검증할 때 이 값으로 JWKS 주소와 issuer를 정한다
  vi.stubEnv('SUPABASE_URL', base)
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await new Promise<void>((r) => server.close(() => r()))
})

beforeEach(() => {
  rate.calls.length = 0
  rate.result = { ok: true }
  tokenLookup.calls = 0
  jwksUp = true
})

type Overrides = { claims?: JWTPayload; alg?: string; signWith?: CryptoKey | Uint8Array; kid?: string; expiresIn?: string | number; issuer?: string; audience?: string }

async function token(o: Overrides = {}): Promise<string> {
  const jwt = new SignJWT({ role: 'authenticated', ...o.claims })
    .setProtectedHeader({ alg: o.alg ?? 'ES256', kid: o.kid ?? KID })
    .setIssuer(o.issuer ?? `${base}/auth/v1`)
    .setAudience(o.audience ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(o.expiresIn ?? '1h')
  if (!o.claims || !('sub' in o.claims)) jwt.setSubject(randomUUID())
  return jwt.sign(o.signWith ?? key)
}

describe('verifyAccessToken', () => {
  it('올바른 토큰: 사용자 id는 토큰의 sub', async () => {
    const sub = randomUUID()
    const auth = await verifyAccessToken(await token({ claims: { sub } }))
    expect(auth).toMatchObject({ userId: sub, via: 'session' })
    expect(auth.claims.sub).toBe(sub)
  })

  it.each<[string, () => Promise<string>]>([
    ['다른 키로 서명', () => token({ signWith: otherKey })],
    ['만료', () => token({ expiresIn: Math.floor(Date.now() / 1000) - 60 })],
    ['다른 발급자', () => token({ issuer: 'https://evil.example/auth/v1' })],
    ['다른 audience', () => token({ audience: 'anon' })],
    ['role이 anon', () => token({ claims: { role: 'anon' } })],
    ['sub가 uuid가 아님', () => token({ claims: { sub: 'admin' } })],
    ['HS256(대칭키) 서명', () => token({ alg: 'HS256', signWith: new TextEncoder().encode('x'.repeat(32)) })],
    ['모르는 kid', () => token({ kid: 'other-kid' })],
    ['서명 없는 토큰(alg none 모양)', async () => {
      const payload = (await token()).split('.')[1]
      const none = Buffer.from(JSON.stringify({ alg: 'none', kid: KID })).toString('base64url')
      return `${none}.${payload}.`
    }],
    ['형식이 깨진 문자열', async () => 'not.a.jwt']
  ])('%s → 거절', async (_name, make) => {
    await expect(verifyAccessToken(await make())).rejects.toThrow()
  })
})

describe('withAuth (앱 토큰)', () => {
  type Route = (req: NextRequest, ctx: { params: Promise<Record<string, never>> }) => Promise<Response>
  const call = (handler: Route, header?: string) =>
    handler(new NextRequest('http://localhost/api/v1/x', { headers: header ? { authorization: header } : {} }), {
      params: Promise.resolve({})
    })
  const echo = async (_req: NextRequest, { auth }: { auth: AuthContext }) => Response.json({ userId: auth.userId, via: auth.via })

  it('올바른 토큰: 처리기는 토큰의 sub를 사용자로 받고, 그 사용자로 속도 제한을 센다', async () => {
    const sub = randomUUID()
    const res = await call(withAuth(echo), `Bearer ${await token({ claims: { sub } })}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ userId: sub, via: 'session' })
    expect(rate.calls).toEqual([sub])
  })

  it('헤더 없음·Bearer 아님 → 401 UNAUTHORIZED, 처리기·속도 제한 안 감', async () => {
    let called = 0
    const h = withAuth(async () => {
      called++
      return Response.json({})
    })
    for (const header of [undefined, 'Basic abc', `Token ${await token()}`]) {
      const res = await call(h, header)
      expect(res.status).toBe(401)
      expect((await res.json()).error.code).toBe('UNAUTHORIZED')
    }
    expect(called).toBe(0)
    expect(rate.calls).toEqual([])
  })

  it('잘못된 토큰 → 401 INVALID_TOKEN, 처리기·속도 제한 안 감', async () => {
    for (const t of [await token({ signWith: otherKey }), await token({ claims: { role: 'anon' } }), 'garbage']) {
      const res = await call(withAuth(echo), `Bearer ${t}`)
      expect(res.status).toBe(401)
      expect((await res.json()).error.code).toBe('INVALID_TOKEN')
    }
    expect(rate.calls).toEqual([])
  })

  it('확장 토큰(baro_)은 받지 않는 엔드포인트에서 DB를 보기 전에 401', async () => {
    const res = await call(withAuth(echo), `Bearer baro_${'a'.repeat(43)}`)
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('INVALID_TOKEN')
    expect(tokenLookup.calls).toBe(0)
  })

  it('JWKS를 못 받으면(서버 문제) 401이 아니라 500, 토큰이 잘못됐다고 말하지 않는다', async () => {
    jwksUp = false
    // auth.ts는 받아 둔 키를 모듈에 캐시하므로, 캐시가 빈 새 모듈로 부른다
    vi.resetModules()
    const fresh = await import('./auth')
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const res = await call(fresh.withAuth(echo), `Bearer ${await token()}`)
      expect(res.status).toBe(500)
      expect((await res.json()).error.code).toBe('INTERNAL_ERROR')
      expect(rate.calls).toEqual([])
    } finally {
      error.mockRestore()
    }
  })

  it('속도 제한에 걸리면 429, 처리기는 안 감', async () => {
    rate.result = { ok: false, bucket: 'global', retryAfter: 12 }
    let called = 0
    const res = await call(
      withAuth(async () => {
        called++
        return Response.json({})
      }),
      `Bearer ${await token()}`
    )
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('12')
    expect(called).toBe(0)
  })
})
