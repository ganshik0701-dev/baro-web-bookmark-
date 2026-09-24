// 인증 API 호출 공통 부분(authedFetch)과 GET /bookmarks(fetchBookmarks).
// 진짜 서버 없이 가짜 fetch로, 요청이 몇 번 나갔는지와 어떤 토큰을 실었는지를 센다.
import { describe, expect, it } from 'vitest'
import {
  authedFetch,
  deleteBookmarkById,
  fetchBookmarks,
  isBookmarkId,
  patchPinned,
  postVisit,
  type ApiDeps
} from '../src/main/api-client'

const BOOKMARK = {
  id: 'b1',
  title: 'GitHub',
  url: 'https://github.com/',
  iconUrl: null,
  groupId: null,
  tags: [],
  isPinned: false,
  position: 1,
  clickCount: 0,
  lastVisitedAt: null,
  createdAt: '2026-09-24T00:00:00.000Z'
}

type Reply = { status: number; body?: unknown; text?: string } | 'network-error'

/** 응답을 차례대로 돌려주는 가짜 서버. 토큰은 부를 때마다 tokens에서 하나씩 꺼낸다 */
function setup(replies: Reply[], opts: { tokens?: (string | null)[]; refreshOk?: boolean } = {}) {
  const tokens = [...(opts.tokens ?? ['t1', 't2'])]
  const sent: { url: string; method: string; auth: string | undefined; body: unknown }[] = []
  let refreshes = 0
  const deps: ApiDeps = {
    apiBaseUrl: 'http://api.test/api/v1',
    getAccessToken: async () => (tokens.length > 1 ? tokens.shift()! : tokens[0]) ?? null,
    forceRefresh: async () => {
      refreshes++
      return opts.refreshOk ?? true
    },
    fetch: (async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>
      sent.push({ url, method: init.method ?? 'GET', auth: headers.authorization, body: init.body })
      const r = replies.shift()
      if (!r) throw new Error('예상보다 요청이 많다')
      if (r === 'network-error') throw new TypeError('fetch failed')
      // 204는 본문이 없어야 한다(Response가 본문 있는 204를 거절한다)
      return new Response(r.status === 204 ? null : (r.text ?? JSON.stringify(r.body)), { status: r.status })
    }) as typeof fetch
  }
  return { deps, sent, refreshes: () => refreshes }
}

