// POST /sync/chrome의 계획 세우기 (docs/03-api.md '/sync/chrome').
// DB를 건드리지 않는 순수 함수다: 요청 + 지금 DB에 있는 내 북마크·그룹 → 추가·수정·삭제·건너뜀 목록.
// 같은 URL 충돌을 여기서 모두 정리하므로, 쓰기(lib/sync.ts)는 유니크 제약에 걸리지 않는다.
import { randomUUID } from 'node:crypto'
import { httpUrl, normalizeUrl, type MassDeletePreview, type SyncChromeInput, type SyncSkippedReasons } from '@baro/shared'
import { titleFromUrl } from './bookmarks'

export type DbSource = 'app_sync' | 'ext_sync'

export type ExistingBookmark = {
  id: string
  chromeId: string | null
  normalizedUrl: string
  source: string
  title: string
  url: string
  groupId: string | null
  position: number
}

export type ExistingGroup = { id: string; name: string; chromeFolderId: string | null; position: number }

export type NewGroup = { id: string; chromeFolderId: string; name: string; position: number }
export type NewBookmark = {
  id: string
  chromeId: string
  title: string
  url: string
  normalizedUrl: string
  groupId: string | null
  position: number
  source: DbSource
  createdAt?: Date
}
export type BookmarkChange = {
  id: string
  title: string
  url: string
  normalizedUrl: string
  groupId: string | null
  source: DbSource
}

export type SyncPlan = {
  groups: { insert: NewGroup[]; update: { id: string; name: string }[]; delete: string[] }
  bookmarks: {
    insert: NewBookmark[]
    update: BookmarkChange[]
    delete: string[]
    /** URL이 바뀌는 행. 쓰기 때 먼저 임시 값으로 비워 둬야 맞바꿈이 유니크에 걸리지 않는다 */
    urlMoves: string[]
  }
  skippedReasons: SyncSkippedReasons
  massDelete: { deleteCount: number; syncedTotal: number; needsConfirm: boolean; preview: MassDeletePreview[] }
}

const GROUP_NAME_MAX = 30
const TITLE_MAX = 100
const UNNAMED_FOLDER = '(이름 없음)'
const USER_SOURCES = new Set(['manual', 'html_import'])

/**
 * 대량 삭제 확인이 필요한가 (docs/03-api.md '대량 삭제 확인').
 * (절반 이상 그리고 20개 이상) 또는 100개 이상.
 * 절반 조건만 두면 북마크바만 읽힌 경우처럼 절반이 안 되는 부분 실패를 놓쳐서 100개 조건을 함께 둔다
 */
export function needsMassDeleteConfirm(deleteCount: number, syncedTotal: number): boolean {
  return (deleteCount >= 20 && deleteCount * 2 >= syncedTotal) || deleteCount >= 100
}

const chars = (s: string) => Array.from(s)
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** 그룹 이름을 30자에 맞춘다. 넘으면 끝을 살린다('…/프론트/리액트'). suffix(' (2)')까지 합쳐 30자 */
export function fitGroupName(path: string, suffix = ''): string {
  const max = GROUP_NAME_MAX - chars(suffix).length
  const c = chars(path)
  const base = c.length <= max ? path : '…' + c.slice(c.length - max).join('')
  return base + suffix
}

function nameCandidates(path: string, limit: number): string[] {
  return Array.from({ length: limit }, (_, i) => fitGroupName(path, i === 0 ? '' : ` (${i + 1})`))
}

function fitTitle(raw: string, url: string): string {
  const t = clean(raw)
  return t ? chars(t).slice(0, TITLE_MAX).join('') : titleFromUrl(url)
}

