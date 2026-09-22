// POST /sync/chrome 실행 (docs/03-api.md '/sync/chrome').
// 한 트랜잭션: 사용자 잠금 → 기존 북마크·그룹 한 번에 읽기 → 계획(lib/sync-plan.ts) → 묶음 쓰기.
// 쿼리 수는 북마크 수와 상관없이 거의 일정하다(500행씩 묶어 쓴다).
import { and, eq, inArray, sql } from 'drizzle-orm'
import { bookmarks, groups, profiles } from '@baro/db'
import type { SyncChromeInput, SyncChromeResult } from '@baro/shared'
import type { AuthContext } from './auth'
import { withUserDb, type Tx } from './db'
import { ApiError } from './errors'
import { planSync, type BookmarkChange, type DbSource, type SyncPlan } from './sync-plan'

const CHUNK = 500

const chunks = <T>(list: T[]): T[][] =>
  Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK))

/**
 * 계획을 세운 뒤 다른 요청(POST /bookmarks)이 같은 URL을 넣어 유니크 위반(23505)이 나면 한 번만 다시 시도한다.
 * 다시 읽으면 그 행이 보이므로 계획이 알아서 비켜 간다
 */
export async function syncChrome(auth: AuthContext, input: SyncChromeInput): Promise<SyncChromeResult> {
  try {
    return await runSync(auth, input)
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    return runSync(auth, input)
  }
}

function runSync(auth: AuthContext, input: SyncChromeInput): Promise<SyncChromeResult> {
  const source: DbSource = input.source === 'app' ? 'app_sync' : 'ext_sync'
  return withUserDb(auth, async (tx) => {
    // 같은 사용자의 동기화(앱·확장 동시 요청)를 한 번에 하나씩 처리한다
    await tx.execute(sql`select 1 from public.profiles where id = ${auth.userId} for update`)
    // 그룹 이름 유니크는 커밋 때 검사한다(폴더 이름 맞바꿈이 여러 문장에 걸쳐도 되게. docs/02-db.md)
    await tx.execute(sql`set constraints public.groups_user_id_name_key deferred`)

    const existingBookmarks = await tx
      .select({
        id: bookmarks.id,
        chromeId: bookmarks.chromeId,
        normalizedUrl: bookmarks.normalizedUrl,
        source: bookmarks.source,
        title: bookmarks.title,
        url: bookmarks.url,
        groupId: bookmarks.groupId,
        position: bookmarks.position
      })
      .from(bookmarks)
      .where(eq(bookmarks.userId, auth.userId))
    const existingGroups = await tx
      .select({ id: groups.id, name: groups.name, chromeFolderId: groups.chromeFolderId, position: groups.position })
      .from(groups)
      .where(eq(groups.userId, auth.userId))

    const plan = planSync(input, { bookmarks: existingBookmarks, groups: existingGroups }, source)
    if (plan.massDelete.needsConfirm) {
      // 아무것도 쓰지 않았다(여기서 던지면 트랜잭션도 롤백)
      const { deleteCount, syncedTotal } = plan.massDelete
      throw new ApiError(
        'MASS_DELETE_CONFIRM_REQUIRED',
        `크롬에 없는 북마크 ${deleteCount}개를 지우려고 합니다. 확인 후 confirmDeleteCount를 붙여 다시 보내세요`,
        { deleteCount, syncedTotal }
      )
    }

    await writeGroups(tx, auth, plan)
    await writeBookmarks(tx, auth, plan)

    const [profile] = await tx
      .update(profiles)
      .set({
        lastSyncedAt: sql`now()`,
        // 프로필 이름은 앱만 안다(확장은 보내지 않음)
        ...(input.source === 'app' && input.profile ? { chromeProfile: input.profile } : {})
      })
      .where(eq(profiles.id, auth.userId))
      .returning({ syncedAt: profiles.lastSyncedAt })

    const { invalidUrl, duplicateUrl, manualExists } = plan.skippedReasons
    return {
      created: plan.bookmarks.insert.length,
      updated: plan.bookmarks.update.length,
      deleted: plan.bookmarks.delete.length,
      skipped: invalidUrl + duplicateUrl + manualExists,
      skippedReasons: plan.skippedReasons,
      syncedAt: profile!.syncedAt!.toISOString()
    }
  })
}

async function writeGroups(tx: Tx, auth: AuthContext, plan: SyncPlan) {
  const { insert, update, delete: del } = plan.groups
  if (del.length) {
    // 안의 북마크는 FK(on delete set null)로 미분류가 된다
    await tx.delete(groups).where(and(eq(groups.userId, auth.userId), inArray(groups.id, del)))
  }
  for (const part of chunks(update)) {
    const values = sql.join(
      part.map((g) => sql`(${g.id}::uuid, ${g.name})`),
      sql`, `
    )
    await tx.execute(sql`update public.groups g set name = v.name
      from (values ${values}) as v(id, name)
      where g.id = v.id and g.user_id = ${auth.userId}`)
  }
  for (const part of chunks(insert)) {
    await tx.insert(groups).values(
      part.map((g) => ({ id: g.id, userId: auth.userId, name: g.name, position: g.position, chromeFolderId: g.chromeFolderId }))
    )
  }
}

async function writeBookmarks(tx: Tx, auth: AuthContext, plan: SyncPlan) {
  const { insert, update, delete: del, urlMoves } = plan.bookmarks
  // 순서: 삭제 → 수정 → 추가. 지워질 행의 URL을 다른 행이 이어받을 수 있게
  for (const part of chunks(del)) {
    await tx.delete(bookmarks).where(and(eq(bookmarks.userId, auth.userId), inArray(bookmarks.id, part)))
  }
  // uq_bm_user_url은 한 행씩 즉시 검사한다. URL을 맞바꾸는 경우(A↔B) 한 문장 안에서도 걸리므로
  // URL이 바뀌는 행은 먼저 겹칠 수 없는 임시 값('__moving__:<id>')으로 비워 둔다
  for (const part of chunks(urlMoves)) {
    await tx
      .update(bookmarks)
      .set({ normalizedUrl: sql`'__moving__:' || ${bookmarks.id}::text` })
      .where(and(eq(bookmarks.userId, auth.userId), inArray(bookmarks.id, part)))
  }
  for (const part of chunks(update)) {
    await tx.execute(updateStatement(auth, part))
  }
  for (const part of chunks(insert)) {
    await tx.insert(bookmarks).values(
      part.map((b) => ({
        id: b.id,
        userId: auth.userId,
        groupId: b.groupId,
        title: b.title,
        url: b.url,
        normalizedUrl: b.normalizedUrl,
        source: b.source,
        chromeId: b.chromeId,
        position: b.position,
        ...(b.createdAt ? { createdAt: b.createdAt } : {})
      }))
    )
  }
}

/** 여러 행 수정을 문장 하나로: update … from (values …) */
function updateStatement(auth: AuthContext, rows: BookmarkChange[]) {
  const values = sql.join(
    rows.map((b) => sql`(${b.id}::uuid, ${b.title}, ${b.url}, ${b.normalizedUrl}, ${b.groupId}::uuid, ${b.source})`),
    sql`, `
  )
  return sql`update public.bookmarks b
    set title = v.title, url = v.url, normalized_url = v.normalized_url, group_id = v.group_id, source = v.source
    from (values ${values}) as v(id, title, url, normalized_url, group_id, source)
    where b.id = v.id and b.user_id = ${auth.userId}`
}

/** postgres 유니크 위반인지. Drizzle은 드라이버 오류를 cause에 감싸서 던진다 */
function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: string }).code === '23505') return true
  }
  return false
}
