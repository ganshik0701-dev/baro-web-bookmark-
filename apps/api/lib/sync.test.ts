// POST /sync/chrome을 실제 DB로 확인한다. 실제 크롬 Bookmarks 파일 모양의 샘플(test/fixtures)을 평탄화해 보낸다.
// 가짜 사용자 A·B를 만들고 끝나면 지운다. DATABASE_POOLER_URL이 없으면(CI 등) 건너뛴다.
// 실행: pnpm --filter @baro/api test lib/sync.test.ts
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createBookmarkInput, createTokenInput, syncChromeInput, type SyncChromeInput } from '@baro/shared'
import { POST as syncRoute } from '@/app/api/v1/sync/chrome/route'
import {
  findNode,
  flattenChromeFile,
  generateChromeFile,
  loadFixture,
  removeNode,
  type ChromeFile
} from '../test/chrome-bookmarks'
import { createToken } from './api-tokens'
import type { AuthContext } from './auth'
import { createBookmark } from './bookmarks'
import { closeRawDb, getRawDb } from './db-client'
import { ApiError } from './errors'
import { syncChrome } from './sync'

function fakeUser(): AuthContext {
  const userId = randomUUID()
  return { userId, claims: { sub: userId, role: 'authenticated', aud: 'authenticated' }, via: 'session' }
}
const A = fakeUser()
const B = fakeUser()

const request = (file: ChromeFile, extra: Partial<SyncChromeInput> = {}): SyncChromeInput =>
  syncChromeInput.parse({ mode: 'full', source: 'app', profile: 'Default', ...flattenChromeFile(file), ...extra })

type Row = { chrome_id: string | null; title: string; url: string; source: string; group: string | null }
/** 소유자 권한으로 실제 저장된 상태를 본다 */
async function state(userId: string) {
  const bookmarks = await getRawDb().execute<Row>(sql`
    select b.chrome_id, b.title, b.url, b.source, g.name as "group"
      from public.bookmarks b left join public.groups g on g.id = b.group_id
     where b.user_id = ${userId} order by b.chrome_id nulls first, b.url`)
  const groups = await getRawDb().execute<{ name: string; chrome_folder_id: string | null }>(
    sql`select name, chrome_folder_id from public.groups where user_id = ${userId} order by position`
  )
  const byChrome = new Map(bookmarks.map((b) => [b.chrome_id, b]))
  return { bookmarks, groups, byChrome }
}

async function apiError(p: Promise<unknown>): Promise<{ code: string; details?: unknown }> {
  try {
    await p
  } catch (err) {
    if (err instanceof ApiError) return { code: err.code, details: err.details }
    throw err
  }
  throw new Error('오류가 나야 하는데 성공했습니다')
}

