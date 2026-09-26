// PATCH /me 입력 (SEARCH-05)
import { describe, expect, it } from 'vitest'
import { updateMeInput } from './me'

describe('updateMeInput', () => {
  it.each(['created_desc', 'visits_30d', 'visited_desc', 'title_asc'])('정렬 %s는 받는다', (v) => {
    expect(updateMeInput.parse({ sortOption: v })).toEqual({ sortOption: v })
  })

  it.each<[unknown, string]>([
    [{ sortOption: 'custom' }, 'custom은 SEARCH-06 때'],
    [{ sortOption: 'CREATED_DESC' }, '대소문자 다름'],
    [{ sortOption: 1 }, '문자열 아님'],
    [{}, '빈 본문'],
    [{ sortOption: 'title_asc', theme: 'dark' }, '아직 받지 않는 칸']
  ])('거절: %j (%s)', (input) => {
    expect(updateMeInput.safeParse(input).success).toBe(false)
  })
})
