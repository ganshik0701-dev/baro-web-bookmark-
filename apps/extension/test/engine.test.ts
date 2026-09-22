// 서비스 워커 동작(engine.ts): 토큰·연결 상태·전체 동기화·409 확인·크기 제한·실시간 대기열.
// chrome API 대신 메모리 storage와 가짜 fetch를 쓴다. 응답 모양은 실제 서버(docs/03-api.md)와 같다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEngine } from '../src/engine'
import { PUBLIC_KEYS, type Connection, type SyncStatus } from '../src/state'
import type { TreeNode } from '../src/tree'
import { fakeFetch, findIn, fixtureTree, massDelete, memoryStore, okMe, okSync, TOKEN } from './helpers'

const API = 'https://baro-web-bookmark-api.vercel.app/api/v1'

function setup(responders: Parameters<typeof fakeFetch>, tree: TreeNode[] = fixtureTree()) {
  const store = memoryStore()
  const net = fakeFetch(...responders)
  const trees = { current: tree, reads: 0 }
  const engine = createEngine({
    store,
    getTree: async () => {
      trees.reads++
      return structuredClone(trees.current)
    },
    getSubTree: async (id) => [structuredClone(findIn(trees.current, id)!)],
    fetch: net.fn,
    apiBase: API,
    now: () => new Date('2026-09-22T00:00:00Z'),
    batchMs: 10
  })
  const status = () => store.data.status as SyncStatus
  const connection = () => store.data.connection as Connection
  return { store, net, trees, engine, status, connection }
}

/** 팝업이 읽을 수 있는 값 전부와 콘솔 출력에 토큰(또는 그 앞부분)이 없어야 한다 */
function expectNoTokenLeak(store: ReturnType<typeof memoryStore>, consoleCalls: unknown[][]) {
  const publicText = JSON.stringify(PUBLIC_KEYS.map((k) => store.data[k]))
  expect(publicText).not.toContain(TOKEN)
  expect(publicText).not.toContain(TOKEN.slice(0, 20))
  expect(JSON.stringify(consoleCalls)).not.toContain(TOKEN.slice(5, 20))
}

let consoleCalls: unknown[][] = []
beforeEach(() => {
  consoleCalls = []
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, m).mockImplementation((...args) => void consoleCalls.push(args))
  }
})
afterEach(() => vi.restoreAllMocks())

describe('토큰·연결 상태', () => {
  it('형식이 틀리면 저장하지 않고, 오류 문구에 입력값을 싣지 않는다', async () => {
    const { engine, store, net } = setup([okMe])
    const bad = 'baro_short-secret-value'
    const reply = await engine.saveToken(bad)
    expect(reply.ok).toBe(false)
    expect(JSON.stringify(reply)).not.toContain('short-secret')
    expect(store.data.token).toBeUndefined()
    expect(net.calls).toHaveLength(0)
  })

  it('저장 → GET /me 200 → 연결됨, 팝업용 값에는 끝 4자리만', async () => {
    const { engine, store, net, connection } = setup([okMe])
    expect(await engine.saveToken(`  ${TOKEN}  `)).toEqual({ ok: true })
    expect(store.data.token).toBe(TOKEN) // 원본은 storage.local의 token 키에만
    expect(net.calls[0]).toMatchObject({ url: `${API}/me`, method: 'GET', headers: { authorization: `Bearer ${TOKEN}` } })
    expect(connection()).toMatchObject({ state: 'connected', tokenHint: '…Zx42', email: 'test@example.com' })
    expectNoTokenLeak(store, consoleCalls)
  })

  it.each([
    [() => ({ status: 401, body: { error: { code: 'INVALID_TOKEN', message: '토큰이 유효하지 않거나 만료되었습니다' } } }), 'token_invalid'],
    [() => 'network' as const, 'network'],
    [() => ({ status: 500 }), 'server_error']
  ])('연결 확인: %#번째 응답 → %s', async (responder, state) => {
    const { engine, connection, store } = setup([responder])
    await engine.saveToken(TOKEN)
    expect(connection().state).toBe(state)
    expectNoTokenLeak(store, consoleCalls)
  })

  it('지우면 토큰·대기열이 사라지고 연결 없음', async () => {
    const { engine, store, connection } = setup([okMe])
    await engine.saveToken(TOKEN)
    await engine.clearToken()
    expect(store.data.token).toBeUndefined()
    expect(connection().state).toBe('no_token')
  })
})

