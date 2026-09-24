// 북마크 입력 검증과 URL 정규화 (BM-01~05, docs/03-api.md).
// API가 요청 바디를 검증할 때와 앱 화면이 폼을 검증할 때 같은 스키마를 쓴다.
// 동기화(/sync/chrome)·그룹·토큰 스키마는 해당 작업 때 따로 추가한다.
import { z } from 'zod'
import type { BookmarkSource } from './types'

const URL_MAX = 2048

// 'javascript:', 'mailto:'처럼 '//' 없는 스킴. 뒤가 숫자면 스킴이 아니라 포트다('localhost:3000')
const BARE_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i
const WITH_SLASHES = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * BM-02. 사용자가 입력한 주소를 저장할 URL로 바꾼다.
 * 앞뒤 공백을 자르고, 스킴이 없으면 https://를 붙이고, http/https만 받는다.
 * 결과는 URL 파서가 정리한 형태(호스트 소문자, 기본 포트 제거 등)다.
 */
export const httpUrl = z
  .string({ required_error: '주소를 입력하세요', invalid_type_error: '주소는 문자열이어야 합니다' })
  .trim()
  .min(1, '주소를 입력하세요')
  .transform((raw, ctx) => {
    const withScheme = WITH_SLASHES.test(raw) || BARE_SCHEME.test(raw) ? raw : `https://${raw}`
    let url: URL
    try {
      url = new URL(withScheme)
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '올바른 주소가 아닙니다' })
      return z.NEVER
    }
    // javascript:, data: 등은 저장도 실행도 하지 않는다 (CLAUDE.md 'API 보안')
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'http 또는 https 주소만 저장할 수 있습니다' })
      return z.NEVER
    }
    if (!url.hostname) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '올바른 주소가 아닙니다' })
      return z.NEVER
    }
    if (url.href.length > URL_MAX) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `주소는 ${URL_MAX}자 이하여야 합니다` })
      return z.NEVER
    }
    return url.href
  })

/**
 * 중복 검사용 정규화 (docs/01-spec.md 'URL 정규화 규칙').
 * 호스트 소문자, utm_* 파라미터 제거, 끝 슬래시 제거. 그 밖(스킴, 해시 등)은 그대로 둔다.
 * httpUrl을 통과한 값을 넣는다. 서버가 bookmarks.normalized_url에 저장하는 값과 같다.
 */
export function normalizeUrl(href: string): string {
  const url = new URL(href)
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key)
  }
  const path = url.pathname.replace(/\/+$/, '')
  return `${url.protocol}//${url.host}${path}${url.search}${url.hash}`
}

const title = z
  .string({ invalid_type_error: '제목은 문자열이어야 합니다' })
  .trim()
  .min(1, '제목을 입력하세요')
  .max(100, '제목은 100자 이하여야 합니다')

const groupId = z.string().uuid('그룹 id가 올바르지 않습니다').nullable()

/** 태그: 최대 10개, 각 1~20자. 앞뒤 공백을 자르고 같은 태그는 하나로 합친다 */
const tags = z
  .array(z.string().trim().min(1, '빈 태그는 넣을 수 없습니다').max(20, '태그는 20자 이하여야 합니다'), {
    invalid_type_error: '태그는 배열이어야 합니다'
  })
  .max(10, '태그는 10개까지 넣을 수 있습니다')
  .transform((list) => [...new Set(list)])

/** 아이콘 주소는 https만 (앱 화면에서 그대로 불러오므로 평문 http는 받지 않는다) */
const iconUrl = z
  .string()
  .trim()
  .max(URL_MAX, `아이콘 주소는 ${URL_MAX}자 이하여야 합니다`)
  .refine((v) => {
    try {
      return new URL(v).protocol === 'https:'
    } catch {
      return false
    }
  }, '아이콘 주소는 https여야 합니다')
  .nullable()

/**
 * POST /bookmarks. 제목이 없거나 비어 있으면 서버가 도메인을 제목으로 쓴다.
 * 모르는 필드는 거절한다(예전 allowDuplicate처럼 명세에서 빠진 값을 보내면 바로 드러나게).
 */
export const createBookmarkInput = z
  .object({
    url: httpUrl,
    title: z
      .string({ invalid_type_error: '제목은 문자열이어야 합니다' })
      .trim()
      .max(100, '제목은 100자 이하여야 합니다')
      .optional()
      .transform((v) => v || undefined),
    groupId: groupId.optional(),
    tags: tags.optional(),
    iconUrl: iconUrl.optional()
  })
  .strict()

/** PATCH /bookmarks/:id. 모두 선택이지만 하나는 있어야 한다. 제목을 보내면 비어 있으면 안 된다 */
export const updateBookmarkInput = z
  .object({
    url: httpUrl.optional(),
    title: title.optional(),
    groupId: groupId.optional(),
    tags: tags.optional(),
    iconUrl: iconUrl.optional(),
    isPinned: z.boolean({ invalid_type_error: 'isPinned는 true/false여야 합니다' }).optional()
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), '바꿀 항목이 없습니다')

/** 경로의 :id */
export const bookmarkId = z.string().uuid('북마크 id가 올바르지 않습니다')

export type CreateBookmarkInput = z.infer<typeof createBookmarkInput>
export type UpdateBookmarkInput = z.infer<typeof updateBookmarkInput>

/**
 * API가 돌려주는 북마크 (camelCase, 시간은 ISO 8601 UTC).
 * recentVisits(최근 30일 방문 수)는 SEARCH-04에서 추가한다
 */
export type Bookmark = {
  id: string
  title: string
  url: string
  iconUrl: string | null
  groupId: string | null
  tags: string[]
  isPinned: boolean
  position: number
  /** 어디서 왔나. 앱은 크롬에서 온 것(app_sync·ext_sync)의 삭제를 막는다(docs/01-spec.md '열기와 보조 메뉴 규칙') */
  source: BookmarkSource
  clickCount: number
  lastVisitedAt: string | null
  createdAt: string
}
