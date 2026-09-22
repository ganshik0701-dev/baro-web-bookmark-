// 서비스 워커. 모든 fetch와 chrome.bookmarks 읽기는 여기서만 한다(팝업은 메시지만 보낸다).
// 동작은 engine.ts, 여기는 크롬 이벤트·메시지를 잇기만 한다.
// MV3 규칙: 리스너는 최상위에서 동기적으로 등록해야 서비스 워커가 다시 깨어날 때도 받는다
import { createEngine } from './engine'
import type { Message, Reply } from './state'
import { collectIds } from './tree'

declare const __API_BASE__: string

const engine = createEngine({
  store: chrome.storage.local,
  getTree: () => chrome.bookmarks.getTree(),
  getSubTree: (id) => chrome.bookmarks.getSubTree(id),
  fetch: (...args) => fetch(...args),
  apiBase: __API_BASE__,
  now: () => new Date()
})

// ─── 실시간 동기화(EXT-02) ───
// 만들기: 새 노드 하나(폴더면 아직 비어 있다)
chrome.bookmarks.onCreated.addListener((_id, node) => void engine.enqueue({ type: 'upsert', nodes: [node] }))
// 이름·URL 변경: 폴더면 하위 경로 이름도 바뀌므로 하위 트리를 함께 보낸다
chrome.bookmarks.onChanged.addListener((id) => void subtree(id))
// 이동: 부모가 바뀌고, 폴더면 하위 경로 이름도 바뀐다
chrome.bookmarks.onMoved.addListener((id) => void subtree(id))
// 삭제: 지운 노드와 하위 id 전부
chrome.bookmarks.onRemoved.addListener((_id, info) => void engine.enqueue({ type: 'remove', ids: collectIds(info.node) }))
// 가져오기 중 이벤트는 모으지 않고, 끝나면 전체 동기화
chrome.bookmarks.onImportBegan.addListener(() => void engine.importBegan())
chrome.bookmarks.onImportEnded.addListener(() => void engine.importEnded())

async function subtree(id: string) {
  try {
    await engine.enqueue({ type: 'upsert', nodes: await chrome.bookmarks.getSubTree(id) })
  } catch {
    // 그사이 지워진 노드. onRemoved가 따로 온다
  }
}

// ─── 팝업 메시지 ───
chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse: (r: Reply) => void) => {
  // 이 확장 자신의 페이지(팝업)가 보낸 것만 받는다
  if (sender.id !== chrome.runtime.id) return false
  const run = (): Promise<Reply> => {
    switch (msg.type) {
      case 'token:save':
        return engine.saveToken(msg.token)
      case 'token:clear':
        return engine.clearToken()
      case 'connection:check':
        return engine.checkConnection()
      case 'sync:full':
        return engine.fullSync()
      case 'sync:confirm':
        return engine.confirm()
      case 'sync:cancel':
        return engine.cancel()
      default:
        return Promise.resolve({ ok: false, message: '알 수 없는 요청' })
    }
  }
  run().then(sendResponse, () => sendResponse({ ok: false, message: '처리하지 못했습니다' }))
  return true // 비동기 응답
})

void engine.onStartup()
