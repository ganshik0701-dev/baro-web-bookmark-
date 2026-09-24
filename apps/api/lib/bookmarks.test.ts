// BM-01~05 서비스를 실제 DB로 확인한다. 가짜 사용자 A·B를 만들고 끝나면 지운다.
// (auth.users에 넣으면 트리거가 profiles를 만들고, 지우면 cascade로 딸린 행이 모두 지워진다: supabase/checks/02·05와 같은 방식)
// DATABASE_POOLER_URL이 없으면(CI 등) 건너뛴다. 실행: pnpm --filter @baro/api test
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createBookmarkInput, updateBookmarkInput, type Bookmark } from '@baro/shared'
import type { AuthContext } from './auth'
import { createBookmark, deleteBookmark, getBookmark, listBookmarks, recordVisit, updateBookmark } from './bookmarks'
import { closeRawDb, getRawDb } from './db-client'
import { ApiError } from './errors'

function fakeUser(): AuthContext {
  const userId = randomUUID()
  return { userId, claims: { sub: userId, role: 'authenticated', aud: 'authenticated' }, via: 'session' }
}
const A = fakeUser()
const B = fakeUser()
let groupA: string
let groupB: string

// 라우트와 같은 검증을 거친 입력으로 부른다
const create = (auth: AuthContext, body: unknown) => createBookmark(auth, createBookmarkInput.parse(body))
const update = (auth: AuthContext, id: string, body: unknown) => updateBookmark(auth, id, updateBookmarkInput.parse(body))

/** ApiError의 code와 details를 꺼낸다. 다른 오류면 그대로 다시 던진다 */
async function apiError(p: Promise<unknown>): Promise<{ code: string; details?: unknown }> {
  try {
    await p
  } catch (err) {
    if (err instanceof ApiError) return { code: err.code, details: err.details }
    throw err
  }
  throw new Error('오류가 나야 하는데 성공했습니다')
}

