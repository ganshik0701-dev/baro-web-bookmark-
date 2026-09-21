// 북마크 CRUD (BM-01~05, docs/03-api.md). 라우트는 입력만 검증하고 여기를 부른다.
// 모든 쿼리는 withUserDb 안에서 돈다(RLS) + user_id 조건을 직접 붙인다(이중 확인).
// 남의 북마크·그룹은 RLS와 user_id 조건 때문에 '없는 것'으로 보인다. 그래서 403이 아니라 404다(존재 자체를 숨김).
import { randomUUID } from 'node:crypto'
import { domainToUnicode } from 'node:url'
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import { bookmarks, groups } from '@baro/db'
import { normalizeUrl, type Bookmark, type CreateBookmarkInput, type UpdateBookmarkInput } from '@baro/shared'
import type { AuthContext } from './auth'
import { withUserDb, type Tx } from './db'
import { ApiError } from './errors'

type Row = typeof bookmarks.$inferSelect

/** DB 행(snake_case, Date) → 응답(camelCase, ISO 문자열). 변환은 서버에서만 한다 */
function toBookmark(r: Row): Bookmark {
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    iconUrl: r.iconUrl,
    groupId: r.groupId,
    tags: r.tags,
    isPinned: r.isPinned,
    position: r.position,
    clickCount: r.clickCount,
    lastVisitedAt: r.lastVisitedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString()
  }
}

const notFound = () => new ApiError('BOOKMARK_NOT_FOUND', '북마크를 찾을 수 없습니다')
const duplicate = (existingId: string) =>
  new ApiError('DUPLICATE_URL', '이미 저장된 주소입니다', { existingId })

/** 목록. 4주차에는 created_desc만(고정이 먼저). 정렬 5종·필터는 SEARCH-04 */
export function listBookmarks(auth: AuthContext): Promise<Bookmark[]> {
  return withUserDb(auth, async (tx) => {
    const rows = await tx
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.userId, auth.userId))
      .orderBy(desc(bookmarks.isPinned), desc(bookmarks.createdAt))
    return rows.map(toBookmark)
  })
}

export function getBookmark(auth: AuthContext, id: string): Promise<Bookmark> {
  return withUserDb(auth, async (tx) => {
    const [row] = await tx
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, auth.userId)))
    if (!row) throw notFound()
    return toBookmark(row)
  })
}

/**
 * BM-01·03. 같은 정규화 URL이 있으면 409 + existingId.
 * 동시에 두 요청이 같은 URL을 넣어도 하나만 들어간다: 유니크 제약(uq_bm_user_url)에 ON CONFLICT DO NOTHING을 걸고,
 * 아무 행도 들어가지 않았으면 이미 있는 행을 찾아 409로 돌려준다.
 * (READ COMMITTED라서 늦게 온 요청은 먼저 온 요청의 커밋을 기다렸다가 충돌을 알고, 다음 SELECT에서 그 행을 본다)
 */
export function createBookmark(auth: AuthContext, input: CreateBookmarkInput): Promise<Bookmark> {
  const normalized = normalizeUrl(input.url)
  return withUserDb(auth, async (tx) => {
    const groupId = input.groupId ?? null
    if (groupId) await assertOwnGroup(tx, auth, groupId)

    const [row] = await tx
      .insert(bookmarks)
      .values({
        // DB에 기본값이 없어 서버가 만든다(docs/02-db.md)
        id: randomUUID(),
        userId: auth.userId,
        groupId,
        title: input.title ?? titleFromUrl(input.url),
        url: input.url,
        normalizedUrl: normalized,
        iconUrl: input.iconUrl ?? null,
        source: 'manual',
        tags: input.tags ?? [],
        position: await nextPosition(tx, auth, groupId)
      })
      .onConflictDoNothing({ target: [bookmarks.userId, bookmarks.normalizedUrl] })
      .returning()
    if (row) return toBookmark(row)

    const existingId = await findIdByNormalizedUrl(tx, auth, normalized)
    // 충돌했는데 행이 안 보이는 경우는 없어야 한다. 있으면 조용히 넘기지 않고 500으로 드러낸다
    if (!existingId) throw new Error('중복 충돌 후 기존 북마크를 찾지 못했습니다')
    throw duplicate(existingId)
  })
}