describe('전체 동기화(EXT-03)', () => {
  it('200: full·extension·profile 없음, 보내지 않은 URL 개수를 결과에', async () => {
    const { engine, net, status, store } = setup([okMe, okSync(11)])
    await engine.saveToken(TOKEN)
    await engine.fullSync()
    const body = net.calls[1]!.body
    expect(net.calls[1]).toMatchObject({ url: `${API}/sync/chrome`, method: 'POST' })
    expect(body).toMatchObject({ mode: 'full', source: 'extension' })
    expect(body.profile).toBeUndefined()
    expect(body.confirmDeleteCount).toBeUndefined()
    expect(body.bookmarks).toHaveLength(11)
    expect(body.folders).toHaveLength(5)
    expect(status()).toMatchObject({ state: 'done', filtered: 2, result: { created: 11 } })
    expect(store.data.fullNeeded).toBe(false)
    expectNoTokenLeak(store, consoleCalls)
  })

  it('409 → needs_confirm(수·미리보기) → 확인: 새로 읽어 confirmDeleteCount와 함께 한 번 보낸다', async () => {
    const { engine, net, status, trees } = setup([okMe, massDelete(40, 60), okSync(0, { deleted: 40 })])
    await engine.saveToken(TOKEN)
    await engine.fullSync()
    expect(status()).toMatchObject({ state: 'needs_confirm', deleteCount: 40, syncedTotal: 60, preview: [{ title: 'GitHub' }] })
    expect(net.calls).toHaveLength(2) // 자동으로 다시 보내지 않는다
    await engine.confirm()
    expect(trees.reads).toBe(2) // 북마크를 새로 읽었다
    expect(net.calls[2]!.body).toMatchObject({ mode: 'full', confirmDeleteCount: 40 })
    expect(status()).toMatchObject({ state: 'done', result: { deleted: 40 } })
  })

  it('확인 전에 북마크가 바뀌어 다시 409 → 새 숫자로 다시 확인받고, 자동 반복하지 않는다', async () => {
    const { engine, net, status } = setup([okMe, massDelete(40, 60), massDelete(45, 60)])
    await engine.saveToken(TOKEN)
    await engine.fullSync()
    await engine.confirm()
    expect(status()).toMatchObject({ state: 'needs_confirm', deleteCount: 45 })
    expect(net.calls).toHaveLength(3)
    expect(net.calls[2]!.body.confirmDeleteCount).toBe(40)
  })

  it('취소하면 아무 요청도 보내지 않고 "전체 동기화 필요"로 남긴다', async () => {
    const { engine, net, status, store } = setup([okMe, massDelete(40, 60)])
    await engine.saveToken(TOKEN)
    await engine.fullSync()
    await engine.cancel()
    expect(net.calls).toHaveLength(2)
    expect(status().state).toBe('idle')
    expect(store.data.fullNeeded).toBe(true)
    expect((await engine.confirm()).ok).toBe(false) // 취소 뒤 확인은 할 게 없다
    expect(net.calls).toHaveLength(2)
  })

  it('401 → 토큰 무효, 413(서버) → 2MB 안내, 네트워크 → 서버 연결 실패', async () => {
    for (const [responder, code] of [
      [() => ({ status: 401, body: { error: { code: 'INVALID_TOKEN', message: 'x' } } }), 'token_invalid'],
      [() => ({ status: 413, body: { error: { code: 'PAYLOAD_TOO_LARGE', message: 'x' } } }), 'too_large'],
      // Vercel 플랫폼이 주는 413은 JSON이 아니다. 같은 안내를 보여준다
      [() => ({ status: 413, body: undefined }), 'too_large'],
      [() => 'network' as const, 'network']
    ] as const) {
      const { engine, status, store } = setup([okMe, responder])
      await engine.saveToken(TOKEN)
      await engine.fullSync()
      expect(status()).toMatchObject({ state: 'error', code })
      expectNoTokenLeak(store, consoleCalls)
    }
  })

  it('2MB 넘으면 보내지 않는다(한글 제목 바이트로 계산)', async () => {
    const tree = fixtureTree()
    const bar = tree[0]!.children![0]!
    // 한글 제목 2,000개 × 400자 ≈ 2.4MB (글자 수로는 80만이라 글자 수로 재면 통과해 버린다)
    bar.children = Array.from({ length: 2000 }, (_, i) => ({
      id: String(5000 + i),
      parentId: '1',
      title: '가'.repeat(400),
      url: `https://big.example.com/${i}`,
      syncing: false
    }))
    const { engine, net, status } = setup([okMe], tree)
    await engine.saveToken(TOKEN)
    await engine.fullSync()
    expect(net.calls).toHaveLength(1) // /me만
    expect(status()).toMatchObject({ state: 'error', code: 'too_large' })
    expect((status() as { message: string }).message).toMatch(/MB로 2MB 제한/)
  })

  it('5,000개 넘으면 보내지 않는다', async () => {
    const tree = fixtureTree()
    tree[0]!.children![0]!.children = Array.from({ length: 5001 }, (_, i) => ({
      id: String(9000 + i),
      parentId: '1',
      title: 't',
      url: `https://many.example.com/${i}`,
      syncing: false
    }))
    const { engine, net, status } = setup([okMe], tree)
    await engine.saveToken(TOKEN)
    await engine.fullSync()
    expect(net.calls).toHaveLength(1)
    expect(status()).toMatchObject({ state: 'error', code: 'too_many' })
  })

  it('서비스 워커가 다시 시작됐는데 syncing이 남아 있으면 중단됨', async () => {
    const { engine, store, status } = setup([okMe])
    await store.set({ status: { state: 'syncing', updatedAt: '2026-09-22T00:00:00Z' } })
    await engine.onStartup()
    expect(status()).toMatchObject({ state: 'error', code: 'interrupted' })
  })
})

