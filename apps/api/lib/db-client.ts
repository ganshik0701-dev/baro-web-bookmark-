// DB 연결. 접속 계정(postgres)은 테이블 소유자라 이대로 쿼리하면 RLS를 건너뛴다.
// 그래서 라우트는 이 파일을 직접 import하지 않는다. 쿼리는 반드시 lib/db.ts의 withUserDb로 한다.
// (이 파일을 쓰는 곳은 lib/db.ts와 그 테스트뿐이다)
import postgres from 'postgres'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '@baro/db'

export type Db = PostgresJsDatabase<typeof schema>
/** withUserDb 안에서 쓰는 트랜잭션 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

let db: Db | null = null
let client: postgres.Sql | null = null

// 처음 쓸 때 만든다. 빌드(next build)가 라우트 모듈을 읽을 때 환경 변수가 없어도 실패하지 않게 하기 위해서다
export function getRawDb(): Db {
  if (db) return db
  const url = process.env.DATABASE_POOLER_URL
  if (!url) throw new Error('DATABASE_POOLER_URL이 apps/api/.env에 없습니다')
  // Supavisor 트랜잭션 풀러(6543): 트랜잭션이 끝나면 연결을 다른 요청과 나눠 쓴다.
  // - prepare: false  → 풀러는 준비된 문장(prepared statement)을 연결 사이에 유지하지 못한다
  // - max: 1          → 서버리스 함수 하나가 연결을 여러 개 잡지 않게 한다
  client = postgres(url, { prepare: false, max: 1 })
  db = drizzle(client, { schema })
  return db
}

/** 테스트가 끝날 때 연결을 닫는다(열어 두면 테스트 프로세스가 끝나지 않는다) */
export async function closeRawDb(): Promise<void> {
  await client?.end()
  client = null
  db = null
}
