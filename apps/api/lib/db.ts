// 사용자 권한으로 쿼리하기 (docs/02-db.md 'API의 DB 접속', CLAUDE.md 'API 보안').
// 요청마다 트랜잭션을 열고 PostgREST와 같은 방식으로 역할과 claims를 넣는다:
//   role = authenticated, request.jwt.claims = 검증한 토큰의 claims
// 그러면 RLS 정책과 auth.uid()가 API 경로에서도 그대로 적용된다. 쿼리에는 user_id 조건도 직접 붙인다(이중 확인).
import { sql } from 'drizzle-orm'
import type { AuthContext } from './auth'
import { getRawDb, type Tx } from './db-client'

export type { Tx }

/**
 * fn을 사용자 권한 트랜잭션 안에서 실행한다. fn이 던지면 롤백된다.
 * 라우트의 모든 DB 접근은 이 함수를 지난다.
 */
export function withUserDb<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getRawDb().transaction(async (tx) => {
    // set_config(..., true) = SET LOCAL. 이 트랜잭션이 끝나면 풀러가 연결을 넘기기 전에 원래대로 돌아간다
    await tx.execute(
      sql`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${JSON.stringify(auth.claims)}, true)`
    )
    await assertUserContext(tx, auth.userId)
    return fn(tx)
  })
}

/**
 * 역할 전환이 실제로 됐는지 확인한다. 빠지면 에러 없이 소유자(RLS 건너뜀) 권한으로 쿼리가 돌아
 * 겉으로는 정상처럼 보이므로, 쿼리 전에 여기서 멈춘다.
 *   current_user = authenticated 이고, auth.uid() = 토큰의 사용자여야 한다
 */
export async function assertUserContext(tx: Tx, userId: string): Promise<void> {
  const [row] = await tx.execute<{ role: string; uid: string | null }>(
    sql`select current_user as role, auth.uid()::text as uid`
  )
  if (row?.role !== 'authenticated' || row.uid !== userId) {
    throw new Error(`DB 사용자 권한 전환 실패 (current_user=${row?.role ?? '없음'})`)
  }
}

/**
 * 확장 토큰의 해시로 주인(user_id)을 찾는다. 없거나 폐기됐으면 null.
 * withUserDb의 유일한 예외다: 이 시점엔 누구인지 몰라 RLS로 찾을 수 없다(docs/02-db.md).
 * 테이블 권한이 전혀 없는 baro_token_resolver 역할로 바꾼 뒤 private.resolve_api_token 하나만 부른다.
 * 이 트랜잭션에 다른 쿼리를 추가하지 않는다(CLAUDE.md 'API 보안')
 */
export function resolveApiTokenUser(tokenHash: string): Promise<string | null> {
  return getRawDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'baro_token_resolver', true)`)
    const [who] = await tx.execute<{ role: string }>(sql`select current_user as role`)
    if (who?.role !== 'baro_token_resolver') {
      throw new Error(`DB 토큰 조회 역할 전환 실패 (current_user=${who?.role ?? '없음'})`)
    }
    // ::char(64) — 컬럼과 같은 타입이어야 idx_tokens_hash를 쓴다(함수 인자도 char(64))
    const [row] = await tx.execute<{ user_id: string | null }>(
      sql`select private.resolve_api_token(${tokenHash}::char(64)) as user_id`
    )
    return row?.user_id ?? null
  })
}
