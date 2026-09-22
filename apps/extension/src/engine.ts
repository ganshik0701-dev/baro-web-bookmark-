// 서비스 워커의 동작 전부: 토큰·연결 확인·전체 동기화(409 확인)·실시간 동기화 대기열 (docs/01-spec.md '확장 동작 규칙').
// chrome API와 fetch는 주입받는다(테스트에서 가짜로 바꾼다). 이 모듈은 서비스 워커에서만 쓴다.
//
// 토큰 취급: storage.local의 TOKEN_KEY에만 둔다. 상태·오류 메시지·로그에는 절대 넣지 않는다
// (오류 문구는 여기 적힌 고정 문구와 서버가 준 message만 쓴다. 서버 message에는 토큰이 들어가지 않는다).
import type { MassDeleteDetails, SyncChromeResult } from '@baro/shared'
import {
  CONNECTION_KEY,
  FULL_NEEDED_KEY,
  IMPORTING_KEY,
  QUEUE_KEY,
  REALTIME_KEY,
  STATUS_KEY,
  TOKEN_KEY,
  type Connection,
  type ErrorCode,
  type Realtime,
  type Reply,
  type SyncStatus
} from './state'
import {
  flatten,
  jsonBytes,
  MAX_BOOKMARKS,
  MAX_BYTES,
  type SyncBookmark,
  type SyncFolder,
  type TreeNode
} from './tree'

export type Store = {
  get(keys: string[]): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string[]): Promise<void>
}

export type Deps = {
  store: Store
  getTree(): Promise<TreeNode[]>
  getSubTree(id: string): Promise<TreeNode[]>
  fetch: typeof fetch
  apiBase: string
  now(): Date
  /** 실시간 전송을 모으는 시간(ms). 기본 1초 */
  batchMs?: number
}

/** 실시간 동기화 대기열. 서비스 워커가 꺼져도 잃지 않게 storage에 둔다 */
type Queue = { folders: Record<string, SyncFolder>; bookmarks: Record<string, SyncBookmark>; deleted: string[] }
const emptyQueue = (): Queue => ({ folders: {}, bookmarks: {}, deleted: [] })

const TOKEN_FORMAT = /^baro_[A-Za-z0-9_-]{43}$/

const MESSAGES: Record<ErrorCode, string> = {
  no_token: '토큰을 먼저 저장하세요',
  token_invalid: '토큰이 유효하지 않습니다(폐기됐거나 잘못 입력됨). 앱에서 새 토큰을 발급해 저장하세요',
  network: '서버에 연결하지 못했습니다. 인터넷 연결이나 서버 상태를 확인하세요',
  too_large: '보낼 북마크 데이터가 2MB 제한을 넘습니다. 북마크 수를 줄이거나 앱의 파일 동기화를 쓰세요',
  too_many: '북마크가 5,000개를 넘어 한 번에 보낼 수 없습니다. 앱의 파일 동기화를 쓰세요',
  server: '서버 오류로 동기화하지 못했습니다',
  interrupted: '동기화가 중간에 멈췄습니다(확장이 다시 시작됨). 다시 시도하세요'
}

type ApiResponse =
  | { kind: 'ok'; status: number; body: { data?: unknown } }
  | { kind: 'http'; status: number; body: { error?: { code?: string; message?: string; details?: unknown } } | null }
  | { kind: 'network' }

