// Bookmarks 파일 읽기 + 재시도 (DESK-01, docs/01-spec.md 'Bookmarks 파일 읽기 규칙').
// 메인 프로세스 전용. 크롬 파일은 읽기 전용으로만 다루므로 readFile·stat만 쓴다(쓰기 함수는 import하지 않는다).
import { readFile, stat } from 'node:fs/promises'
import { parseBookmarksJson, type ParseFailReason, type ParsedTree } from './chrome-parse'

/** 50MB. 실제 파일은 북마크 5,000개라도 몇 MB다. 이상한 파일을 통째로 메모리에 올리지 않으려는 방어선 */
export const MAX_FILE_BYTES = 50 * 1024 * 1024
/** 크롬이 저장 중이면 잠깐 뒤에 다시 읽으면 된다 (docs/01-spec.md) */
export const RETRY_DELAY_MS = 1000

export type ReadFailReason = ParseFailReason | 'read_error' | 'too_large'
export type ReadResult =
  | { ok: true; tree: ParsedTree; path: string }
  | { ok: false; reason: ReadFailReason; message: string }

/** 크롬이 저장 중이라 실패했을 수 있는 사유. 한 번만 다시 읽어 본다 */
const RETRYABLE: ReadFailReason[] = ['read_error', 'invalid_json', 'no_roots']

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function readOnce(path: string, now: number, maxBytes: number): Promise<ReadResult> {
  let text: string
  try {
    const info = await stat(path)
    if (info.size > maxBytes) {
      return { ok: false, reason: 'too_large', message: '북마크 파일이 너무 큽니다(50MB 초과)' }
    }
    text = await readFile(path, 'utf8')
  } catch {
    return { ok: false, reason: 'read_error', message: '북마크 파일을 열 수 없습니다' }
  }

  const parsed = parseBookmarksJson(text, now)
  return parsed.ok ? { ok: true, tree: parsed.tree, path } : parsed
}

/**
 * Bookmarks 파일을 읽어 요청 항목으로 바꾼다.
 * 크롬이 저장 중이면 파일이 잘려 있을 수 있어, 그런 사유면 1초 뒤 한 번만 다시 읽는다(반복하지 않는다)
 */
export async function readBookmarksFile(
  path: string,
  options: { retryDelayMs?: number; now?: number; maxBytes?: number } = {}
): Promise<ReadResult> {
  const { retryDelayMs = RETRY_DELAY_MS, now = Date.now(), maxBytes = MAX_FILE_BYTES } = options
  const first = await readOnce(path, now, maxBytes)
  if (first.ok || !RETRYABLE.includes(first.reason)) return first

  await sleep(retryDelayMs)
  return readOnce(path, now, maxBytes)
}
