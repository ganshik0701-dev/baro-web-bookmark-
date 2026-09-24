// DESK-03 동기화 흐름. 진짜 서버 없이 가짜 fetch로 확인한다.
// 특히 '요청이 나가지 않아야 하는 경우'를 요청 횟수로 못 박는다.
import type { MassDeleteDetails, SyncChromeInput } from '@baro/shared'
import { describe, expect, it } from 'vitest'
import type { ChromeReadResult } from '../src/main/chrome-selection'
import { runSync, type SyncDeps } from '../src/main/sync'

const tree = {
  folders: [{ chromeId: '7', parentChromeId: '1', title: '개발' }],
  bookmarks: [{ chromeId: '5', parentChromeId: '1', title: 'a', url: 'https://a.example.com/' }],
  filtered: 0,
  rootCounts: { bookmark_bar: 1, other: 0, synced: 0 },
  suspicious: false
}

const okRead: ChromeReadResult = {
  ok: true,
  selection: { kind: 'profile', name: 'Default', displayName: '홍길동', bookmarksPath: 'C:\\x\\Bookmarks' },
  tree
}

const RESULT = { created: 1, updated: 0, deleted: 0, skipped: 0, skippedReasons: {}, syncedAt: '2026-09-24T00:00:00Z' }

/** 서버 응답을 차례대로 돌려주는 가짜 fetch. 보낸 요청을 모두 기록한다 */
function fakeServer(responses: { status: number; body: unknown }[]) {
  const sent: { body: SyncChromeInput; token: string | null }[] = []
  const fetch = (async (_url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>
    sent.push({
      body: JSON.parse(init.body as string) as SyncChromeInput,
      token: headers.authorization?.replace('Bearer ', '') ?? null
    })
    const next = responses.shift() ?? { status: 500, body: { error: { code: 'NO_MORE', message: '응답이 없다' } } }
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body
    } as Response
  }) as unknown as typeof globalThis.fetch
  return { fetch, sent }
}

const details = (deleteCount: number): MassDeleteDetails => ({
  deleteCount,
  syncedTotal: 100,
  preview: [{ title: 'GitHub', url: 'https://github.com/' }]
})

const CONFIRM_409 = (n: number) => ({
  status: 409,
  body: { error: { code: 'MASS_DELETE_CONFIRM_REQUIRED', message: '확인이 필요합니다', details: details(n) } }
})

function deps(over: Partial<SyncDeps> = {}): SyncDeps {
  return {
    readBookmarks: async () => okRead,
    getAccessToken: async () => 'token-1',
    forceRefresh: async () => true,
    fetch: fakeServer([{ status: 200, body: { data: RESULT } }]).fetch,
    apiBaseUrl: 'https://api.example.com/v1',
    confirmMassDelete: async () => false,
    confirmSuspicious: async () => false,
    ...over
  }
}

describe('보통 동기화', () => {
  it('full·source=app·프로필 이름을 붙여 보내고 결과를 돌려준다', async () => {
    const server = fakeServer([{ status: 200, body: { data: RESULT } }])
    const state = await runSync(deps({ fetch: server.fetch }), 'manual')

    expect(state.phase).toBe('done')
    expect(state.lastResult).toEqual(RESULT)
    expect(state.profile).toEqual({ name: 'Default', displayName: '홍길동' })
    expect(server.sent).toHaveLength(1)
    expect(server.sent[0]!.body).toMatchObject({ mode: 'full', source: 'app', profile: 'Default' })
    expect(server.sent[0]!.body.confirmDeleteCount).toBeUndefined()
    expect(server.sent[0]!.token).toBe('token-1')
  })

  it('직접 고른 파일이면 profile은 null로 보낸다', async () => {
    const server = fakeServer([{ status: 200, body: { data: RESULT } }])
    const read: ChromeReadResult = { ok: true, selection: { kind: 'file', bookmarksPath: 'C:\\x' }, tree }
    await runSync(deps({ fetch: server.fetch, readBookmarks: async () => read }), 'manual')
    expect(server.sent[0]!.body.profile).toBeNull()
  })
})

