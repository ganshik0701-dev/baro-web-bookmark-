// 확장 API 토큰 (EXT-01, docs/03-api.md '/tokens').
// API가 요청 바디를 검증할 때와 앱 설정 화면이 폼을 검증할 때 같은 스키마를 쓴다.
import { z } from 'zod'

/** POST /tokens. 이름은 앞뒤 공백을 자르고 1~30자. 모르는 필드는 거절한다 */
export const createTokenInput = z
  .object({
    name: z
      .string({ required_error: '토큰 이름을 입력하세요', invalid_type_error: '토큰 이름은 문자열이어야 합니다' })
      .trim()
      .min(1, '토큰 이름을 입력하세요')
      .max(30, '토큰 이름은 30자 이하여야 합니다')
  })
  .strict()

/** 경로의 :id */
export const tokenId = z.string().uuid('토큰 id가 올바르지 않습니다')

export type CreateTokenInput = z.infer<typeof createTokenInput>

/** GET /tokens 항목. 해시·원본은 없다 */
export type ApiToken = {
  id: string
  name: string
  /** 앞 8자(예: baro_ab1). 목록에서 어느 토큰인지 알아보는 용도 */
  prefix: string
  lastUsedAt: string | null
  createdAt: string
}

/** POST /tokens 응답. token(원본)은 이 응답에서 한 번만 온다 */
export type IssuedApiToken = ApiToken & { token: string }