describe('authedFetch', () => {
  it('토큰을 Bearer로 붙여 한 번 보낸다', async () => {
    const s = setup([{ status: 200, body: { data: 1 } }])
    const r = await authedFetch(s.deps, '/me', { timeoutMs: 1000 })
    expect(r.kind).toBe('response')
    expect(s.sent).toEqual([{ url: 'http://api.test/api/v1/me', method: 'GET', auth: 'Bearer t1', body: undefined }])
  })

  it('토큰이 없으면 요청을 보내지 않는다', async () => {
    const s = setup([], { tokens: [null] })
    const r = await authedFetch(s.deps, '/me', { timeoutMs: 1000 })
    expect(r).toMatchObject({ kind: 'error', code: 'UNAUTHORIZED' })
    expect(s.sent).toHaveLength(0)
  })

  it('401이면 갱신 후 새 토큰으로 딱 1회 다시 보낸다', async () => {
    const s = setup([{ status: 401, body: {} }, { status: 200, body: {} }])
    const r = await authedFetch(s.deps, '/me', { timeoutMs: 1000 })
    expect(r.kind).toBe('response')
    expect(s.refreshes()).toBe(1)
    expect(s.sent.map((x) => x.auth)).toEqual(['Bearer t1', 'Bearer t2'])
  })

  it('재시도도 401이면 거기서 끝낸다(요청 2회, 갱신 1회)', async () => {
    const s = setup([{ status: 401, body: {} }, { status: 401, body: {} }])
    const r = await authedFetch(s.deps, '/me', { timeoutMs: 1000 })
    expect(r).toMatchObject({ kind: 'error', code: 'UNAUTHORIZED', message: '로그인이 만료됐습니다. 다시 로그인하세요' })
    expect(s.sent).toHaveLength(2)
    expect(s.refreshes()).toBe(1)
  })

  it('갱신이 실패하면 다시 보내지 않는다', async () => {
    const s = setup([{ status: 401, body: {} }], { refreshOk: false })
    const r = await authedFetch(s.deps, '/me', { timeoutMs: 1000 })
    expect(r).toMatchObject({ kind: 'error', code: 'UNAUTHORIZED' })
    expect(s.sent).toHaveLength(1)
  })

  it('401이 아닌 오류는 재시도하지 않고 응답을 그대로 돌려준다', async () => {
    const s = setup([{ status: 500, body: {} }])
    const r = await authedFetch(s.deps, '/me', { timeoutMs: 1000 })
    expect(r.kind === 'response' && r.res.status).toBe(500)
    expect(s.sent).toHaveLength(1)
    expect(s.refreshes()).toBe(0)
  })

  it('연결 실패는 NETWORK', async () => {
    const s = setup(['network-error'])
    expect(await authedFetch(s.deps, '/me', { timeoutMs: 1000 })).toMatchObject({ kind: 'error', code: 'NETWORK' })
  })

  it('본문이 있으면 content-type을 붙여 POST한다', async () => {
    const s = setup([{ status: 200, body: {} }])
    await authedFetch(s.deps, '/sync/chrome', { method: 'POST', body: '{"a":1}', timeoutMs: 1000 })
    expect(s.sent[0]).toMatchObject({ method: 'POST', body: '{"a":1}' })
  })
})