describe.skipIf(!process.env.DATABASE_POOLER_URL)('/sync/chrome (실제 DB)', () => {
  beforeAll(async () => {
    for (const u of [A, B]) {
      await getRawDb().execute(sql`insert into auth.users (id, aud, role, email)
        values (${u.userId}, 'authenticated', 'authenticated', ${`sync-test-${u.userId}@example.com`})`)
    }
    // B도 같은 크롬 id(샘플)로 동기화해 둔다. A의 동기화가 B를 건드리지 않는지 매 테스트 끝에 본다
    await syncChrome(B, request(loadFixture()))
  })

  afterAll(async () => {
    await getRawDb().execute(sql`delete from auth.users where id in (${A.userId}, ${B.userId})`)
    await closeRawDb()
  })

  let bBefore: string
  beforeEach(async () => {
    await getRawDb().execute(sql`delete from public.bookmarks where user_id = ${A.userId}`)
    await getRawDb().execute(sql`delete from public.groups where user_id = ${A.userId}`)
    bBefore = JSON.stringify(await state(B.userId))
  })

  const expectBUntouched = async () => expect(JSON.stringify(await state(B.userId))).toBe(bBefore)

  it('첫 전체 동기화: 샘플 파일 그대로 반영', async () => {
    const r = await syncChrome(A, request(loadFixture()))
    expect(r).toMatchObject({
      created: 10,
      updated: 0,
      deleted: 0,
      skipped: 3,
      skippedReasons: { invalidUrl: 2, duplicateUrl: 1, manualExists: 0 }
    })
    const s = await state(A.userId)
    expect(s.groups.map((g) => g.name)).toEqual([
      '개발',
      '개발/프론트엔드',
      '…/상태 관리 라이브러리 비교 모음 (2026년 정리)',
      '빈 폴더',
      '개발 (2)'
    ])
    expect(s.byChrome.get('12')).toMatchObject({ title: 'Zustand', group: '…/상태 관리 라이브러리 비교 모음 (2026년 정리)', source: 'app_sync' })
    expect(s.byChrome.get('6')!.group).toBeNull()
    expect(s.byChrome.get('21')!.group).toBe('개발 (2)')
    expect(s.byChrome.has('14')).toBe(false) // javascript:
    const [p] = await getRawDb().execute<{ chrome_profile: string; synced: boolean }>(
      sql`select chrome_profile, last_synced_at is not null as synced from public.profiles where id = ${A.userId}`
    )
    expect(p).toEqual({ chrome_profile: 'Default', synced: true })
    const [created] = await getRawDb().execute<{ created_at: string }>(
      sql`select created_at::text from public.bookmarks where user_id = ${A.userId} and chrome_id = '5'`
    )
    expect(new Date(created!.created_at).toISOString()).toBe('2026-08-01T03:00:00.000Z')
    await expectBUntouched()
  })

  it('그대로 다시 보내면 0건 (쓰기 없음)', async () => {
    await syncChrome(A, request(loadFixture()))
    const before = await getRawDb().execute(sql`select id, updated_at from public.bookmarks where user_id = ${A.userId} order by id`)
    const r = await syncChrome(A, request(loadFixture()))
    expect(r).toMatchObject({ created: 0, updated: 0, deleted: 0, skipped: 3 })
    const after = await getRawDb().execute(sql`select id, updated_at from public.bookmarks where user_id = ${A.userId} order by id`)
    expect(after).toEqual(before)
  })

  it('크롬에서 바꾼 뒤 전체 동기화: 폴더 이름 변경(하위 경로도)·이동·삭제·URL 맞바꿈·폴더 이름 맞바꿈', async () => {
    await syncChrome(A, request(loadFixture()))
    const file = loadFixture()
    findNode(file, '9').node.name = 'UI' // 개발/프론트엔드 → 개발/UI, 그 아래 경로도
    const { node: naver } = findNode(file, '6') // 네이버를 개발 폴더로 이동
    removeNode(file, '6')
    findNode(file, '7').node.children!.push(naver)
    removeNode(file, '22') // 삭제
    findNode(file, '8').node.url = 'https://react.dev/' // URL 맞바꿈
    findNode(file, '10').node.url = 'https://developer.mozilla.org/ko/'
    findNode(file, '17').node.name = '개발' // 폴더 이름 맞바꿈: 북마크바/개발(7) ↔ 빈 폴더(17)
    findNode(file, '7').node.name = '빈 폴더'

    const r = await syncChrome(A, request(file))
    expect(r).toMatchObject({ created: 0, deleted: 1, skipped: 3 })
    const s = await state(A.userId)
    expect(s.byChrome.get('6')!.group).toBe('빈 폴더')
    expect(s.byChrome.get('10')).toMatchObject({ url: 'https://developer.mozilla.org/ko/', group: '빈 폴더/UI' })
    expect(s.byChrome.get('8')!.url).toBe('https://react.dev/')
    expect(s.byChrome.has('22')).toBe(false)
    expect(s.groups.map((g) => g.name).sort()).toEqual(
      ['개발', '개발 (2)', '빈 폴더', '빈 폴더/UI', '…/상태 관리 라이브러리 비교 모음 (2026년 정리)'].sort()
    )
    await expectBUntouched()
  })

  it('직접 추가한 북마크와 같은 URL: 크롬 쪽을 건너뛰고 직접 추가한 행은 그대로', async () => {
    const mine = await createBookmark(A, createBookmarkInput.parse({ url: 'https://react.dev', title: '내가 추가한 리액트' }))
    const r = await syncChrome(A, request(loadFixture()))
    expect(r.skippedReasons.manualExists).toBe(1)
    const s = await state(A.userId)
    expect(s.byChrome.has('10')).toBe(false)
    const manualRow = s.bookmarks.find((b) => b.chrome_id === null)!
    expect(manualRow).toMatchObject({ title: '내가 추가한 리액트', source: 'manual' })
    // 크롬에서 전부 지워도(빈 full) manual은 남는다
    const empty = await syncChrome(A, syncChromeInput.parse({ mode: 'full', source: 'app', confirmDeleteCount: 9 }))
    expect(empty.deleted).toBe(9)
    expect((await state(A.userId)).bookmarks.map((b) => b.chrome_id)).toEqual([null])
    expect(mine.id).toBeTruthy()
  })

  it('대량 삭제: 확인 없으면 409 + 개수, 아무것도 안 바뀜 → 확인 개수를 붙이면 실행', async () => {
    await syncChrome(A, request(generateChromeFile(3, 20))) // 60개
    const fewer = generateChromeFile(1, 20) // 첫 폴더 20개만 남음 → 40개 삭제
    const before = JSON.stringify(await state(A.userId))
    const err = await apiError(syncChrome(A, request(fewer)))
    expect(err).toMatchObject({ code: 'MASS_DELETE_CONFIRM_REQUIRED', details: { deleteCount: 40, syncedTotal: 60 } })
    const preview = (err.details as { preview: { title: string; url: string }[] }).preview
    expect(preview).toHaveLength(5)
    // 지워질 것(2·3번째 폴더)만, 남을 것(첫 폴더 /0/)은 없다
    for (const p of preview) expect(p.url).toMatch(/^https:\/\/perf\.example\.com\/[12]\//)
    expect(JSON.stringify(await state(A.userId))).toBe(before)
    // 확인한 개수보다 많이 지워야 하면 다시 409
    expect((await apiError(syncChrome(A, request(fewer, { confirmDeleteCount: 39 })))).code).toBe('MASS_DELETE_CONFIRM_REQUIRED')
    const r = await syncChrome(A, request(fewer, { confirmDeleteCount: 40 }))
    expect(r).toMatchObject({ created: 0, deleted: 40 })
    expect((await state(A.userId)).bookmarks).toHaveLength(20)
  })

  // 확인한 개수(confirmDeleteCount)의 경계. 실제 삭제 40개 기준
  it.each([
    [39, 'MASS_DELETE_CONFIRM_REQUIRED', 60], // 확인보다 많이 지워야 함 → 다시 확인
    [40, null, 20], // 같음 → 실행
    [41, null, 20] // 확인보다 적게 지움 → 실행(문서: 실제 삭제 수가 확인 값 '이하'일 때 실행)
  ])('confirmDeleteCount %i (실제 삭제 40)', async (confirm, code, remaining) => {
    await syncChrome(A, request(generateChromeFile(3, 20)))
    const run = syncChrome(A, request(generateChromeFile(1, 20), { confirmDeleteCount: confirm }))
    if (code) expect((await apiError(run)).code).toBe(code)
    else expect(await run).toMatchObject({ deleted: 40 })
    expect((await state(A.userId)).bookmarks).toHaveLength(remaining)
  })

  it('partial(확장): 추가·수정·삭제만, source는 ext_sync', async () => {
    await syncChrome(A, request(loadFixture()))
    const ext: AuthContext = { ...A, via: 'apiToken' }
    const r = await syncChrome(
      ext,
      syncChromeInput.parse({
        mode: 'partial',
        source: 'extension',
        folders: [{ chromeId: '60', parentChromeId: '9', title: '테스트' }],
        bookmarks: [
          { chromeId: '61', parentChromeId: '60', title: 'Vitest', url: 'https://vitest.dev/' },
          { chromeId: '5', parentChromeId: '1', title: 'GitHub 홈', url: 'https://github.com/' }
        ],
        deletedChromeIds: ['6', '17']
      })
    )
    expect(r).toMatchObject({ created: 1, updated: 1, deleted: 1, skipped: 0 })
    const s = await state(A.userId)
    expect(s.byChrome.get('61')).toMatchObject({ group: '개발/프론트엔드/테스트', source: 'ext_sync' })
    expect(s.byChrome.get('5')).toMatchObject({ title: 'GitHub 홈', source: 'ext_sync' })
    expect(s.byChrome.get('8')!.source).toBe('app_sync') // 보내지 않은 항목은 그대로
    expect(s.groups.some((g) => g.chrome_folder_id === '17')).toBe(false)
  })

  it('동시 요청: 같은 전체 동기화 3개 + 다른 URL 직접 추가가 겹쳐도 줄 서서 처리, 실패 없음', async () => {
    const results = await Promise.allSettled([
      syncChrome(A, request(loadFixture())),
      syncChrome(A, request(loadFixture())),
      syncChrome(A, request(loadFixture())),
      createBookmark(A, createBookmarkInput.parse({ url: 'https://vitest.dev', title: '직접' }))
    ])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled'])
    const created = results.slice(0, 3).map((r) => (r as PromiseFulfilledResult<{ created: number }>).value.created)
    expect(created.sort()).toEqual([0, 0, 10]) // 줄 서서 처리: 첫 번째만 만든다
    expect((await state(A.userId)).bookmarks).toHaveLength(11)
  })

  it('5,000개: 첫 동기화·변화 없음·500개 수정 시간', async () => {
    const big = generateChromeFile(50, 100)
    const time = async (label: string, input: SyncChromeInput) => {
      const t = Date.now()
      const r = await syncChrome(A, input)
      const ms = Date.now() - t
      console.log(`[5,000개] ${label}: ${ms}ms`, JSON.stringify({ created: r.created, updated: r.updated, deleted: r.deleted }))
      return { r, ms }
    }
    const first = await time('첫 동기화', request(big))
    expect(first.r.created).toBe(5000)
    const same = await time('변화 없음', request(big))
    expect(same.r).toMatchObject({ created: 0, updated: 0, deleted: 0 })
    for (const folder of big.roots.bookmark_bar!.children!.slice(0, 5)) {
      for (const b of folder.children!) b.name += ' (수정)'
    }
    const edit = await time('500개 수정', request(big))
    expect(edit.r.updated).toBe(500)
    // Vercel 함수 제한(60초)보다 한참 아래여야 한다
    for (const { ms } of [first, same, edit]) expect(ms).toBeLessThan(15_000)
  }, 120_000)

  describe('라우트', () => {
    const post = (token: string, body: string, headers: Record<string, string> = {}) =>
      syncRoute(
        new NextRequest('http://localhost/api/v1/sync/chrome', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
          body
        }),
        { params: Promise.resolve({}) }
      )

    it('확장 토큰: source extension이면 200(ext_sync), app이면 400', async () => {
      const t = await createToken(A, createTokenInput.parse({ name: '동기화 테스트' }))
      const body = (source: string) =>
        JSON.stringify({ mode: 'partial', source, bookmarks: [{ chromeId: '70', title: 'Deno', url: 'https://deno.com/' }] })
      const bad = await post(t.token, body('app'))
      expect(bad.status).toBe(400)
      expect((await bad.json()).error.code).toBe('VALIDATION_ERROR')
      const res = await post(t.token, body('extension'))
      expect(res.status).toBe(200)
      expect((await res.json()).data).toMatchObject({ created: 1 })
      expect((await state(A.userId)).byChrome.get('70')!.source).toBe('ext_sync')
      await getRawDb().execute(sql`delete from public.api_tokens where user_id = ${A.userId}`)
    })

    it('2MB 초과 → 413 (Content-Length로도, 실제 크기로도)', async () => {
      const t = await createToken(A, createTokenInput.parse({ name: '크기 테스트' }))
      const huge = JSON.stringify({
        mode: 'partial',
        source: 'extension',
        bookmarks: [{ chromeId: '1', title: 'x'.repeat(2 * 1024 * 1024), url: 'https://x.example.com/' }]
      })
      const res = await post(t.token, huge)
      expect(res.status).toBe(413)
      expect((await res.json()).error.code).toBe('PAYLOAD_TOO_LARGE')
      const lying = await post(t.token, huge, { 'content-length': '100' })
      expect(lying.status).toBe(413)
      await getRawDb().execute(sql`delete from public.api_tokens where user_id = ${A.userId}`)
    })
  })
})
