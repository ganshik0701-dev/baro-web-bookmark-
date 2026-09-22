// chrome.bookmarks 트리 → POST /sync/chrome 요청 항목 (docs/01-spec.md '확장 동작 규칙', docs/03-api.md).
//
// 폴더 → 그룹 매핑 규칙 (서버가 그룹을 만든다. 확장은 폴더를 이 규칙대로 보내기만 한다)
//   - getTree()의 맨 위 노드(id '0')와 그 바로 아래 최상위 폴더(북마크바·기타 북마크·모바일 북마크)는 folders에 넣지 않는다
//   - 그 아래 폴더는 모두 folders에 { chromeId, parentChromeId, title }로 넣는다.
//     서버는 부모가 folders에 없는 폴더를 맨 위로 보고, 경로 이름 그룹('상위/하위', 30자 초과는 끝을 살림)을 만든다
//   - 최상위 폴더 바로 아래 북마크는 parentChromeId가 최상위 폴더 id라서 서버가 미분류(groupId null)로 둔다
//   - 크롬 id는 폴더·북마크가 같은 번호 체계다(서버도 같은 전제)
//
// URL 거르기: 서버와 같은 규칙(packages/shared의 httpUrl). http/https가 아니거나(javascript: 북마클릿, chrome://, file://)
// 2048자를 넘는 URL은 보내지 않고 개수만 센다
import { httpUrl, type SyncChromeInput } from '@baro/shared'

export type TreeNode = chrome.bookmarks.BookmarkTreeNode
export type SyncFolder = SyncChromeInput['folders'][number]
export type SyncBookmark = SyncChromeInput['bookmarks'][number]

export type Flattened = { folders: SyncFolder[]; bookmarks: SyncBookmark[]; filtered: number }

const ROOT_ID = '0'

/** 최상위 폴더(북마크바 등)인가: 맨 위 노드 바로 아래 */
export function isTopLevelFolder(node: TreeNode): boolean {
  return node.parentId === ROOT_ID && !node.url
}

/** http/https로 보낼 수 있는 URL인가(서버와 같은 규칙) */
export function isSendableUrl(url: string): boolean {
  return httpUrl.safeParse(url).success
}

function toBookmark(node: TreeNode): SyncBookmark {
  return {
    chromeId: node.id,
    parentChromeId: node.parentId ?? null,
    title: node.title,
    url: node.url!,
    ...(node.dateAdded ? { addedAt: new Date(node.dateAdded).toISOString() } : {})
  }
}

/**
 * 노드 하나와 그 하위 전부를 평탄화한다(전체 동기화는 getTree()의 맨 위 노드, 실시간 동기화는 getSubTree()의 노드).
 * 맨 위 노드와 최상위 폴더 자신은 folders에 넣지 않고 그 아래만 넣는다
 */
export function flatten(nodes: TreeNode[]): Flattened {
  const out: Flattened = { folders: [], bookmarks: [], filtered: 0 }
  const walk = (node: TreeNode) => {
    if (node.url !== undefined) {
      if (isSendableUrl(node.url)) out.bookmarks.push(toBookmark(node))
      else out.filtered++
      return
    }
    if (node.id !== ROOT_ID && !isTopLevelFolder(node)) {
      out.folders.push({ chromeId: node.id, parentChromeId: node.parentId ?? null, title: node.title })
    }
    for (const child of node.children ?? []) walk(child)
  }
  for (const n of nodes) walk(n)
  return out
}

/** 노드와 하위의 id 전부(onRemoved의 removeInfo.node로 지울 id를 모은다) */
export function collectIds(node: TreeNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap(collectIds)]
}

export const MAX_BYTES = 2 * 1024 * 1024
export const MAX_BOOKMARKS = 5000

/** 보낼 JSON의 실제 바이트 수(UTF-8). 한글 제목은 글자당 3바이트라 글자 수로 세면 틀린다 */
export function jsonBytes(body: unknown): number {
  return new TextEncoder().encode(JSON.stringify(body)).length
}