describe('fetchBookmarks (GET /bookmarks)', () => {
  it('200이면 data와 meta를 그대로 넘긴다', async () => {
    const s = setup([{ status: 200, body: { data: [BOOKMARK], meta: { total: 1 } } }])
    expect(await fetchBookmarks(s.deps)).toEqual({ data: [BOOKMARK], meta: { total: 1 } })
    expect(s.sent[0].url).toBe('http://api.test/api/v1/bookmarks')
  })

  it('meta가 없으면 개수로 채운다', async () => {
    const s = setup([{ status: 200, body: { data: [BOOKMARK, { ...BOOKMARK, id: 'b2' }] } }])
    expect(await fetchBookmarks(s.deps)).toMatchObject({ meta: { total: 2 } })
  })

  it('서버 오류 본문은 코드·메시지만 넘긴다', async () => {
    const s = setup([{ status: 429, body: { error: { code: 'RATE_LIMITED', message: '잠시 뒤', details: { bucket: 'global' } } } }])
    expect(await fetchBookmarks(s.deps)).toEqual({ error: { code: 'RATE_LIMITED', message: '잠시 뒤' } })
  })

  it('JSON이 아닌 응답은 HTTP_상태코드', async () => {
    const s = setup([{ status: 502, text: '<html>Bad Gateway</html>' }])
    expect(await fetchBookmarks(s.deps)).toEqual({ error: { code: 'HTTP_502', message: '서버가 502로 응답했습니다' } })
  })

  it('200인데 data가 배열이 아니면 오류로 본다', async () => {
    const s = setup([{ status: 200, body: { data: { id: 'x' } } }])
    expect(await fetchBookmarks(s.deps)).toMatchObject({ error: { code: 'HTTP_200' } })
  })

  it('401 → 갱신 → 재시도로 목록을 받는다', async () => {
    const s = setup([{ status: 401, body: {} }, { status: 200, body: { data: [BOOKMARK], meta: { total: 1 } } }])
    expect(await fetchBookmarks(s.deps)).toMatchObject({ meta: { total: 1 } })
    expect(s.sent).toHaveLength(2)
  })

  it('로그인이 없으면 요청 없이 UNAUTHORIZED', async () => {
    const s = setup([], { tokens: [null] })
    expect(await fetchBookmarks(s.deps)).toEqual({ error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다' } })
    expect(s.sent).toHaveLength(0)
  })
})

describe('북마크 하나에 대한 요청 (OPEN-02·03, BM-05)', () => {
  const ID = '36ea8f78-0e5e-4948-9911-d0d4b20c6085'

  it.each([
    ['../me', false],
    ['36ea8f78-0e5e-4948-9911-d0d4b20c6085/../../me', false],
    ['not-a-uuid', false],
    ['', false],
    [123, false],
    [null, false],
    [ID, true],
    [ID.toUpperCase(), true]
  ])('isBookmarkId(%j) → %s', (id, ok) => {
    expect(isBookmarkId(id)).toBe(ok)
  })

  it('id가 uuid가 아니면 요청을 하나도 보내지 않는다(주소에 끼워 다른 경로를 부르지 못하게)', async () => {
    const s = setup([])
    for (const bad of ['../me', `${ID}/../../tokens`, 'x', 42]) {
      expect(await postVisit(s.deps, bad)).toMatchObject({ error: { code: 'INVALID_ID' } })
      expect(await patchPinned(s.deps, bad, true)).toMatchObject({ error: { code: 'INVALID_ID' } })
      expect(await deleteBookmarkById(s.deps, bad)).toMatchObject({ error: { code: 'INVALID_ID' } })
    }
    // 고정 값이 boolean이 아니어도 보내지 않는다
    expect(await patchPinned(s.deps, ID, 'yes')).toMatchObject({ error: { code: 'INVALID_ID' } })
    expect(s.sent).toHaveLength(0)
  })

  it('방문: POST …/visit, 204면 ok', async () => {
    const s = setup([{ status: 204, text: '' }])
    expect(await postVisit(s.deps, ID)).toEqual({ ok: true })
    expect(s.sent[0]).toMatchObject({ method: 'POST', url: `http://api.test/api/v1/bookmarks/${ID}/visit` })
  })

  it('고정: PATCH { isPinned }, 바뀐 북마크를 돌려준다', async () => {
    const s = setup([{ status: 200, body: { data: { ...BOOKMARK, id: ID, isPinned: true } } }])
    expect(await patchPinned(s.deps, ID, true)).toMatchObject({ data: { id: ID, isPinned: true } })
    expect(s.sent[0]).toMatchObject({ method: 'PATCH', url: `http://api.test/api/v1/bookmarks/${ID}`, body: '{"isPinned":true}' })
  })

  it('삭제: DELETE, 204면 ok / 404면 서버 코드 그대로', async () => {
    const s = setup([
      { status: 204, text: '' },
      { status: 404, body: { error: { code: 'BOOKMARK_NOT_FOUND', message: '북마크를 찾을 수 없습니다' } } }
    ])
    expect(await deleteBookmarkById(s.deps, ID)).toEqual({ ok: true })
    expect(await deleteBookmarkById(s.deps, ID)).toEqual({ error: { code: 'BOOKMARK_NOT_FOUND', message: '북마크를 찾을 수 없습니다' } })
    expect(s.sent.map((x) => x.method)).toEqual(['DELETE', 'DELETE'])
  })

  it('401이면 공통 규칙대로 갱신 후 1회 재시도한다(방문도 같은 통로)', async () => {
    const s = setup([{ status: 401, body: {} }, { status: 204, text: '' }])
    expect(await postVisit(s.deps, ID)).toEqual({ ok: true })
    expect(s.sent.map((x) => x.auth)).toEqual(['Bearer t1', 'Bearer t2'])
  })

  it('연결 실패는 NETWORK (던지지 않는다)', async () => {
    const s = setup(['network-error'])
    expect(await deleteBookmarkById(s.deps, ID)).toMatchObject({ error: { code: 'NETWORK' } })
  })
})