describe.skipIf(!process.env.DATABASE_POOLER_URL)('bookmarks (BM-01~05)', () => {
  beforeAll(async () => {
    const db = getRawDb()
    for (const u of [A, B]) {
      await db.execute(sql`insert into auth.users (id, aud, role, email)
        values (${u.userId}, 'authenticated', 'authenticated', ${`bm-test-${u.userId}@example.com`})`)
    }
    groupA = randomUUID()
    groupB = randomUUID()
    await db.execute(sql`insert into public.groups (id, user_id, name, position)
      values (${groupA}, ${A.userId}, 'A의 그룹', 1), (${groupB}, ${B.userId}, 'B의 그룹', 1)`)
  })

  afterAll(async () => {
    await getRawDb().execute(sql`delete from auth.users where id in (${A.userId}, ${B.userId})`)
    await closeRawDb()
  })

  it('추가: 제목이 없으면 도메인, 미분류 맨 뒤 자리', async () => {
    const b = await create(A, { url: 'https://www.naver.com/' })
    expect(b).toMatchObject({ title: 'www.naver.com', url: 'https://www.naver.com/', groupId: null, tags: [] })
    const c = await create(A, { url: 'example.org', title: '예시' })
    expect(c.position).toBe(b.position + 1)
  })

  it('남의 북마크 id로 GET·PATCH·DELETE → 404 (403 아님), 원래 북마크는 그대로', async () => {
    const mine = await create(A, { url: 'https://a-only.example.com/secret', title: 'A의 비밀' })
    expect((await apiError(getBookmark(B, mine.id))).code).toBe('BOOKMARK_NOT_FOUND')
    expect((await apiError(update(B, mine.id, { title: '가로채기' }))).code).toBe('BOOKMARK_NOT_FOUND')
    expect((await apiError(deleteBookmark(B, mine.id))).code).toBe('BOOKMARK_NOT_FOUND')
    expect(await getBookmark(A, mine.id)).toMatchObject({ title: 'A의 비밀' })
    expect((await listBookmarks(B)).map((b) => b.id)).not.toContain(mine.id)
  })

  it('남의 groupId → GROUP_NOT_FOUND (추가·수정 모두), 내 그룹은 된다', async () => {
    expect((await apiError(create(A, { url: 'g1.example.com', groupId: groupB }))).code).toBe('GROUP_NOT_FOUND')
    const b = await create(A, { url: 'g2.example.com', groupId: groupA })
    expect(b.groupId).toBe(groupA)
    expect((await apiError(update(A, b.id, { groupId: groupB }))).code).toBe('GROUP_NOT_FOUND')
    expect((await getBookmark(A, b.id)).groupId).toBe(groupA)
    // 없는 그룹도 같은 응답
    expect((await apiError(create(A, { url: 'g3.example.com', groupId: randomUUID() }))).code).toBe('GROUP_NOT_FOUND')
  })

  it('같은 URL 두 번 → 409 DUPLICATE_URL + existingId (모양이 달라도 정규화가 같으면 중복)', async () => {
    const first = await create(A, { url: 'https://dup.example.com/page/' })
    for (const again of ['dup.example.com/page', 'HTTPS://DUP.example.com/page?utm_source=x']) {
      const e = await apiError(create(A, { url: again }))
      expect(e).toEqual({ code: 'DUPLICATE_URL', details: { existingId: first.id } })
    }
    // 다른 사용자는 같은 URL을 따로 가질 수 있다
    await expect(create(B, { url: 'https://dup.example.com/page/' })).resolves.toMatchObject({ url: 'https://dup.example.com/page/' })
  })

  it('동시에 같은 URL 5개 → 1개만 생기고 나머지 4개는 409 + 그 1개의 id', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => create(A, { url: 'https://race.example.com/' }))
    )
    const created = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(created).toHaveLength(1)
    const winnerId = (created[0] as PromiseFulfilledResult<{ id: string }>).value.id
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(ApiError)
      expect({ code: r.reason.code, details: r.reason.details }).toEqual({
        code: 'DUPLICATE_URL',
        details: { existingId: winnerId }
      })
    }
    const [{ n }] = await getRawDb().execute<{ n: number }>(
      sql`select count(*)::int as n from public.bookmarks where user_id = ${A.userId} and normalized_url = 'https://race.example.com'`
    )
    expect(n).toBe(1)
  })

  it('수정: URL을 바꿔 다른 북마크와 겹치면 409 + existingId, 나머지 필드는 반영', async () => {
    const x = await create(A, { url: 'https://edit-x.example.com' })
    const y = await create(A, { url: 'https://edit-y.example.com' })
    expect(await apiError(update(A, y.id, { url: 'edit-x.example.com/' }))).toEqual({
      code: 'DUPLICATE_URL',
      details: { existingId: x.id }
    })
    const updated = await update(A, y.id, { title: '새 제목', tags: ['개발'], isPinned: true, url: 'edit-z.example.com' })
    expect(updated).toMatchObject({ title: '새 제목', tags: ['개발'], isPinned: true, url: 'https://edit-z.example.com/' })
    // 자기 자신의 URL을 그대로 보내는 것은 중복이 아니다
    await expect(update(A, y.id, { url: 'https://edit-z.example.com/' })).resolves.toBeTruthy()
  })

  it('수정 경쟁: 서로 다른 두 북마크를 동시에 같은 URL로 바꾸면 하나만 되고 하나는 409 + 이긴 쪽 id', async () => {
    const p = await create(A, { url: 'https://race-p.example.com' })
    const q = await create(A, { url: 'https://race-q.example.com' })
    // 여러 번 시도해 '둘 다 중복 확인을 통과한 뒤 UPDATE에서 부딪히는' 경우도 섞이게 한다
    for (let i = 0; i < 5; i++) {
      const target = `https://race-target-${i}.example.com/`
      const results = await Promise.allSettled([update(A, p.id, { url: target }), update(A, q.id, { url: target })])
      const ok = results.filter((r): r is PromiseFulfilledResult<Bookmark> => r.status === 'fulfilled')
      const bad = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      expect(ok).toHaveLength(1)
      expect(bad[0].reason).toBeInstanceOf(ApiError)
      expect({ code: bad[0].reason.code, details: bad[0].reason.details }).toEqual({
        code: 'DUPLICATE_URL',
        details: { existingId: ok[0].value.id }
      })
    }
  })

  it('삭제 후 GET → 404, 목록은 고정이 먼저', async () => {
    const d = await create(A, { url: 'https://delete-me.example.com' })
    await deleteBookmark(A, d.id)
    expect((await apiError(getBookmark(A, d.id))).code).toBe('BOOKMARK_NOT_FOUND')
    const list = await listBookmarks(A)
    const firstUnpinned = list.findIndex((b) => !b.isPinned)
    expect(list.slice(firstUnpinned).every((b) => !b.isPinned)).toBe(true)
  })

  it('응답에 source가 있다: 바로에서 추가한 것은 manual', async () => {
    const b = await create(A, { url: 'https://source-check.example.com' })
    expect(b.source).toBe('manual')
    expect((await listBookmarks(A)).find((x) => x.id === b.id)?.source).toBe('manual')
  })

  it('방문 기록(OPEN-02): 두 번 → click_count 2·last_visited_at·visit_logs 2행, 남의 것·없는 id는 조용히 아무 변화 없음', async () => {
    const v = await create(A, { url: 'https://visit-me.example.com' })
    const logs = async () =>
      Number((await getRawDb().execute(sql`select count(*)::int as n from public.visit_logs where bookmark_id = ${v.id}`))[0].n)

    await recordVisit(A, v.id)
    await recordVisit(A, v.id)
    const after = await getBookmark(A, v.id)
    expect(after.clickCount).toBe(2)
    expect(after.lastVisitedAt).not.toBeNull()
    expect(await logs()).toBe(2)

    // B가 A의 북마크로 불러도 오류 없이 끝나고 아무것도 바뀌지 않는다(존재 여부를 알려 주지 않는다)
    await expect(recordVisit(B, v.id)).resolves.toBeUndefined()
    await expect(recordVisit(A, randomUUID())).resolves.toBeUndefined()
    expect((await getBookmark(A, v.id)).clickCount).toBe(2)
    expect(await logs()).toBe(2)
  })
})