/** BM-04. URL을 바꿔 다른 북마크와 겹치면 409, 그룹을 옮기면 새 그룹의 맨 뒤로 */
export async function updateBookmark(auth: AuthContext, id: string, input: UpdateBookmarkInput): Promise<Bookmark> {
  const normalized = input.url ? normalizeUrl(input.url) : undefined
  try {
    return await withUserDb(auth, async (tx) => {
      const [current] = await tx
        .select({ id: bookmarks.id, groupId: bookmarks.groupId })
        .from(bookmarks)
        .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, auth.userId)))
      if (!current) throw notFound()

      if (normalized) {
        const other = await findIdByNormalizedUrl(tx, auth, normalized, id)
        if (other) throw duplicate(other)
      }
      const moving = input.groupId !== undefined && input.groupId !== current.groupId
      if (moving && input.groupId) await assertOwnGroup(tx, auth, input.groupId)

      const [row] = await tx
        .update(bookmarks)
        .set({
          ...(input.url !== undefined && { url: input.url, normalizedUrl: normalized }),
          ...(input.title !== undefined && { title: input.title }),
          ...(input.tags !== undefined && { tags: input.tags }),
          ...(input.iconUrl !== undefined && { iconUrl: input.iconUrl }),
          ...(input.isPinned !== undefined && { isPinned: input.isPinned }),
          ...(moving && {
            groupId: input.groupId ?? null,
            position: await nextPosition(tx, auth, input.groupId ?? null)
          })
          // updated_at은 트리거(set_updated_at)가 바꾼다
        })
        .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, auth.userId)))
        .returning()
      if (!row) throw notFound()
      return toBookmark(row)
    })
  } catch (err) {
    // 위의 중복 확인과 UPDATE 사이에 다른 요청이 같은 URL을 넣은 경우. 트랜잭션은 이미 깨졌으니 새로 찾는다
    if (normalized && isUniqueViolation(err, 'uq_bm_user_url')) {
      const existingId = await withUserDb(auth, (tx) => findIdByNormalizedUrl(tx, auth, normalized, id))
      if (existingId) throw duplicate(existingId)
    }
    throw err
  }
}

/** BM-05. 5초 되돌리기는 앱이 기다렸다가 부르는 방식이라 서버는 바로 지운다(방문 기록은 FK cascade) */
export function deleteBookmark(auth: AuthContext, id: string): Promise<void> {
  return withUserDb(auth, async (tx) => {
    const deleted = await tx
      .delete(bookmarks)
      .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, auth.userId)))
      .returning({ id: bookmarks.id })
    if (deleted.length === 0) throw notFound()
  })
}

// ─── 내부 도우미 ────────────────────────────────────────────

/**
 * FK 검사는 RLS를 받지 않아 남의 그룹 id도 FK는 통과한다. 그래서 내 그룹인지 직접 확인한다.
 * 남의 그룹은 RLS로 안 보이므로 '없음'과 같이 404로 답한다
 */
async function assertOwnGroup(tx: Tx, auth: AuthContext, groupId: string): Promise<void> {
  const [g] = await tx
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.userId, auth.userId)))
  if (!g) throw new ApiError('GROUP_NOT_FOUND', '그룹을 찾을 수 없습니다')
}

/** 같은 그룹(미분류 포함)의 맨 뒤 자리 */
async function nextPosition(tx: Tx, auth: AuthContext, groupId: string | null): Promise<number> {
  const [r] = await tx
    .select({ max: sql<number | null>`max(${bookmarks.position})` })
    .from(bookmarks)
    .where(
      and(eq(bookmarks.userId, auth.userId), groupId ? eq(bookmarks.groupId, groupId) : isNull(bookmarks.groupId))
    )
  return (r?.max ?? 0) + 1
}

async function findIdByNormalizedUrl(
  tx: Tx,
  auth: AuthContext,
  normalized: string,
  excludeId?: string
): Promise<string | null> {
  const [r] = await tx
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, auth.userId),
        eq(bookmarks.normalizedUrl, normalized),
        excludeId ? ne(bookmarks.id, excludeId) : undefined
      )
    )
  return r?.id ?? null
}

/** 제목이 없을 때: 도메인. 한글 도메인은 퓨니코드(xn--)가 아니라 한글로 보여준다 */
function titleFromUrl(href: string): string {
  const host = new URL(href).hostname
  return (domainToUnicode(host) || host).slice(0, 100)
}

/** postgres 유니크 제약 위반인지. Drizzle은 드라이버 오류를 cause에 감싸서 던진다 */
function isUniqueViolation(err: unknown, constraint: string): boolean {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const pg = e as { code?: string; constraint_name?: string }
    if (pg.code === '23505' && pg.constraint_name === constraint) return true
  }
  return false
}