export function planSync(
  input: SyncChromeInput,
  existing: { bookmarks: ExistingBookmark[]; groups: ExistingGroup[] },
  source: DbSource
): SyncPlan {
  const full = input.mode === 'full'
  const deletedIds = new Set(full ? [] : input.deletedChromeIds)

  // ─── 폴더 → 그룹 ──────────────────────────────────────
  const reqFolders = new Map(input.folders.map((f) => [f.chromeId, f]))
  const groupByChrome = new Map(existing.groups.filter((g) => g.chromeFolderId).map((g) => [g.chromeFolderId!, g]))

  // full: 요청에 없는 폴더의 그룹 삭제 / partial: deletedChromeIds의 그룹만 삭제
  const deletedGroups = existing.groups.filter(
    (g) => g.chromeFolderId && (full ? !reqFolders.has(g.chromeFolderId) : deletedIds.has(g.chromeFolderId))
  )
  const deletedGroupIds = new Set(deletedGroups.map((g) => g.id))

  // 이번에 이름을 정하지 않는 그룹(동기화와 무관한 그룹, partial에서 언급 안 된 그룹)의 이름은 그대로 차지한다
  const taken = new Set(
    existing.groups
      .filter((g) => !deletedGroupIds.has(g.id) && !(g.chromeFolderId && reqFolders.has(g.chromeFolderId)))
      .map((g) => g.name)
  )

  // 경로 이름: 부모가 요청 폴더면 이어 붙이고, partial에서 부모가 기존 그룹이면 그 이름을 앞에 붙인다
  const pathMemo = new Map<string, string>()
  const pathOf = (id: string, depth = 0): string => {
    const memo = pathMemo.get(id)
    if (memo) return memo
    const f = reqFolders.get(id)!
    const seg = clean(f.title) || UNNAMED_FOLDER
    const parent = f.parentChromeId ?? null
    let path = seg
    // depth 제한: 부모가 서로를 가리키는 잘못된 요청에서 끝없이 돌지 않게
    if (parent && reqFolders.has(parent) && depth < 50) path = `${pathOf(parent, depth + 1)}/${seg}`
    else if (!full && parent && groupByChrome.has(parent) && !deletedIds.has(parent)) {
      path = `${groupByChrome.get(parent)!.name}/${seg}`
    }
    pathMemo.set(id, path)
    return path
  }

  const finalName = new Map<string, string>()
  // 1차: 기존 그룹이 이미 알맞은 이름(경로 또는 ' (n)' 붙은 경로)이면 그대로 둔다(동기화마다 이름이 흔들리지 않게)
  for (const f of input.folders) {
    const g = groupByChrome.get(f.chromeId)
    if (!g) continue
    const ok = nameCandidates(pathOf(f.chromeId), input.folders.length + taken.size + 1).includes(g.name)
    if (ok && !taken.has(g.name)) {
      finalName.set(f.chromeId, g.name)
      taken.add(g.name)
    }
  }
  // 2차: 나머지는 요청 순서대로 비어 있는 첫 이름
  for (const f of input.folders) {
    if (finalName.has(f.chromeId)) continue
    const name = nameCandidates(pathOf(f.chromeId), input.folders.length + taken.size + 1).find((n) => !taken.has(n))!
    finalName.set(f.chromeId, name)
    taken.add(name)
  }

  const groupInsert: NewGroup[] = []
  const groupUpdate: { id: string; name: string }[] = []
  let nextGroupPos = Math.max(0, ...existing.groups.map((g) => g.position)) + 1
  const groupIdByChrome = new Map<string, string>()
  for (const g of existing.groups) {
    if (g.chromeFolderId && !deletedGroupIds.has(g.id)) groupIdByChrome.set(g.chromeFolderId, g.id)
  }
  for (const f of input.folders) {
    const name = finalName.get(f.chromeId)!
    const g = groupByChrome.get(f.chromeId)
    if (g) {
      if (g.name !== name) groupUpdate.push({ id: g.id, name })
    } else {
      const id = randomUUID()
      groupInsert.push({ id, chromeFolderId: f.chromeId, name, position: nextGroupPos++ })
      groupIdByChrome.set(f.chromeId, id)
    }
  }
  const groupFor = (parent: string | null | undefined) => (parent && groupIdByChrome.get(parent)) || null

  // ─── 북마크 ───────────────────────────────────────────
  const skippedReasons: SyncSkippedReasons = { invalidUrl: 0, duplicateUrl: 0, manualExists: 0 }
  const rowByChrome = new Map(existing.bookmarks.filter((b) => b.chromeId).map((b) => [b.chromeId!, b]))
  const rowByUrl = new Map(existing.bookmarks.map((b) => [b.normalizedUrl, b]))

  type Cand = { item: SyncChromeInput['bookmarks'][number]; url: string; norm: string; row?: ExistingBookmark }
  const byNorm = new Map<string, Cand[]>()
  for (const item of input.bookmarks) {
    const parsed = httpUrl.safeParse(item.url)
    if (!parsed.success) {
      skippedReasons.invalidUrl++
      continue
    }
    const norm = normalizeUrl(parsed.data)
    const list = byNorm.get(norm) ?? []
    list.push({ item, url: parsed.data, norm, row: rowByChrome.get(item.chromeId) })
    byNorm.set(norm, list)
  }

  // 같은 URL은 대표 하나: 이미 그 URL을 가진 행의 chrome_id가 후보에 있으면 그것, 없으면 요청 순서의 첫 번째
  const reps: Cand[] = []
  for (const [norm, list] of byNorm) {
    const owner = rowByUrl.get(norm)
    const rep = (owner?.chromeId && list.find((c) => c.item.chromeId === owner.chromeId)) || list[0]!
    reps.push(rep)
    skippedReasons.duplicateUrl += list.length - 1
  }

  // 대표가 URL을 가져갈 수 있는가: 끝난 뒤에도 그 URL을 쥐고 있을 다른 행이 있으면 못 가져간다.
  //   full: 남는 행 = manual·html_import뿐(대표가 아닌 동기화분은 지워진다)
  //   partial: 남는 행 = 지우지 않는 행 중 대표의 행이 아닌 것 + 건너뛴 대표의 행(이전 URL 유지)
  const repRowIds = new Set(reps.flatMap((r) => (r.row ? [r.row.id] : [])))
  const keepsUrl = (b: ExistingBookmark) =>
    full
      ? USER_SOURCES.has(b.source)
      : !(b.chromeId && deletedIds.has(b.chromeId)) && !repRowIds.has(b.id)
  const skippedRep = new Map<Cand, keyof SyncSkippedReasons>()
  for (let changed = true; changed; ) {
    changed = false
    const reserved = new Map<string, ExistingBookmark>()
    for (const b of existing.bookmarks) if (keepsUrl(b)) reserved.set(b.normalizedUrl, b)
    if (!full) for (const r of skippedRep.keys()) if (r.row) reserved.set(r.row.normalizedUrl, r.row)
    for (const r of reps) {
      if (skippedRep.has(r)) continue
      const owner = reserved.get(r.norm)
      if (owner && owner.id !== r.row?.id) {
        skippedRep.set(r, USER_SOURCES.has(owner.source) ? 'manualExists' : 'duplicateUrl')
        changed = true
      }
    }
  }
  for (const reason of skippedRep.values()) skippedReasons[reason]++
  const accepted = reps.filter((r) => !skippedRep.has(r))

  // 삭제: full은 받아들인 chrome_id에 없는 동기화분 전부, partial은 deletedChromeIds만.
  // chrome_id가 있는 행 = 동기화분(DB CHECK bookmarks_chrome_id_source_check)이라 manual·html_import는 대상이 될 수 없다
  const acceptedIds = new Set(accepted.map((r) => r.item.chromeId))
  const synced = existing.bookmarks.filter((b) => b.chromeId)
  const toDelete = synced.filter((b) => (full ? !acceptedIds.has(b.chromeId!) : deletedIds.has(b.chromeId!)))

  // 새 행 자리: 그룹마다 지금 최대값 뒤로
  const maxPos = new Map<string | null, number>()
  for (const b of existing.bookmarks) maxPos.set(b.groupId, Math.max(maxPos.get(b.groupId) ?? 0, b.position))
  const insert: NewBookmark[] = []
  const update: BookmarkChange[] = []
  const urlMoves: string[] = []
  for (const r of accepted) {
    const groupId = groupFor(r.item.parentChromeId)
    const title = fitTitle(r.item.title, r.url)
    if (r.row) {
      const next: BookmarkChange = { id: r.row.id, title, url: r.url, normalizedUrl: r.norm, groupId, source }
      const same =
        r.row.title === title &&
        r.row.url === r.url &&
        r.row.normalizedUrl === r.norm &&
        r.row.groupId === groupId &&
        r.row.source === source
      if (!same) update.push(next)
      if (r.row.normalizedUrl !== r.norm) urlMoves.push(r.row.id)
    } else {
      const position = (maxPos.get(groupId) ?? 0) + 1
      maxPos.set(groupId, position)
      insert.push({
        id: randomUUID(),
        chromeId: r.item.chromeId,
        title,
        url: r.url,
        normalizedUrl: r.norm,
        groupId,
        position,
        source,
        createdAt: r.item.addedAt ? new Date(r.item.addedAt) : undefined
      })
    }
  }

  const deleteCount = full ? toDelete.length : 0
  const needsConfirm =
    full &&
    needsMassDeleteConfirm(deleteCount, synced.length) &&
    !(input.confirmDeleteCount !== undefined && deleteCount <= input.confirmDeleteCount)

  return {
    groups: { insert: groupInsert, update: groupUpdate, delete: deletedGroups.map((g) => g.id) },
    bookmarks: { insert, update, delete: toDelete.map((b) => b.id), urlMoves },
    skippedReasons,
    // 확인 화면용: 지워질 북마크 앞 5개(요청한 사용자 자신의 행만 들어 있다)
    massDelete: {
      deleteCount,
      syncedTotal: synced.length,
      needsConfirm,
      preview: needsConfirm ? toDelete.slice(0, 5).map((b) => ({ title: b.title, url: b.url })) : []
    }
  }
}
