// 크롬 Bookmarks 파일(JSON) → POST /sync/chrome 요청 항목 (docs/01-spec.md 'Bookmarks 파일 읽기 규칙').
//
// 이 파일에는 fs가 없다. 문자열을 받아 결과만 돌려주는 순수 함수라 단위 테스트로 규칙을 확인할 수 있다.
// 파일을 읽고 재시도하는 쪽은 chrome-bookmarks.ts다.
//
// 확장(apps/extension/src/tree.ts)과 같은 결과를 만들어야 한다. 입력 모양만 다르다:
//   확장: chrome.bookmarks API — camelCase, parentId 있음, dateAdded는 1970년 기준 밀리초
//   앱  : Bookmarks 파일     — snake_case, 부모 id 없음(중첩), date_added는 1601년 기준 마이크로초 문자열
import { httpUrl, type SyncChromeInput } from '@baro/shared'

export type SyncFolder = SyncChromeInput['folders'][number]
export type SyncBookmark = SyncChromeInput['bookmarks'][number]

export type ParsedTree = {
  folders: SyncFolder[]
  bookmarks: SyncBookmark[]
  /** http/https가 아니거나 2048자를 넘어 뺀 개수 */
  filtered: number
  /** 루트별 북마크 수(SCR-02 표시용). 폴더는 세지 않는다 */
  rootCounts: Record<RootKey, number>
  /** 북마크가 0개. full을 그냥 보내면 안 된다(docs/01-spec.md '의심스러운 결과') */
  suspicious: boolean
}

export type ParseFailReason = 'invalid_json' | 'no_roots' | 'bad_root'
export type ParseResult = { ok: true; tree: ParsedTree } | { ok: false; reason: ParseFailReason; message: string }

/** 최상위 폴더. 이 셋은 folders에 넣지 않는다. id는 크롬이 1·2·3으로 고정해 두지만 파일 값을 그대로 쓴다 */
const ROOT_KEYS = ['bookmark_bar', 'other', 'synced'] as const
export type RootKey = (typeof ROOT_KEYS)[number]

/** 1601-01-01 → 1970-01-01 (밀리초) */
const EPOCH_DIFF_MS = 11_644_473_600_000
/** 시계가 어긋난 PC를 감안해 하루까지는 봐준다 */
const FUTURE_TOLERANCE_MS = 86_400_000

type FileNode = { id?: unknown; name?: unknown; type?: unknown; url?: unknown; date_added?: unknown; children?: unknown }

/**
 * date_added(1601년 기준 마이크로초 문자열) → ISO 시각.
 * 실제 값이 17자리라 Number.MAX_SAFE_INTEGER(16자리)를 넘는다. 그래서 BigInt로 1000을 나눠
 * 밀리초로 줄인 뒤에 Number로 바꾼다(Number(raw) / 1e6으로 하면 정밀도를 잃는다).
 * 값이 없거나 이상하면 undefined를 돌려주고, 부르는 쪽은 addedAt을 아예 넣지 않는다
 */
export function toAddedAt(raw: unknown, now = Date.now()): string | undefined {
  if (typeof raw !== 'string' || !/^\d{1,20}$/.test(raw)) return undefined
  const ms = Number(BigInt(raw) / 1000n) - EPOCH_DIFF_MS
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  if (ms > now + FUTURE_TOLERANCE_MS) return undefined
  return new Date(ms).toISOString()
}

/** http/https로 보낼 수 있는 URL인가(서버·확장과 같은 규칙) */
export function isSendableUrl(url: string): boolean {
  return httpUrl.safeParse(url).success
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** JSON 문자열 → 요청 항목. 던지지 않고 결과로 실패를 알린다 */
export function parseBookmarksJson(text: string, now = Date.now()): ParseResult {
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'invalid_json', message: '북마크 파일을 읽을 수 없습니다(JSON 형식이 아닙니다)' }
  }
  if (!isRecord(file) || !isRecord(file.roots)) {
    return { ok: false, reason: 'no_roots', message: '북마크 파일에 roots가 없습니다' }
  }
  const roots = file.roots

  // 알려진 루트가 하나도 없으면 Bookmarks 파일이 아니거나 저장 중인 중간 상태로 본다
  const present = ROOT_KEYS.filter((key) => isRecord(roots[key]))
  if (present.length === 0) {
    return { ok: false, reason: 'no_roots', message: '북마크 파일에서 북마크바·기타 북마크를 찾지 못했습니다' }
  }

  const tree: ParsedTree = {
    folders: [],
    bookmarks: [],
    filtered: 0,
    rootCounts: { bookmark_bar: 0, other: 0, synced: 0 },
    suspicious: false
  }

  for (const key of present) {
    const root = roots[key] as Record<string, unknown>
    // children이 배열이 아니면 그 루트만 건너뛰는 게 아니라 파일 전체를 의심한다(반쯤 쓰인 파일)
    if (root.children !== undefined && !Array.isArray(root.children)) {
      return { ok: false, reason: 'bad_root', message: `북마크 파일의 ${key} 구조가 올바르지 않습니다` }
    }
    const rootId = typeof root.id === 'string' ? root.id : null
    const before = tree.bookmarks.length
    for (const child of (root.children ?? []) as unknown[]) walk(child, rootId, tree, now)
    tree.rootCounts[key] = tree.bookmarks.length - before
  }

  tree.suspicious = tree.bookmarks.length === 0
  return { ok: true, tree }
}

/**
 * 노드 하나와 그 하위를 훑는다. 최상위 폴더는 이미 건너뛴 상태로 들어온다(parentChromeId로만 쓰인다).
 * id나 type이 이상한 항목은 그 항목만 건너뛴다(파일 전체를 버리지 않는다)
 */
function walk(node: unknown, parentId: string | null, out: ParsedTree, now: number): void {
  if (!isRecord(node)) return
  const n = node as FileNode
  if (typeof n.id !== 'string' || n.id === '') return

  const title = typeof n.name === 'string' ? n.name : ''
  // type이 없으면 url 유무로 본다(크롬은 늘 넣지만 방어적으로)
  const isUrl = n.type === 'url' || (n.type === undefined && typeof n.url === 'string')

  if (isUrl) {
    if (typeof n.url !== 'string') return
    if (!isSendableUrl(n.url)) {
      out.filtered++
      return
    }
    const addedAt = toAddedAt(n.date_added, now)
    out.bookmarks.push({
      chromeId: n.id,
      parentChromeId: parentId,
      title,
      url: n.url,
      ...(addedAt ? { addedAt } : {})
    })
    return
  }

  if (n.type !== 'folder' && n.type !== undefined) return
  out.folders.push({ chromeId: n.id, parentChromeId: parentId, title })
  if (Array.isArray(n.children)) {
    for (const child of n.children) walk(child, n.id, out, now)
  }
}