describe('실시간 동기화(EXT-02)', () => {
  const wait = () => new Promise((r) => setTimeout(r, 40))

  it('짧은 시간의 이벤트를 모아 partial 한 번으로(만들기·폴더 하위 트리·삭제)', async () => {
    const { engine, net, trees, store } = setup([okMe, okSync(1)])
    await engine.saveToken(TOKEN)
    await engine.enqueue({ type: 'upsert', nodes: [{ id: '100', parentId: '7', title: '새 글', url: 'https://new.example.com/', syncing: false }] })
    await engine.enqueue({ type: 'upsert', nodes: [findIn(trees.current, '9')!] }) // 폴더 이름 변경 → 하위 트리
    await engine.enqueue({ type: 'remove', ids: ['20', '21'] }) // 폴더 삭제 → 하위 id 포함
    await wait()
    expect(net.calls).toHaveLength(2)
    const body = net.calls[1]!.body
    expect(body).toMatchObject({ mode: 'partial', source: 'extension', deletedChromeIds: ['20', '21'] })
    expect(body.folders.map((f: { chromeId: string }) => f.chromeId).sort()).toEqual(['11', '9'])
    expect(body.bookmarks.map((b: { chromeId: string }) => b.chromeId).sort()).toEqual(['10', '100', '12'])
    expect(store.data.realtime).toMatchObject({ ok: true })
  })

  it('보낼 수 없는 URL로 바뀐 북마크는 삭제로 보낸다', async () => {
    const { engine, net } = setup([okMe, okSync()])
    await engine.saveToken(TOKEN)
    await engine.enqueue({ type: 'upsert', nodes: [{ id: '5', parentId: '1', title: 'x', url: 'javascript:void(0)', syncing: false }] })
    await wait()
    expect(net.calls[1]!.body).toMatchObject({ bookmarks: [], deletedChromeIds: ['5'] })
  })

  it('확인 대기(needs_confirm)·가져오기 중·토큰 없음이면 보내지 않고 "전체 동기화 필요"', async () => {
    const node = { id: '101', parentId: '1', title: 'a', url: 'https://a.example.com/', syncing: false }
    // 확인 대기
    const a = setup([okMe, massDelete(40, 60)])
    await a.engine.saveToken(TOKEN)
    await a.engine.fullSync()
    await a.store.set({ fullNeeded: false })
    await a.engine.enqueue({ type: 'upsert', nodes: [node] })
    await wait()
    expect(a.net.calls).toHaveLength(2)
    expect(a.store.data.fullNeeded).toBe(true)
    // 가져오기 중 → 끝나면 전체 동기화 한 번
    const b = setup([okMe, okSync(1)])
    await b.engine.saveToken(TOKEN)
    await b.engine.importBegan()
    await b.engine.enqueue({ type: 'upsert', nodes: [node] })
    await wait()
    expect(b.net.calls).toHaveLength(1)
    await b.engine.importEnded()
    expect(b.net.calls[1]!.body.mode).toBe('full')
    // 토큰 없음
    const c = setup([okMe])
    await c.engine.enqueue({ type: 'upsert', nodes: [node] })
    await wait()
    expect(c.net.calls).toHaveLength(0)
  })

  it('실패(401)하면 대기열을 버리고 "전체 동기화 필요", 연결 상태는 토큰 무효', async () => {
    const { engine, store, connection } = setup([okMe, () => ({ status: 401, body: { error: { code: 'INVALID_TOKEN', message: 'x' } } })])
    await engine.saveToken(TOKEN)
    await store.set({ fullNeeded: false })
    await engine.enqueue({ type: 'remove', ids: ['6'] })
    await wait()
    expect(store.data.fullNeeded).toBe(true)
    expect(connection().state).toBe('token_invalid')
    expect(store.data.realtime).toMatchObject({ ok: false })
    expectNoTokenLeak(store, consoleCalls)
  })
})
