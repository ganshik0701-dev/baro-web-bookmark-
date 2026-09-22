import { NextResponse } from 'next/server'

// docs/03-api.md 의 에러 코드 표와 1:1로 맞춘다. 새 코드는 문서에 먼저 추가할 것.
export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  INVALID_URL: 400,
  INVALID_IMPORT_FILE: 400,
  UNAUTHORIZED: 401,
  INVALID_TOKEN: 401,
  FORBIDDEN: 403,
  BOOKMARK_NOT_FOUND: 404,
  GROUP_NOT_FOUND: 404,
  TOKEN_NOT_FOUND: 404,
  DUPLICATE_URL: 409,
  DUPLICATE_GROUP_NAME: 409,
  TOKEN_LIMIT_EXCEEDED: 409,
  PAYLOAD_TOO_LARGE: 413,
  METADATA_FETCH_FAILED: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500
} as const

export type ErrorCode = keyof typeof ERROR_CODES

/**
 * 처리 중에 던지는 API 오류. withAuth가 받아서 { error: { code, message, details } } 응답으로 바꾼다.
 * withUserDb 안에서 던지면 트랜잭션도 롤백된다
 */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown
  ) {
    super(message)
  }
}

export function fail(code: ErrorCode, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status: ERROR_CODES[code] })
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init)
}
