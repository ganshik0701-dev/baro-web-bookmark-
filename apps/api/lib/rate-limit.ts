// 속도 제한 (docs/03-api.md '속도 제한', docs/02-db.md '속도 제한 (007)').
//
// 기준은 사용자다. 앱 토큰과 확장 토큰은 같은 사용자면 한 카운터를 나눠 쓴다.
// 한 요청이 global과 해당 버킷을 함께 올리고, 둘 중 하나라도 한도를 넘으면 429다.
//
// 세는 곳은 `private.hit_rate_limit` 하나뿐이다(CLAUDE.md 'API 보안'의 예외 둘 중 하나).
// 라우트의 withUserDb 트랜잭션 **밖에서** 돈다: 요청이 실패해 롤백돼도 카운트는 남아야 하기 때문이다
// (일부러 오류를 내서 한도를 피할 수 없게).
import { sql } from 'drizzle-orm'
import { getRawDb } from './db-client'

/** 버킷과 분당 한도. 한도는 여기 있고 DB는 세기만 한다(바꾸려고 마이그레이션하지 않게) */
export const LIMITS = {
  global: 120,
  metadata: 20,
  sync: 10
} as const

export type RateBucket = keyof typeof LIMITS

export type RateLimitResult =
  | { ok: true }
  /** 넘긴 버킷과 윈도가 끝날 때까지 남은 초 */
  | { ok: false; bucket: RateBucket; retryAfter: number }

type Hit = { hit_bucket: string; hit_count: number }

/** 이번 분이 끝날 때까지 남은 초(최소 1). 429의 retry-after에 쓴다 */
function secondsLeftInWindow(now = new Date()): number {
  return Math.max(1, 60 - now.getSeconds())
}

/**
 * global과 (있으면) 엔드포인트 버킷을 함께 올리고 한도를 넘었는지 본다.
 * DB 왕복은 1회다.
 *
 * 세지 못하면(DB 오류) 요청을 막지 않고 통과시킨다. 속도 제한이 고장 났다고 해서
 * 서비스 전체가 멈추는 것이 더 나쁘다(fail-open). 대신 서버 로그에 남긴다
 */
export async function checkRateLimit(userId: string, endpoint?: RateBucket): Promise<RateLimitResult> {
  const buckets: RateBucket[] = endpoint ? ['global', endpoint] : ['global']

  let hits: Hit[]
  try {
    hits = await getRawDb().transaction(async (tx) => {
      // 전용 역할로 바꿔 함수 하나만 부른다. SET LOCAL이라 트랜잭션이 끝나면 돌아온다
      await tx.execute(sql`set local role baro_rate_limiter`)
      // 배열은 sql.param으로 감싼다. 그냥 넣으면 drizzle이 요소마다 파라미터를 만들어
      // ($2, $3)::text[] 같은 잘못된 SQL이 된다
      return tx.execute<Hit>(
        sql`select * from private.hit_rate_limit(${userId}::uuid, ${sql.param(buckets)}::text[])`
      )
    })
  } catch (err) {
    console.error('[rate-limit] 세지 못했습니다:', err instanceof Error ? err.message : String(err))
    return { ok: true }
  }

  for (const hit of hits) {
    const bucket = hit.hit_bucket as RateBucket
    const limit = LIMITS[bucket]
    if (limit !== undefined && hit.hit_count > limit) {
      return { ok: false, bucket, retryAfter: secondsLeftInWindow() }
    }
  }
  return { ok: true }
}
