// /sync/chrome 계획 함수 단위 테스트 (DB 없음). 실제 크롬 Bookmarks 파일 모양의 샘플(test/fixtures)을 쓴다.
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { syncChromeInput, type SyncChromeInput } from '@baro/shared'
import { findNode, flattenChromeFile, loadFixture, removeNode, type ChromeFile } from '../test/chrome-bookmarks'
import {
  fitGroupName,
  needsMassDeleteConfirm,
  planSync,
  type ExistingBookmark,
  type ExistingGroup,
  type SyncPlan
} from './sync-plan'

const req = (file: ChromeFile, extra: Partial<SyncChromeInput> = {}): SyncChromeInput =>
  syncChromeInput.parse({ mode: 'full', source: 'app', profile: 'Default', ...flattenChromeFile(file), ...extra })

/** 계획을 '적용한 뒤'의 DB 상태를 흉내 낸다(두 번째 동기화 테스트용) */
function apply(plan: SyncPlan, bms: ExistingBookmark[], grs: ExistingGroup[]) {
  const delB = new Set(plan.bookmarks.delete)
  const delG = new Set(plan.groups.delete)
  const upd = new Map(plan.bookmarks.update.map((u) => [u.id, u]))
  const gUpd = new Map(plan.groups.update.map((u) => [u.id, u]))
  const nextGroups: ExistingGroup[] = [
    ...grs.filter((g) => !delG.has(g.id)).map((g) => ({ ...g, name: gUpd.get(g.id)?.name ?? g.name })),
    ...plan.groups.insert.map((g) => ({ id: g.id, name: g.name, chromeFolderId: g.chromeFolderId, position: g.position }))
  ]
  const nextBookmarks: ExistingBookmark[] = [
    ...bms
      .filter((b) => !delB.has(b.id))
      .map((b) => ({ ...b, ...(upd.get(b.id) ?? {}), groupId: delG.has(b.groupId ?? '') ? null : (upd.get(b.id)?.groupId ?? b.groupId) })),
    ...plan.bookmarks.insert.map((b) => ({
      id: b.id,
      chromeId: b.chromeId,
      normalizedUrl: b.normalizedUrl,
      source: b.source,
      title: b.title,
      url: b.url,
      groupId: b.groupId,
      position: b.position
    }))
  ]
  return { bookmarks: nextBookmarks, groups: nextGroups }
}

const manual = (url: string, normalizedUrl: string, source = 'manual'): ExistingBookmark => ({
  id: randomUUID(),
  chromeId: null,
  normalizedUrl,
  source,
  title: '직접 추가',
  url,
  groupId: null,
  position: 1
})

