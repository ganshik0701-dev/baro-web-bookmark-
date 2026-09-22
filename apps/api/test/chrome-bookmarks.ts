// 테스트 도우미: 크롬 Bookmarks 파일(JSON) → POST /sync/chrome 요청 모양.
// 실제 파싱은 5주차 DESK-01에서 앱(메인 프로세스)에 만든다. 이 파일은 그때 옮겨 갈 초안이다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SyncChromeInput } from '@baro/shared'

export type ChromeNode = {
  id: string
  name: string
  type: 'url' | 'folder'
  url?: string
  date_added?: string
  children?: ChromeNode[]
  [key: string]: unknown
}
export type ChromeFile = { checksum: string; roots: Record<string, ChromeNode>; version: number }

/** 크롬 date_added(1601-01-01 기준 마이크로초 문자열) → ISO 8601 */
export function chromeTimeToIso(value: string | undefined): string | undefined {
  if (!value || value === '0') return undefined
  const ms = Number(BigInt(value) / 1000n) - 11_644_473_600_000
  return new Date(ms).toISOString()
}

export function isoToChromeTime(iso: string): string {
  return String((BigInt(Date.parse(iso)) + 11_644_473_600_000n) * 1000n)
}

export function loadFixture(): ChromeFile {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', 'chrome-bookmarks.json'), 'utf8')) as ChromeFile
}

/**
 * 최상위 폴더(bookmark_bar·other·synced)는 folders에 넣지 않는다(docs/03-api.md).
 * 그 바로 아래 항목의 parentChromeId는 최상위 폴더 id라서 서버는 맨 위(폴더) 또는 미분류(북마크)로 본다
 */
export function flattenChromeFile(file: ChromeFile): Pick<SyncChromeInput, 'folders' | 'bookmarks'> {
  const folders: SyncChromeInput['folders'] = []
  const bookmarks: SyncChromeInput['bookmarks'] = []
  const walk = (node: ChromeNode, parentId: string, isRoot: boolean) => {
    if (node.type === 'folder') {
      if (!isRoot) folders.push({ chromeId: node.id, parentChromeId: parentId, title: node.name })
      for (const child of node.children ?? []) walk(child, node.id, false)
    } else {
      bookmarks.push({
        chromeId: node.id,
        parentChromeId: parentId,
        title: node.name,
        url: node.url ?? '',
        addedAt: chromeTimeToIso(node.date_added)
      })
    }
  }
  for (const root of Object.values(file.roots)) walk(root, '0', true)
  return { folders, bookmarks }
}

/** 트리에서 id로 노드 찾기(부모도 함께) */
export function findNode(file: ChromeFile, id: string): { node: ChromeNode; parent: ChromeNode } {
  const search = (parent: ChromeNode): { node: ChromeNode; parent: ChromeNode } | null => {
    for (const child of parent.children ?? []) {
      if (child.id === id) return { node: child, parent }
      const found = search(child)
      if (found) return found
    }
    return null
  }
  for (const root of Object.values(file.roots)) {
    const found = search(root)
    if (found) return found
  }
  throw new Error(`노드 ${id} 없음`)
}

/** 크롬에서 지운 것처럼 */
export function removeNode(file: ChromeFile, id: string): void {
  const { parent } = findNode(file, id)
  parent.children = parent.children!.filter((c) => c.id !== id)
}

/**
 * 큰 파일 만들기(성능 측정용): 폴더 folderCount개 × 폴더당 perFolder개, 북마크바 아래.
 * id는 1000부터, URL은 모두 다르다
 */
export function generateChromeFile(folderCount: number, perFolder: number, urlPrefix = 'https://perf.example.com'): ChromeFile {
  let id = 1000
  const children: ChromeNode[] = []
  for (let f = 0; f < folderCount; f++) {
    const folderId = String(id++)
    const items: ChromeNode[] = []
    for (let i = 0; i < perFolder; i++) {
      const n = String(id++)
      items.push({ id: n, name: `북마크 ${n}`, type: 'url', url: `${urlPrefix}/${f}/${i}`, date_added: isoToChromeTime('2026-08-01T00:00:00Z') })
    }
    children.push({ id: folderId, name: `폴더 ${f}`, type: 'folder', children: items })
  }
  return {
    checksum: '',
    version: 1,
    roots: {
      bookmark_bar: { id: '1', name: '북마크바', type: 'folder', children },
      other: { id: '2', name: '기타 북마크', type: 'folder', children: [] },
      synced: { id: '3', name: '모바일 북마크', type: 'folder', children: [] }
    }
  }
}