describe('보내지 않는 경우 (요청 0건)', () => {
  it.each([
    ['no_selection', '프로필을 못 찾음'],
    ['read_error', '파일을 못 엶'],
    ['invalid_json', 'JSON이 깨짐'],
    ['no_roots', '크롬 파일이 아님'],
    ['bad_root', '구조가 이상함'],
    ['too_large', '너무 큼']
  ] as const)('파싱 실패(%s)면 요청하지 않는다 (%s)', async (reason, _설명) => {
    const server = fakeServer([])
    const state = await runSync(
      deps({ fetch: server.fetch, readBookmarks: async () => ({ ok: false, reason, message: 'x' }) }),
      'manual'
    )
    expect(state.phase).toBe('error')
    expect(state.error!.code).toBe(reason)
    expect(server.sent).toHaveLength(0)
  })

  it('북마크 0개(suspicious) + 자동 동기화면 묻지도 않고 보내지 않는다', async () => {
    const server = fakeServer([])
    let asked = false
    const state = await runSync(
      deps({
        fetch: server.fetch,
        readBookmarks: async () => ({ ...okRead, tree: { ...tree, bookmarks: [], suspicious: true } }),
        confirmSuspicious: async () => {
          asked = true
          return true
        }
      }),
      'startup'
    )
    expect(state.phase).toBe('error')
    expect(state.error!.code).toBe('SUSPICIOUS_EMPTY')
    expect(asked).toBe(false)
    expect(server.sent).toHaveLength(0)
  })

  it('북마크 0개 + 수동인데 취소하면 보내지 않는다', async () => {
    const server = fakeServer([])
    const state = await runSync(
      deps({
        fetch: server.fetch,
        readBookmarks: async () => ({ ...okRead, tree: { ...tree, bookmarks: [], suspicious: true } }),
        confirmSuspicious: async () => false
      }),
      'manual'
    )
    expect(state.phase).toBe('idle')
    expect(server.sent).toHaveLength(0)
  })

  it('북마크 0개 + 수동 + 확인하면 보낸다', async () => {
    const server = fakeServer([{ status: 200, body: { data: RESULT } }])
    const state = await runSync(
      deps({
        fetch: server.fetch,
        readBookmarks: async () => ({ ...okRead, tree: { ...tree, bookmarks: [], suspicious: true } }),
        confirmSuspicious: async () => true
      }),
      'manual'
    )
    expect(state.phase).toBe('done')
    expect(server.sent).toHaveLength(1)
  })
})

describe('409 대량 삭제 확인', () => {
  it('취소하면 아무 요청도 더 보내지 않는다', async () => {
    const server = fakeServer([CONFIRM_409(40)])
    const state = await runSync(deps({ fetch: server.fetch, confirmMassDelete: async () => false }), 'manual')
    expect(state.phase).toBe('idle')
    expect(server.sent).toHaveLength(1)
  })

  it('확인하면 같은 요청에 confirmDeleteCount만 붙여 다시 보낸다(파일을 다시 읽지 않는다)', async () => {
    const server = fakeServer([CONFIRM_409(40), { status: 200, body: { data: RESULT } }])
    let reads = 0
    const state = await runSync(
      deps({
        fetch: server.fetch,
        readBookmarks: async () => {
          reads++
          return okRead
        },
        confirmMassDelete: async () => true
      }),
      'manual'
    )

    expect(state.phase).toBe('done')
    expect(reads).toBe(1) // 확인 뒤에 파일을 다시 읽지 않았다
    expect(server.sent).toHaveLength(2)
    expect(server.sent[1]!.body.confirmDeleteCount).toBe(40)
    // 숫자만 달라지고 나머지는 같은 요청이다
    expect({ ...server.sent[1]!.body, confirmDeleteCount: undefined }).toEqual({
      ...server.sent[0]!.body,
      confirmDeleteCount: undefined
    })
  })

  it('확인 대기 중 삭제 대상이 늘면(40 → 45) 새 숫자로 다시 묻는다', async () => {
    const server = fakeServer([CONFIRM_409(40), CONFIRM_409(45), { status: 200, body: { data: RESULT } }])
    const shown: number[] = []
    const state = await runSync(
      deps({
        fetch: server.fetch,
        confirmMassDelete: async (d) => {
          shown.push(d.deleteCount)
          return true
        }
      }),
      'manual'
    )

    expect(shown).toEqual([40, 45]) // 자동으로 반복하지 않고 새 숫자로 다시 물었다
    expect(server.sent.map((s) => s.body.confirmDeleteCount)).toEqual([undefined, 40, 45])
    expect(state.phase).toBe('done')
  })

  it('두 번째 확인에서 취소해도 그 뒤로 보내지 않는다', async () => {
    const server = fakeServer([CONFIRM_409(40), CONFIRM_409(45)])
    let asked = 0
    const state = await runSync(
      deps({
        fetch: server.fetch,
        confirmMassDelete: async () => {
          asked++
          return asked === 1
        }
      }),
      'manual'
    )
    expect(asked).toBe(2)
    expect(server.sent).toHaveLength(2)
    expect(state.phase).toBe('idle')
  })

  it('confirmDeleteCount는 서버가 준 값을 그대로 쓴다(렌더러가 정하지 않는다)', async () => {
    const server = fakeServer([CONFIRM_409(37), { status: 200, body: { data: RESULT } }])
    let seen = 0
    await runSync(
      deps({
        fetch: server.fetch,
        confirmMassDelete: async (d) => {
          seen = d.deleteCount
          return true
        }
      }),
      'manual'
    )
    expect(seen).toBe(37)
    expect(server.sent[1]!.body.confirmDeleteCount).toBe(37)
  })
})

