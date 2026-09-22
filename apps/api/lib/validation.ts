// 요청 바디 검증. 스키마는 packages/shared의 Zod 스키마를 그대로 쓴다(앱 폼과 같은 규칙).
import type { ZodError, ZodTypeAny, z } from 'zod'
import { ApiError } from './errors'

/**
 * JSON 바디를 읽어 스키마로 검증한다. 실패하면 ApiError(400)를 던진다.
 * maxBytes를 주면 넘을 때 413(Content-Length를 먼저 보고, 실제로 읽은 크기로도 다시 확인)
 */
export async function parseBody<S extends ZodTypeAny>(
  req: Request,
  schema: S,
  options: { maxBytes?: number } = {}
): Promise<z.infer<S>> {
  const { maxBytes } = options
  const tooLarge = () =>
    new ApiError('PAYLOAD_TOO_LARGE', `요청 바디는 ${Math.floor((maxBytes ?? 0) / 1024 / 1024)}MB까지입니다`)
  if (maxBytes !== undefined && Number(req.headers.get('content-length') ?? 0) > maxBytes) throw tooLarge()
  const text = await req.text()
  if (maxBytes !== undefined && Buffer.byteLength(text) > maxBytes) throw tooLarge()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new ApiError('VALIDATION_ERROR', '요청 바디가 JSON이 아닙니다')
  }
  const result = schema.safeParse(body)
  if (!result.success) throw toApiError(result.error)
  return result.data
}

// url 필드 오류는 INVALID_URL, 나머지는 VALIDATION_ERROR (docs/03-api.md 에러 코드).
// details에는 어느 필드가 왜 틀렸는지만 싣는다
function toApiError(error: ZodError): ApiError {
  const issues = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
  const urlIssue = issues.find((i) => i.path === 'url')
  if (urlIssue) return new ApiError('INVALID_URL', urlIssue.message, { issues })
  return new ApiError('VALIDATION_ERROR', issues[0]?.message ?? '입력이 올바르지 않습니다', { issues })
}
