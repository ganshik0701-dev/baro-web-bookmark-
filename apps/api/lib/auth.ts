// API 인증 (docs/03-api.md '공통 규칙').
// 앱: Authorization: Bearer <Supabase 액세스 토큰> → 서버가 JWKS로 서명을 직접 검증한다.
// 확장: Authorization: Bearer baro_<API 토큰> → 해시로 주인을 찾는다(lib/api-tokens.ts).
//        받겠다고 표시한 엔드포인트(withAuth(..., { allowApiToken: true }))에서만 통한다.
// 토큰 값은 로그에 찍지 않는다.
import type { NextRequest } from 'next/server'
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from 'jose'
import { resolveApiToken } from './api-tokens'
import { ApiError, fail } from './errors'

export type AuthContext = {
  userId: string
  /** withUserDb가 request.jwt.claims로 DB에 넣는다(RLS·auth.uid()). 앱은 검증한 토큰의 claims, 확장은 { sub, role } */
  claims: JWTPayload
  /** session = 앱(Supabase 액세스 토큰), apiToken = 확장(baro_) */
  via: 'session' | 'apiToken'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 공개키 묶음. 모듈에 하나만 두고 캐시한다. 모르는 kid가 오면(키 교체) 다시 받아 온다
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function supabaseUrl(): string {
  const url = process.env.SUPABASE_URL
  if (!url) throw new Error('SUPABASE_URL이 apps/api/.env에 없습니다')
  return url.replace(/\/$/, '')
}

function getJwks() {
  jwks ??= createRemoteJWKSet(new URL(`${supabaseUrl()}/auth/v1/.well-known/jwks.json`))
  return jwks
}

/** 토큰이 잘못됐다(401). 서버 쪽 문제(JWKS를 못 받음 등)와 구분하기 위해 따로 둔다 */
class InvalidToken extends Error {}

// jose 오류 중 "토큰이 잘못됐다"는 뜻인 것. 나머지(JWKS 요청 실패·시간 초과)는 서버 문제로 본다
const TOKEN_ERROR_CODES = new Set<string>([
  errors.JWTExpired.code,
  errors.JWTClaimValidationFailed.code,
  errors.JWTInvalid.code,
  errors.JWSInvalid.code,
  errors.JWSSignatureVerificationFailed.code,
  errors.JWKSNoMatchingKey.code,
  errors.JWKSMultipleMatchingKeys.code,
  errors.JOSEAlgNotAllowed.code,
  errors.JOSENotSupported.code
])

/** Supabase 액세스 토큰 검증. 통과하면 사용자 id와 claims를 돌려준다 */
export async function verifyAccessToken(token: string): Promise<AuthContext> {
  let payload: JWTPayload
  try {
    ;({ payload } = await jwtVerify(token, getJwks(), {
      // 이 프로젝트는 ES256 비대칭 키로 서명한다(JWKS 확인). HS256 등 다른 알고리즘은 받지 않는다
      algorithms: ['ES256'],
      issuer: `${supabaseUrl()}/auth/v1`,
      audience: 'authenticated',
      // PC 시계가 조금 틀려도 막 발급된 토큰이 '아직 유효하지 않음'으로 거절되지 않게 한다
      clockTolerance: 5
    }))
  } catch (err) {
    if (err instanceof errors.JOSEError && TOKEN_ERROR_CODES.has(err.code)) {
      throw new InvalidToken(err.code)
    }
    throw err
  }
  // anon 키로 만든 토큰(role=anon)이나 sub가 없는 토큰은 사용자 요청이 아니다
  if (payload.role !== 'authenticated' || typeof payload.sub !== 'string' || !UUID.test(payload.sub)) {
    throw new InvalidToken('role/sub')
  }
  return { userId: payload.sub, claims: payload, via: 'session' }
}

type RouteContext<P> = { params: Promise<P> }
type AuthOptions = {
  /** 확장 토큰(baro_)도 받는다. 기본은 앱 토큰만 (docs/03-api.md '공통 규칙') */
  allowApiToken?: boolean
}
type AuthedHandler<P> = (req: NextRequest, ctx: { auth: AuthContext; params: Promise<P> }) => Promise<Response>

/**
 * 인증이 필요한 라우트를 감싼다. 통과하면 handler에 auth(userId, claims)를 넘긴다.
 *   헤더 없음 → 401 UNAUTHORIZED / 토큰이 잘못됨·만료 → 401 INVALID_TOKEN
 * handler에서 난 예상 못 한 오류는 500 INTERNAL_ERROR로 바꾼다(내부 메시지는 응답에 싣지 않는다)
 */
export function withAuth<P = Record<string, never>>(handler: AuthedHandler<P>, options: AuthOptions = {}) {
  return async (req: NextRequest, { params }: RouteContext<P>): Promise<Response> => {
    const header = req.headers.get('authorization')
    const match = header?.match(/^Bearer\s+(\S+)$/i)
    if (!match) return fail('UNAUTHORIZED', '로그인이 필요합니다')
    const token = match[1]

    let auth: AuthContext
    try {
      if (token.startsWith('baro_')) {
        // 받지 않는 엔드포인트면 DB를 보기 전에 거절한다(토큰이 유효한지도 알려 주지 않는다)
        if (!options.allowApiToken) return fail('INVALID_TOKEN', '확장 토큰으로는 쓸 수 없는 요청입니다')
        const userId = await resolveApiToken(token)
        // 형식 오류·없음·폐기를 구분하지 않고 같은 응답
        if (!userId) return fail('INVALID_TOKEN', '토큰이 유효하지 않거나 만료되었습니다')
        auth = { userId, claims: { sub: userId, role: 'authenticated' }, via: 'apiToken' }
      } else {
        auth = await verifyAccessToken(token)
      }
    } catch (err) {
      if (err instanceof InvalidToken) return fail('INVALID_TOKEN', '토큰이 유효하지 않거나 만료되었습니다')
      console.error('[auth] 토큰 검증 중 서버 오류:', err instanceof Error ? err.message : String(err))
      return fail('INTERNAL_ERROR', '인증을 확인하지 못했습니다')
    }

    try {
      return await handler(req, { auth, params })
    } catch (err) {
      if (err instanceof ApiError) return fail(err.code, err.message, err.details)
      console.error('[api] 처리 중 오류:', err instanceof Error ? err.message : String(err))
      return fail('INTERNAL_ERROR', '요청을 처리하지 못했습니다')
    }
  }
}
