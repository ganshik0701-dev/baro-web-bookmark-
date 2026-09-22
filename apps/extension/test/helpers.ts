// 테스트 도우미: 크롬 Bookmarks 파일 샘플(apps/api/test/fixtures)을 chrome.bookmarks.getTree() 모양으로 바꾸고,
// storage·fetch를 가짜로 만든다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Store } from '../src/engine'
import type { TreeNode } from '../src/tree'

type FileNode = { id: string; name: string; type: 'url' | 'folder'; url?: string; date_added?: string; children?: FileNode[] }

/** 파일의 date_added(1601년 기준 마이크로초) → getTree의 dateAdded(1970년 기준 밀리초) */
const toMs = (v?: string) => (v ? Number(BigInt(v) / 1000n) - 11_644_473_600_000 : undefined)

/** 파일 모양 → getTree() 모양: [{ id: '0', children: [북마크바, 기타 북마크, 모바일 북마크] }] */
export function fixtureTree(): TreeNode[] {
  const file = JSON.parse(
    readFileSync(join(__dirname, '../../api/test/fixtures/chrome-bookmarks.json'), 'utf8')
  ) as { roots: Record<string, FileNode> }
  const conv = (n: FileNode, parentId: string, index: number): TreeNode => ({
    id: n.id,
    parentId,
    index,
    title: n.name,
    ...(n.type === 'url' ? { url: n.url } : { children: (n.children ?? []).map((c, i) => conv(c, n.id, i)) }),
    ...(toMs(n.date_added) ? { dateAdded: toMs(n.date_added) } : {}),
    syncing: false
  })
  const roots = [file.roots.bookmark_bar!, file.roots.other!, file.roots.synced!].map((r, i) => conv(r, '0', i))
  return [{ id: '0', title: '', children: roots, syncing: false }]
}

export function findIn(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    const f = n.children && findIn(n.children, id)
    if (f) return f
  }
  return undefined
}

/** chrome.storage.local 흉내(값은 JSON으로 복사해 실제처럼 참조를 끊는다) */
export function memoryStore(): Store & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {}
  const copy = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
  return {
    data,
    async get(keys) {
      return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, copy(data[k])]))
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data[k] = copy(v)
    },
    async remove(keys) {
      for (const k of keys) delete data[k]
    }
  }
}

export type Call = { url: string; method: string; headers: Record<string, string>; body: any }
type Responder = (call: Call) => { status: number; body?: unknown } | 'network'

/** fetch 흉내: 보낸 요청을 calls에 남기고, 차례로 준비한 응답을 돌려준다 */
export function fakeFetch(...responders: Responder[]) {
  const calls: Call[] = []
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined
    }
    calls.push(call)
    const responder = responders[Math.min(calls.length - 1, responders.length - 1)]
    const r = responder ? responder(call) : { status: 500 }
    if (r === 'network') throw new TypeError('Failed to fetch')
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status })
  }) as typeof fetch
  return { fn, calls }
}

/** 형식이 맞는 가짜 토큰(baro_ + 43자). 끝 4자리 'Zx42' */
export const TOKEN = `baro_${'Tq'.repeat(19)}sZx42`
export const okMe = () => ({ status: 200, body: { data: { id: 'u1', email: 'test@example.com' } } })
export const okSync = (created = 0, extra: Record<string, unknown> = {}) => () => ({
  status: 200,
  body: {
    data: {
      created,
      updated: 0,
      deleted: 0,
      skipped: 0,
      skippedReasons: { invalidUrl: 0, duplicateUrl: 0, manualExists: 0 },
      syncedAt: '2026-09-22T00:00:00.000Z',
      ...extra
    }
  }
})
export const massDelete = (deleteCount: number, syncedTotal: number) => () => ({
  status: 409,
  body: {
    error: {
      code: 'MASS_DELETE_CONFIRM_REQUIRED',
      message: `크롬에 없는 북마크 ${deleteCount}개를 지우려고 합니다`,
      details: { deleteCount, syncedTotal, preview: [{ title: 'GitHub', url: 'https://github.com/' }] }
    }
  }
})
