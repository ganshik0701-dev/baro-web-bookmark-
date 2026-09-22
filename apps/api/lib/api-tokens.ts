// 확장 API 토큰 (EXT-01, docs/03-api.md '/tokens', docs/02-db.md 'api_tokens').
// 원본 토큰은 발급 응답에만 싣는다. DB에는 SHA-256 해시와 앞 8자(prefix)만 저장하고, 로그에 찍지 않는다.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { apiTokens } from '@baro/db'
import type { ApiToken, CreateTokenInput, IssuedApiToken } from '@baro/shared'
import type { AuthContext } from './auth'
import { resolveApiTokenUser, withUserDb } from './db'
import { ApiError } from './errors'

const TOKEN_PREFIX = 'baro_'
/** baro_ + 32바이트 base64url(43자). 이 모양이 아니면 DB를 보지 않고 거절한다 */
const TOKEN_FORMAT = /^baro_[A-Za-z0-9_-]{43}$/

export function isApiTokenFormat(token: string): boolean {
  return TOKEN_FORMAT.test(token)
}

/** SHA-256 hex(64자). DB의 token_hash와 같은 값 */
export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** 새 토큰 원본. 256비트 난수라 해시만으로는 원본을 되찾을 수 없다 */
export function generateApiToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url')
}

/**
 * 확장 토큰 → user_id. 형식이 틀리면 DB에 묻지 않고 null.
 * 비교는 DB가 인덱스(idx_tokens_hash)로 한다. 코드에서 목록을 읽어 문자열을 비교하지 않는다
 */
export async function resolveApiToken(token: string): Promise<string | null> {
  if (!isApiTokenFormat(token)) return null
  return resolveApiTokenUser(hashApiToken(token))
}

// 응답에 싣는 컬럼만 고른다. token_hash는 읽지도 않는다
const publicColumns = {
  id: apiTokens.id,
  name: apiTokens.name,
  prefix: apiTokens.prefix,
  lastUsedAt: apiTokens.lastUsedAt,
  createdAt: apiTokens.createdAt
}

type Row = { id: string; name: string; prefix: string; lastUsedAt: Date | null; createdAt: Date }

function toApiToken(row: Row): ApiToken {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  }
}

/** POST /tokens. 5개 제한은 DB 트리거(enforce_api_token_limit)가 동시 요청까지 지킨다 */
export async function createToken(auth: AuthContext, input: CreateTokenInput): Promise<IssuedApiToken> {
  const token = generateApiToken()
  try {
    const [row] = await withUserDb(auth, (tx) =>
      tx
        .insert(apiTokens)
        .values({
          id: randomUUID(),
          userId: auth.userId,
          name: input.name,
          tokenHash: hashApiToken(token),
          prefix: token.slice(0, 8)
        })
        .returning(publicColumns)
    )
    return { ...toApiToken(row!), token }
  } catch (err) {
    if (isTokenLimitError(err)) throw new ApiError('TOKEN_LIMIT_EXCEEDED', '토큰은 5개까지 만들 수 있습니다. 쓰지 않는 토큰을 폐기하세요')
    throw err
  }
}

/** GET /tokens. 최근 발급순 */
export function listTokens(auth: AuthContext): Promise<ApiToken[]> {
  return withUserDb(auth, async (tx) => {
    const rows = await tx
      .select(publicColumns)
      .from(apiTokens)
      // RLS가 이미 내 것만 보여주지만 조건을 직접 붙인다(이중 확인)
      .where(eq(apiTokens.userId, auth.userId))
      .orderBy(desc(apiTokens.createdAt))
    return rows.map(toApiToken)
  })
}

/** DELETE /tokens/:id. 없거나 남의 것이면 404 (있다는 사실도 알려 주지 않는다) */
export async function deleteToken(auth: AuthContext, id: string): Promise<void> {
  const deleted = await withUserDb(auth, (tx) =>
    tx
      .delete(apiTokens)
      .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, auth.userId)))
      .returning({ id: apiTokens.id })
  )
  if (deleted.length === 0) throw new ApiError('TOKEN_NOT_FOUND', '토큰을 찾을 수 없습니다')
}

/** 트리거가 던진 5개 초과 오류인지. Drizzle은 드라이버 오류를 cause에 감싸서 던진다 */
function isTokenLimitError(err: unknown): boolean {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const pg = e as { code?: string; message?: string }
    if (pg.code === 'P0001' && pg.message === 'TOKEN_LIMIT_EXCEEDED') return true
  }
  return false
}
