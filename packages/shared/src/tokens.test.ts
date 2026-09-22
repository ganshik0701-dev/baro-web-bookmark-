import { describe, expect, it } from 'vitest'
import { createTokenInput, tokenId } from './tokens'

describe('createTokenInput', () => {
  it('앞뒤 공백을 자른다', () => {
    expect(createTokenInput.parse({ name: '  회사 PC 크롬 ' })).toEqual({ name: '회사 PC 크롬' })
  })

  it.each([
    [{}, '토큰 이름을 입력하세요'],
    [{ name: '   ' }, '토큰 이름을 입력하세요'],
    [{ name: 'a'.repeat(31) }, '토큰 이름은 30자 이하여야 합니다'],
    [{ name: 3 }, '토큰 이름은 문자열이어야 합니다']
  ])('거절: %j', (body, message) => {
    const r = createTokenInput.safeParse(body)
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe(message)
  })

  it('30자까지는 통과, 모르는 필드는 거절', () => {
    expect(createTokenInput.safeParse({ name: '가'.repeat(30) }).success).toBe(true)
    expect(createTokenInput.safeParse({ name: 'x', userId: 'someone' }).success).toBe(false)
  })
})

describe('tokenId', () => {
  it('uuid만', () => {
    expect(tokenId.safeParse('0b6c1f2e-3a4d-4e5f-8a9b-0c1d2e3f4a5b').success).toBe(true)
    expect(tokenId.safeParse('baro_abc').success).toBe(false)
  })
})