describe('planSync: 샘플 파일 첫 전체 동기화', () => {
  const file = loadFixture()
  const plan = planSync(req(file), { bookmarks: [], groups: [] }, 'app_sync')
  const groupName = (chromeFolderId: string) => plan.groups.insert.find((g) => g.chromeFolderId === chromeFolderId)?.name
  const inserted = (chromeId: string) => plan.bookmarks.insert.find((b) => b.chromeId === chromeId)

  it('폴더 → 경로 이름 그룹, 최상위 폴더는 그룹이 아니다', () => {
    expect(plan.groups.insert.map((g) => g.name)).toEqual([
      '개발',
      '개발/프론트엔드',
      // 경로 37자 → '…' + 끝 29자
      '…/상태 관리 라이브러리 비교 모음 (2026년 정리)',
      '빈 폴더',
      '개발 (2)'
    ])
    expect(Array.from(groupName('11')!)).toHaveLength(30)
    expect(groupName('11')!.startsWith('…')).toBe(true)
    expect(groupName('11')!.endsWith('/상태 관리 라이브러리 비교 모음 (2026년 정리)')).toBe(true)
    expect(plan.groups.insert.some((g) => ['1', '2', '3'].includes(g.chromeFolderId))).toBe(false)
  })

  it('최상위 폴더 바로 아래 북마크는 미분류, 폴더 안은 그 그룹', () => {
    expect(inserted('6')!.groupId).toBeNull()
    expect(inserted('12')!.groupId).toBe(plan.groups.insert.find((g) => g.chromeFolderId === '11')!.id)
    expect(inserted('21')!.groupId).toBe(plan.groups.insert.find((g) => g.chromeFolderId === '20')!.id)
  })

  it('건너뜀: javascript:·chrome:// 2개, 같은 URL(github.com/ 와 github.com) 1개', () => {
    expect(plan.skippedReasons).toEqual({ invalidUrl: 2, duplicateUrl: 1, manualExists: 0 })
    expect(inserted('5')).toBeDefined() // 트리 순서 첫 번째가 대표
    expect(inserted('13')).toBeUndefined()
    // 북마크 13개 - 잘못된 URL 2 - 중복 1
    expect(plan.bookmarks.insert).toHaveLength(10)
  })

  it('제목: 100자로 자르고, 비었으면 도메인. addedAt은 created_at, utm 파라미터는 정규화에서 뺀다', () => {
    expect(Array.from(inserted('16')!.title)).toHaveLength(100)
    expect(inserted('23')!.title).toBe('empty-title.example.com')
    expect(inserted('5')!.createdAt?.toISOString()).toBe('2026-08-01T03:00:00.000Z')
    expect(inserted('19')!.normalizedUrl).toBe('https://news.ycombinator.com')
    expect(inserted('19')!.url).toBe('https://news.ycombinator.com/?utm_source=chrome&utm_medium=bm')
    expect(inserted('22')!.url).toBe('http://example.org/old')
  })

  it('source와 자리: app → app_sync, 그룹마다 1부터', () => {
    expect(new Set(plan.bookmarks.insert.map((b) => b.source))).toEqual(new Set(['app_sync']))
    const uncategorized = plan.bookmarks.insert.filter((b) => b.groupId === null).map((b) => b.position)
    expect(uncategorized).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('그대로 다시 보내면 아무것도 바뀌지 않는다', () => {
    const state = apply(plan, [], [])
    const again = planSync(req(file), state, 'app_sync')
    expect(again.bookmarks).toEqual({ insert: [], update: [], delete: [], urlMoves: [] })
    expect(again.groups).toEqual({ insert: [], update: [], delete: [] })
  })
})

describe('planSync: 같은 URL 충돌', () => {
  it('이미 DB에 연결된 chrome_id가 대표로 남는다(동기화마다 바뀌지 않게)', () => {
    const file = loadFixture()
    const first = planSync(req(file), { bookmarks: [], groups: [] }, 'app_sync')
    const state = apply(first, [], [])
    // 5를 지웠다가 되살리면 13이 이미 github을 쥐고 있다 → 13이 대표
    removeNode(file, '5')
    const mid = apply(planSync(req(file), state, 'app_sync'), state.bookmarks, state.groups)
    expect(mid.bookmarks.find((b) => b.normalizedUrl === 'https://github.com')!.chromeId).toBe('13')
    const restored = loadFixture()
    const plan = planSync(req(restored), mid, 'app_sync')
    expect(plan.bookmarks.insert.find((b) => b.chromeId === '5')).toBeUndefined()
    expect(plan.skippedReasons.duplicateUrl).toBe(1)
  })

  it('manual·html_import와 같은 URL이면 크롬 쪽을 건너뛰고 기존 행은 건드리지 않는다', () => {
    const m = manual('https://react.dev/', 'https://react.dev')
    const h = manual('https://stackoverflow.com/', 'https://stackoverflow.com', 'html_import')
    const plan = planSync(req(loadFixture()), { bookmarks: [m, h], groups: [] }, 'app_sync')
    expect(plan.skippedReasons.manualExists).toBe(2)
    expect(plan.bookmarks.insert.find((b) => b.chromeId === '10' || b.chromeId === '21')).toBeUndefined()
    expect(plan.bookmarks.update.find((u) => u.id === m.id || u.id === h.id)).toBeUndefined()
    expect(plan.bookmarks.delete).not.toContain(m.id)
    expect(plan.bookmarks.delete).not.toContain(h.id)
  })

  it('URL 맞바꿈(A↔B)은 둘 다 수정, 임시 값 단계(urlMoves)에 둘 다 들어간다', () => {
    const file = loadFixture()
    const state = apply(planSync(req(file), { bookmarks: [], groups: [] }, 'app_sync'), [], [])
    findNode(file, '8').node.url = 'https://react.dev/'
    findNode(file, '10').node.url = 'https://developer.mozilla.org/ko/'
    const plan = planSync(req(file), state, 'app_sync')
    const ids = ['8', '10'].map((c) => state.bookmarks.find((b) => b.chromeId === c)!.id)
    expect(plan.bookmarks.update.map((u) => u.id).sort()).toEqual([...ids].sort())
    expect([...plan.bookmarks.urlMoves].sort()).toEqual([...ids].sort())
    expect(plan.skippedReasons.duplicateUrl).toBe(1)
  })

  it('partial: 새 URL이 남아 있는 다른 행과 겹치면 건너뛰고 이전 URL 유지', () => {
    const state = apply(planSync(req(loadFixture()), { bookmarks: [], groups: [] }, 'app_sync'), [], [])
    const plan = planSync(
      syncChromeInput.parse({
        mode: 'partial',
        source: 'extension',
        bookmarks: [{ chromeId: '8', parentChromeId: '7', title: 'MDN', url: 'https://react.dev/' }]
      }),
      state,
      'ext_sync'
    )
    expect(plan.skippedReasons.duplicateUrl).toBe(1)
    expect(plan.bookmarks.update).toEqual([])
    expect(plan.bookmarks.delete).toEqual([])
  })
})

describe('planSync: 삭제 규칙', () => {
  it('full: 요청에 없는 동기화분만 삭제, manual·html_import는 유지, 빠진 폴더의 그룹도 삭제', () => {
    const file = loadFixture()
    const m = manual('https://mine.example.com/', 'https://mine.example.com')
    const h = manual('https://imported.example.com/', 'https://imported.example.com', 'html_import')
    const state = apply(planSync(req(file), { bookmarks: [m, h], groups: [] }, 'app_sync'), [m, h], [])
    removeNode(file, '6')
    removeNode(file, '20')
    const plan = planSync(req(file), state, 'app_sync')
    const deleted = state.bookmarks.filter((b) => plan.bookmarks.delete.includes(b.id)).map((b) => b.chromeId)
    expect(deleted.sort()).toEqual(['21', '6'])
    expect(plan.groups.delete).toEqual([state.groups.find((g) => g.chromeFolderId === '20')!.id])
  })

  it('partial: deletedChromeIds만 삭제(북마크·폴더 공통 번호), 나머지는 그대로', () => {
    const state = apply(planSync(req(loadFixture()), { bookmarks: [], groups: [] }, 'app_sync'), [], [])
    const plan = planSync(
      syncChromeInput.parse({ mode: 'partial', source: 'extension', deletedChromeIds: ['6', '17', 'nope'] }),
      state,
      'ext_sync'
    )
    expect(plan.bookmarks.delete).toEqual([state.bookmarks.find((b) => b.chromeId === '6')!.id])
    expect(plan.groups.delete).toEqual([state.groups.find((g) => g.chromeFolderId === '17')!.id])
    expect(plan.massDelete.needsConfirm).toBe(false)
  })

  it('partial: 기존 그룹 아래 새 폴더는 그 그룹 이름을 경로 앞에 붙인다', () => {
    const state = apply(planSync(req(loadFixture()), { bookmarks: [], groups: [] }, 'app_sync'), [], [])
    const plan = planSync(
      syncChromeInput.parse({
        mode: 'partial',
        source: 'extension',
        folders: [{ chromeId: '50', parentChromeId: '9', title: '테스트' }],
        bookmarks: [{ chromeId: '51', parentChromeId: '50', title: 'Vitest', url: 'https://vitest.dev/' }]
      }),
      state,
      'ext_sync'
    )
    expect(plan.groups.insert[0]!.name).toBe('개발/프론트엔드/테스트')
    expect(plan.bookmarks.insert[0]).toMatchObject({ groupId: plan.groups.insert[0]!.id, source: 'ext_sync' })
  })
})

describe('대량 삭제 확인', () => {
  it.each([
    [19, 20, false], // 20개 미만
    [20, 40, true], // 절반 + 20개
    [20, 41, false], // 절반 미만, 100개 미만
    [99, 1000, false],
    [100, 1000, true], // 100개 이상은 비율과 상관없이
    [0, 0, false]
  ])('삭제 %i / 동기화분 %i → 확인 필요 %s', (del, total, expected) => {
    expect(needsMassDeleteConfirm(del, total)).toBe(expected)
  })

  const bigState = () => {
    const bookmarks: ExistingBookmark[] = Array.from({ length: 40 }, (_, i) => ({
      id: randomUUID(),
      chromeId: `x${i}`,
      normalizedUrl: `https://x.example.com/${i}`,
      source: 'app_sync',
      title: 't',
      url: `https://x.example.com/${i}`,
      groupId: null,
      position: i + 1
    }))
    return { bookmarks, groups: [] as ExistingGroup[] }
  }
  const keep = (n: number, extra: Partial<SyncChromeInput> = {}) =>
    syncChromeInput.parse({
      mode: 'full',
      source: 'app',
      bookmarks: Array.from({ length: n }, (_, i) => ({ chromeId: `x${i}`, title: 't', url: `https://x.example.com/${i}` })),
      ...extra
    })

  it('40개 중 20개만 남기면(20개 삭제) 확인 필요, 확인 개수가 같거나 크면 실행', () => {
    const state = bigState()
    const m = planSync(keep(20), state, 'app_sync').massDelete
    expect(m).toMatchObject({ deleteCount: 20, syncedTotal: 40, needsConfirm: true })
    // 미리보기: 지워질 행 앞 5개의 제목·URL만
    expect(m.preview).toEqual([20, 21, 22, 23, 24].map((i) => ({ title: 't', url: `https://x.example.com/${i}` })))
    expect(planSync(keep(20, { confirmDeleteCount: 20 }), state, 'app_sync').massDelete.needsConfirm).toBe(false)
    expect(planSync(keep(20, { confirmDeleteCount: 25 }), state, 'app_sync').massDelete.needsConfirm).toBe(false)
    // 확인한 뒤 더 지워졌으면(19개만 남김 → 21개 삭제) 다시 확인
    expect(planSync(keep(19, { confirmDeleteCount: 20 }), state, 'app_sync').massDelete.needsConfirm).toBe(true)
  })

  it('manual은 동기화분 수에도 삭제 수에도 들어가지 않는다', () => {
    const state = bigState()
    state.bookmarks.push(...Array.from({ length: 100 }, (_, i) => manual(`https://m.example.com/${i}`, `https://m.example.com/${i}`)))
    expect(planSync(keep(21), state, 'app_sync').massDelete).toEqual({ deleteCount: 19, syncedTotal: 40, needsConfirm: false, preview: [] })
  })
})

describe('그룹 이름', () => {
  it('30자에 맞추고 끝을 살린다, 접미사까지 30자', () => {
    expect(fitGroupName('짧은 이름')).toBe('짧은 이름')
    const long = '가'.repeat(40)
    expect(Array.from(fitGroupName(long))).toHaveLength(30)
    expect(fitGroupName(long).startsWith('…가')).toBe(true)
    expect(Array.from(fitGroupName(long, ' (2)'))).toHaveLength(30)
    expect(fitGroupName(long, ' (2)').endsWith('가 (2)')).toBe(true)
  })

  it('폴더 이름 맞바꿈(A↔B)은 두 그룹 수정으로, 동기화마다 이름이 흔들리지 않는다', () => {
    const file = loadFixture()
    const state = apply(planSync(req(file), { bookmarks: [], groups: [] }, 'app_sync'), [], [])
    findNode(file, '7').node.name = '빈 폴더'
    findNode(file, '17').node.name = '개발'
    const plan = planSync(req(file), state, 'app_sync')
    const byChrome = (c: string) => state.groups.find((g) => g.chromeFolderId === c)!.id
    expect(plan.groups.update).toContainEqual({ id: byChrome('7'), name: '빈 폴더' })
    expect(plan.groups.update).toContainEqual({ id: byChrome('17'), name: '개발' })
    // 기타/개발(20)은 '개발 (2)' 그대로
    expect(plan.groups.update.find((u) => u.id === byChrome('20'))).toBeUndefined()
    const next = apply(plan, state.bookmarks, state.groups)
    expect(planSync(req(file), next, 'app_sync').groups.update).toEqual([])
  })

  it('동기화와 무관한 그룹(chrome_folder_id 없음)의 이름은 피해 간다', () => {
    const own: ExistingGroup = { id: randomUUID(), name: '개발', chromeFolderId: null, position: 1 }
    const plan = planSync(req(loadFixture()), { bookmarks: [], groups: [own] }, 'app_sync')
    expect(plan.groups.insert.find((g) => g.chromeFolderId === '7')!.name).toBe('개발 (2)')
    expect(plan.groups.insert.find((g) => g.chromeFolderId === '20')!.name).toBe('개발 (3)')
    expect(plan.groups.delete).toEqual([])
  })
})

describe('요청 형식', () => {
  it('chromeId 중복, 항목과 deletedChromeIds 겹침, 모르는 필드는 400', () => {
    const base = { mode: 'partial', source: 'extension' }
    expect(syncChromeInput.safeParse({ ...base, bookmarks: [{ chromeId: '1', title: 'a', url: 'x' }], folders: [{ chromeId: '1', title: 'f' }] }).success).toBe(false)
    expect(syncChromeInput.safeParse({ ...base, bookmarks: [{ chromeId: '1', title: 'a', url: 'x' }], deletedChromeIds: ['1'] }).success).toBe(false)
    expect(syncChromeInput.safeParse({ ...base, allowDuplicate: true }).success).toBe(false)
    expect(syncChromeInput.safeParse({ ...base, bookmarks: [{ chromeId: '1', title: 'a', url: 'x', addedAt: '어제' }] }).success).toBe(false)
  })

  it('URL이 이상해도 형식 검증은 통과(서버가 항목마다 건너뜀)', () => {
    const r = syncChromeInput.safeParse({ mode: 'full', source: 'app', bookmarks: [{ chromeId: '1', title: 'a', url: 'javascript:alert(1)' }] })
    expect(r.success).toBe(true)
  })
})