describe('토큰 만료와 재시도', () => {
  it('401이면 갱신하고 딱 1회 다시 보낸다', async () => {
    const server = fakeServer([
      { status: 401, body: { error: { code: 'INVALID_TOKEN', message: '만료' } } },
      { status: 200, body: { data: RESULT } }
    ])
    let refreshed = 0
    let token = 'old'
    const state = await runSync(
      deps({
        fetch: server.fetch,
        getAccessToken: async () => token,
        forceRefresh: async () => {
          refreshed++
          token = 'new'
          return true
        }
      }),
      'manual'
    )

    expect(state.phase).toBe('done')
    expect(refreshed).toBe(1)
    expect(server.sent.map((s) => s.token)).toEqual(['old', 'new'])
  })

  it('재시도도 401이면 더 보내지 않고 로그인 만료로 끝낸다', async () => {
    const server = fakeServer([
      { status: 401, body: { error: { code: 'INVALID_TOKEN', message: '만료' } } },
      { status: 401, body: { error: { code: 'INVALID_TOKEN', message: '만료' } } }
    ])
    const state = await runSync(deps({ fetch: server.fetch }), 'manual')
    expect(state.phase).toBe('error')
    expect(state.error!.code).toBe('UNAUTHORIZED')
    expect(server.sent).toHaveLength(2)
  })

  it('갱신 자체가 실패하면 재시도하지 않는다', async () => {
    const server = fakeServer([{ status: 401, body: { error: { code: 'INVALID_TOKEN', message: '만료' } } }])
    const state = await runSync(deps({ fetch: server.fetch, forceRefresh: async () => false }), 'manual')
    expect(state.error!.code).toBe('UNAUTHORIZED')
    expect(server.sent).toHaveLength(1)
  })

  it('로그인 전이면 요청하지 않는다', async () => {
    const server = fakeServer([])
    const state = await runSync(deps({ fetch: server.fetch, getAccessToken: async () => null }), 'manual')
    expect(state.error!.code).toBe('UNAUTHORIZED')
    expect(server.sent).toHaveLength(0)
  })

  it.each([
    [400, 'VALIDATION_ERROR'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [429, 'RATE_LIMITED'],
    [500, 'INTERNAL_ERROR']
  ])('%s는 재시도하지 않는다 (%s)', async (status, code) => {
    const server = fakeServer([{ status, body: { error: { code, message: '실패' } } }])
    const state = await runSync(deps({ fetch: server.fetch }), 'manual')
    expect(state.phase).toBe('error')
    expect(state.error!.code).toBe(code)
    expect(server.sent).toHaveLength(1)
  })

  it('네트워크가 끊기면 오류로 끝낸다', async () => {
    const fetch = (async () => {
      throw new Error('offline')
    }) as unknown as typeof globalThis.fetch
    const state = await runSync(deps({ fetch }), 'manual')
    expect(state.error!.code).toBe('NETWORK')
  })
})
