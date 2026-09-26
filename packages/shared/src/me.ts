// 내 설정 (GET·PATCH /me, docs/03-api.md). 앱 폼과 서버가 같은 스키마를 쓴다.
import { z } from 'zod'

/**
 * 고를 수 있는 정렬 4종(SEARCH-04 드롭다운, PATCH /me). custom은 드래그(SEARCH-06) 때 더한다.
 * DB에 저장될 수 있는 값 전부(custom 포함 5종)는 types.ts의 SORT_OPTIONS
 */
export const SELECTABLE_SORTS = ['created_desc', 'visits_30d', 'visited_desc', 'title_asc'] as const
export type SelectableSort = (typeof SELECTABLE_SORTS)[number]

export const sortOption = z.enum(SELECTABLE_SORTS, {
  errorMap: () => ({ message: `정렬은 ${SELECTABLE_SORTS.join(' / ')} 중 하나여야 합니다` })
})

/** PATCH /me. 지금은 정렬(SEARCH-05) 하나. 열기 방식·테마는 SET-01·02 때 칸을 더한다 */
export const updateMeInput = z
  .object({ sortOption: sortOption.optional() })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), '바꿀 항목이 없습니다')

export type UpdateMeInput = z.infer<typeof updateMeInput>

/** GET·PATCH /me 응답 */
export type Me = {
  id: string
  email: string
  displayName: string | null
  avatarUrl: string | null
  /** DB 값 그대로(custom일 수도 있다). 앱은 모르는 값을 최근 추가순으로 보여준다 */
  sortOption: string
  openMode: string
  theme: string
  autoSync: boolean
  chromeProfile: string | null
  lastSyncedAt: string | null
}
