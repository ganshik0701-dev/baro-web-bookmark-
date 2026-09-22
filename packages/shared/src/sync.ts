// 크롬 동기화 요청·응답 (POST /sync/chrome, docs/03-api.md).
// 앱(Bookmarks 파일)과 확장(chrome.bookmarks)이 같은 모양으로 평탄화해 보낸다.
// 형식(필드·타입·개수)은 여기서 엄격하게 막고, URL이 http/https인지는 서버가 항목마다 본다
// (크롬에는 javascript: 북마클릿, chrome:// 주소가 흔해서 하나 때문에 요청 전체를 거절하지 않는다).
import { z } from 'zod'

export const SYNC_MAX_BOOKMARKS = 5000
export const SYNC_MAX_FOLDERS = 1000
export const SYNC_MAX_BYTES = 2 * 1024 * 1024

const chromeId = z
  .string({ invalid_type_error: 'chromeId는 문자열이어야 합니다' })
  .min(1, 'chromeId가 비었습니다')
  .max(50, 'chromeId는 50자 이하여야 합니다')

const syncFolder = z
  .object({
    chromeId,
    /** 없거나 folders에 없으면 맨 위 폴더(최상위 폴더 바로 아래) */
    parentChromeId: chromeId.nullable().optional(),
    title: z.string({ invalid_type_error: '폴더 이름은 문자열이어야 합니다' })
  })
  .strict()

const syncBookmark = z
  .object({
    chromeId,
    /** 없거나 folders·기존 그룹에 없으면 미분류 */
    parentChromeId: chromeId.nullable().optional(),
    title: z.string({ invalid_type_error: '제목은 문자열이어야 합니다' }),
    /** 검사는 서버가 항목마다(http/https가 아니면 그 항목만 건너뜀) */
    url: z.string({ invalid_type_error: 'url은 문자열이어야 합니다' }),
    addedAt: z.string().datetime({ offset: true, message: 'addedAt은 ISO 8601 시각이어야 합니다' }).optional()
  })
  .strict()

export const syncChromeInput = z
  .object({
    mode: z.enum(['full', 'partial'], { errorMap: () => ({ message: 'mode는 full 또는 partial입니다' }) }),
    source: z.enum(['app', 'extension'], { errorMap: () => ({ message: 'source는 app 또는 extension입니다' }) }),
    profile: z.string().trim().max(50, 'profile은 50자 이하여야 합니다').nullable().optional(),
    folders: z.array(syncFolder).max(SYNC_MAX_FOLDERS, `폴더는 ${SYNC_MAX_FOLDERS}개까지 보낼 수 있습니다`).default([]),
    bookmarks: z
      .array(syncBookmark)
      .max(SYNC_MAX_BOOKMARKS, `북마크는 ${SYNC_MAX_BOOKMARKS}개까지 보낼 수 있습니다`)
      .default([]),
    deletedChromeIds: z.array(chromeId).max(SYNC_MAX_BOOKMARKS, `deletedChromeIds는 ${SYNC_MAX_BOOKMARKS}개까지입니다`).default([]),
    /** 대량 삭제 확인: 409 MASS_DELETE_CONFIRM_REQUIRED의 details.deleteCount를 그대로 */
    confirmDeleteCount: z.number().int('confirmDeleteCount는 정수여야 합니다').min(0).optional()
  })
  .strict()
  .superRefine((v, ctx) => {
    // 크롬 id는 폴더·북마크가 같은 번호 체계라 요청 안에서 겹치면 안 된다
    const seen = new Set<string>()
    for (const item of [...v.folders, ...v.bookmarks]) {
      if (seen.has(item.chromeId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `chromeId ${item.chromeId}가 두 번 나왔습니다` })
        return
      }
      seen.add(item.chromeId)
    }
    // 같은 id를 추가·수정하면서 지우라는 요청은 뜻이 모호하다
    const both = v.deletedChromeIds.find((id) => seen.has(id))
    if (both) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `chromeId ${both}가 항목과 deletedChromeIds에 함께 있습니다` })
  })

export type SyncChromeInput = z.infer<typeof syncChromeInput>

export type SyncSkippedReasons = { invalidUrl: number; duplicateUrl: number; manualExists: number }

export type SyncChromeResult = {
  created: number
  updated: number
  deleted: number
  skipped: number
  skippedReasons: SyncSkippedReasons
  syncedAt: string
}