export function createEngine(deps: Deps) {
  const { store } = deps
  const now = () => deps.now().toISOString()
  const batchMs = deps.batchMs ?? 1000

  // 전체 동기화·실시간 전송·대기열 수정을 한 줄로 세운다(동시에 두 요청이 나가지 않게)
  let chain: Promise<unknown> = Promise.resolve()
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task, task)
    chain = run.catch(() => undefined)
    return run
  }

  const read = async <T>(key: string): Promise<T | undefined> => (await store.get([key]))[key] as T | undefined
  const setStatus = (status: SyncStatus) => store.set({ [STATUS_KEY]: status })
  const setConnection = (c: Connection) => store.set({ [CONNECTION_KEY]: c })
  const fail = (code: ErrorCode, message = MESSAGES[code]) => setStatus({ state: 'error', code, message, updatedAt: now() })

  async function api(path: string, token: string, init: { method: string; body?: string }): Promise<ApiResponse> {
    let res: Response
    try {
      res = await deps.fetch(`${deps.apiBase}${path}`, {
        method: init.method,
        headers: { authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
        body: init.body
      })
    } catch {
      // fetch 오류 객체는 싣지 않는다(요청 정보가 섞일 수 있어서)
      return { kind: 'network' }
    }
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    return res.ok ? { kind: 'ok', status: res.status, body: body as { data?: unknown } } : { kind: 'http', status: res.status, body: body as never }
  }

  const tokenHint = (token: string) => `…${token.slice(-4)}`

  // ─── 토큰·연결 ─────────────────────────────────────────

  async function saveToken(raw: string): Promise<Reply> {
    const token = raw.trim()
    // 입력값을 되돌려 보여주지 않는다
    if (!TOKEN_FORMAT.test(token)) return { ok: false, message: '토큰 형식이 올바르지 않습니다(baro_로 시작하는 48자)' }
    await store.set({ [TOKEN_KEY]: token, [FULL_NEEDED_KEY]: true })
    await checkConnection()
    return { ok: true }
  }

  async function clearToken(): Promise<Reply> {
    await store.remove([TOKEN_KEY, QUEUE_KEY])
    await setConnection({ state: 'no_token' })
    await setStatus({ state: 'idle', updatedAt: now() })
    return { ok: true }
  }

  /** 가벼운 인증 확인: GET /me */
  async function checkConnection(): Promise<Reply> {
    const token = await read<string>(TOKEN_KEY)
    if (!token) {
      await setConnection({ state: 'no_token' })
      return { ok: true }
    }
    const hint = tokenHint(token)
    await setConnection({ state: 'checking', tokenHint: hint })
    const r = await api('/me', token, { method: 'GET' })
    const checkedAt = now()
    if (r.kind === 'ok') {
      const email = (r.body.data as { email?: string } | undefined)?.email
      await setConnection({ state: 'connected', tokenHint: hint, email, checkedAt })
    } else if (r.kind === 'network') await setConnection({ state: 'network', tokenHint: hint, checkedAt })
    else if (r.status === 401) await setConnection({ state: 'token_invalid', tokenHint: hint, checkedAt })
    else await setConnection({ state: 'server_error', tokenHint: hint, checkedAt })
    return { ok: true }
  }

  // ─── 전체 동기화(EXT-03)와 409 확인 ─────────────────────

  /**
   * 트리를 새로 읽어 full로 보낸다. confirmDeleteCount는 사용자가 확인한 삭제 예정 수(409에서 보여준 값).
   * 409가 다시 오면 새 숫자로 needs_confirm이 될 뿐, 자동으로 다시 보내지 않는다
   */
  function fullSync(confirmDeleteCount?: number): Promise<Reply> {
    return serial(async () => {
      const token = await read<string>(TOKEN_KEY)
      if (!token) {
        await fail('no_token')
        return { ok: true }
      }
      // 읽기 직전에 '전체 동기화 필요'를 지운다. 보내는 동안 생긴 변경은 다시 켠다(아래 enqueue)
      await store.set({ [FULL_NEEDED_KEY]: false })
      await setStatus({ state: 'syncing', updatedAt: now() })

      const { folders, bookmarks, filtered } = flatten(await deps.getTree())
      if (bookmarks.length > MAX_BOOKMARKS) {
        await store.set({ [FULL_NEEDED_KEY]: true })
        await fail('too_many', `북마크가 ${bookmarks.length.toLocaleString()}개로 5,000개 제한을 넘어 보내지 않았습니다. 앱의 파일 동기화를 쓰세요`)
        return { ok: true }
      }
      const body = {
        mode: 'full',
        source: 'extension',
        folders,
        bookmarks,
        ...(confirmDeleteCount !== undefined ? { confirmDeleteCount } : {})
      }
      const bytes = jsonBytes(body)
      if (bytes > MAX_BYTES) {
        await store.set({ [FULL_NEEDED_KEY]: true })
        await fail('too_large', `보낼 데이터가 ${(bytes / 1024 / 1024).toFixed(2)}MB로 2MB 제한을 넘어 보내지 않았습니다. 북마크 수를 줄이거나 앱의 파일 동기화를 쓰세요`)
        return { ok: true }
      }

      const r = await api('/sync/chrome', token, { method: 'POST', body: JSON.stringify(body) })
      if (r.kind === 'ok') {
        await store.set({ [QUEUE_KEY]: emptyQueue() }) // 전체 동기화가 대기열 내용을 이미 담았다
        await setStatus({ state: 'done', result: r.body.data as SyncChromeResult, filtered, updatedAt: now() })
        return { ok: true }
      }
      await store.set({ [FULL_NEEDED_KEY]: true })
      if (r.kind === 'network') await fail('network')
      else if (r.status === 409 && r.body?.error?.code === 'MASS_DELETE_CONFIRM_REQUIRED') {
        const d = r.body.error.details as MassDeleteDetails
        await setStatus({
          state: 'needs_confirm',
          deleteCount: d.deleteCount,
          syncedTotal: d.syncedTotal,
          preview: d.preview ?? [],
          filtered,
          updatedAt: now()
        })
      } else if (r.status === 401) {
        await setConnection({ state: 'token_invalid', tokenHint: tokenHint(token), checkedAt: now() })
        await fail('token_invalid')
      } else if (r.status === 413) await fail('too_large') // 앱이 준 413이든 Vercel이 준 413이든 같은 안내
      else await fail('server', `${MESSAGES.server} (${r.status}${r.body?.error?.message ? `: ${r.body.error.message}` : ''})`)
      return { ok: true }
    })
  }

  /** 409 확인: 보여준 삭제 예정 수로 북마크를 새로 읽어 다시 보낸다 */
  async function confirm(): Promise<Reply> {
    const status = await read<SyncStatus>(STATUS_KEY)
    if (status?.state !== 'needs_confirm') return { ok: false, message: '확인할 삭제가 없습니다' }
    return fullSync(status.deleteCount)
  }

  /** 409 취소: 아무 요청도 보내지 않는다 */
  async function cancel(): Promise<Reply> {
    return serial(async () => {
      const status = await read<SyncStatus>(STATUS_KEY)
      if (status?.state === 'needs_confirm') {
        await store.set({ [FULL_NEEDED_KEY]: true })
        await setStatus({ state: 'idle', updatedAt: now() })
      }
      return { ok: true }
    })
  }

  // ─── 실시간 동기화(EXT-02) ─────────────────────────────

  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flush(), batchMs)
  }

  /** 지금 실시간 전송을 멈춰야 하나: 토큰 없음·가져오기 중·전체 동기화 중·확인 대기 중 */
  async function paused(): Promise<boolean> {
    const got = await store.get([TOKEN_KEY, IMPORTING_KEY, STATUS_KEY])
    const state = (got[STATUS_KEY] as SyncStatus | undefined)?.state
    return !got[TOKEN_KEY] || got[IMPORTING_KEY] === true || state === 'syncing' || state === 'needs_confirm'
  }

  /**
   * 이벤트를 대기열에 넣는다. upsert: 새로 만들거나 바뀐 노드의 하위 트리(getSubTree 결과), remove: 지운 id들.
   * 멈춘 동안의 변경은 버리고 '전체 동기화 필요'로 표시한다(곧 할 전체 동기화가 담는다)
   */
  function enqueue(event: { type: 'upsert'; nodes: TreeNode[] } | { type: 'remove'; ids: string[] }): Promise<void> {
    return serial(async () => {
      if (await paused()) {
        await store.set({ [FULL_NEEDED_KEY]: true })
        return
      }
      const q = (await read<Queue>(QUEUE_KEY)) ?? emptyQueue()
      if (event.type === 'upsert') {
        const flat = flatten(event.nodes)
        for (const f of flat.folders) q.folders[f.chromeId] = f
        for (const b of flat.bookmarks) q.bookmarks[b.chromeId] = b
        // 보낼 수 없는 URL로 바뀐 북마크는 서버에서도 지운다(전체 동기화 결과와 같아지게)
        for (const id of unsendableIds(event.nodes)) {
          delete q.bookmarks[id]
          if (!q.deleted.includes(id)) q.deleted.push(id)
        }
        const upserted = new Set([...flat.folders, ...flat.bookmarks].map((i) => i.chromeId))
        q.deleted = q.deleted.filter((id) => !upserted.has(id))
      } else {
        for (const id of event.ids) {
          delete q.folders[id]
          delete q.bookmarks[id]
          if (!q.deleted.includes(id)) q.deleted.push(id)
        }
      }
      await store.set({ [QUEUE_KEY]: q })
      schedule()
    })
  }

  /** 모인 변경을 partial 한 번으로 보낸다 */
  function flush(): Promise<void> {
    return serial(async () => {
      const q = (await read<Queue>(QUEUE_KEY)) ?? emptyQueue()
      const folders = Object.values(q.folders)
      const bookmarks = Object.values(q.bookmarks)
      if (!folders.length && !bookmarks.length && !q.deleted.length) return
      await store.set({ [QUEUE_KEY]: emptyQueue() })
      const token = await read<string>(TOKEN_KEY)
      if (!token || (await paused())) {
        await store.set({ [FULL_NEEDED_KEY]: true })
        return
      }
      const body = { mode: 'partial', source: 'extension', folders, bookmarks, deletedChromeIds: q.deleted }
      const report = (r: Realtime) => store.set({ [REALTIME_KEY]: r })
      if (jsonBytes(body) > MAX_BYTES) {
        await store.set({ [FULL_NEEDED_KEY]: true })
        await report({ at: now(), ok: false, message: MESSAGES.too_large })
        return
      }
      const r = await api('/sync/chrome', token, { method: 'POST', body: JSON.stringify(body) })
      if (r.kind === 'ok') {
        const d = r.body.data as SyncChromeResult
        await report({ at: now(), ok: true, message: `추가 ${d.created} · 수정 ${d.updated} · 삭제 ${d.deleted}` })
        return
      }
      // 실패한 변경은 버리고 전체 동기화로 맞춘다(다시 보내다 순서가 꼬이는 것보다 안전)
      await store.set({ [FULL_NEEDED_KEY]: true })
      if (r.kind === 'network') await report({ at: now(), ok: false, message: MESSAGES.network })
      else if (r.status === 401) {
        await setConnection({ state: 'token_invalid', tokenHint: tokenHint(token), checkedAt: now() })
        await report({ at: now(), ok: false, message: MESSAGES.token_invalid })
      } else if (r.status === 413) await report({ at: now(), ok: false, message: MESSAGES.too_large })
      else await report({ at: now(), ok: false, message: `${MESSAGES.server} (${r.status})` })
    })
  }

  const importBegan = () => store.set({ [IMPORTING_KEY]: true })
  /** 가져오기 중 이벤트는 모으지 않았으므로 끝나면 전체 동기화 한 번 */
  async function importEnded() {
    await store.set({ [IMPORTING_KEY]: false, [FULL_NEEDED_KEY]: true })
    if (await read<string>(TOKEN_KEY)) await fullSync()
  }

  /** 서비스 워커가 새로 시작될 때: 남은 syncing은 중단된 것, 남은 대기열은 보낸다 */
  async function onStartup() {
    const status = await read<SyncStatus>(STATUS_KEY)
    if (status?.state === 'syncing') {
      await store.set({ [FULL_NEEDED_KEY]: true })
      await fail('interrupted')
    }
    const q = await read<Queue>(QUEUE_KEY)
    if (q && (Object.keys(q.folders).length || Object.keys(q.bookmarks).length || q.deleted.length)) schedule()
  }

  return { saveToken, clearToken, checkConnection, fullSync, confirm, cancel, enqueue, flush, importBegan, importEnded, onStartup }
}

/** 하위 트리에서 보낼 수 없는 URL의 북마크 id */
function unsendableIds(nodes: TreeNode[]): string[] {
  const ids: string[] = []
  const walk = (n: TreeNode) => {
    if (n.url !== undefined) {
      if (flatten([n]).filtered) ids.push(n.id)
    } else for (const c of n.children ?? []) walk(c)
  }
  nodes.forEach(walk)
  return ids
}

