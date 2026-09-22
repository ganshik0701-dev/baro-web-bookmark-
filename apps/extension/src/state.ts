// chrome.storage.local에 두는 값과 팝업 ↔ 서비스 워커 메시지 (docs/01-spec.md '확장 동작 규칙').
// 팝업은 PUBLIC_KEYS만 읽는다. 토큰 원본(TOKEN_KEY)은 서비스 워커만 읽는다.
import type { MassDeletePreview, SyncChromeResult } from '@baro/shared'

export const TOKEN_KEY = 'token'
export const STATUS_KEY = 'status'
export const CONNECTION_KEY = 'connection'
export const FULL_NEEDED_KEY = 'fullNeeded'
export const REALTIME_KEY = 'realtime'
export const QUEUE_KEY = 'queue'
export const IMPORTING_KEY = 'importing'

/** 팝업이 읽어도 되는 키(토큰 원본 없음) */
export const PUBLIC_KEYS = [STATUS_KEY, CONNECTION_KEY, FULL_NEEDED_KEY, REALTIME_KEY] as const

export type ErrorCode = 'no_token' | 'token_invalid' | 'network' | 'too_large' | 'too_many' | 'server' | 'interrupted'

/** 전체 동기화 상태. 팝업을 닫았다 열어도 이 값으로 복원한다 */
export type SyncStatus =
  | { state: 'idle'; updatedAt: string }
  | { state: 'syncing'; updatedAt: string }
  | {
      state: 'needs_confirm'
      deleteCount: number
      syncedTotal: number
      preview: MassDeletePreview[]
      filtered: number
      updatedAt: string
    }
  | { state: 'done'; result: SyncChromeResult; filtered: number; updatedAt: string }
  | { state: 'error'; code: ErrorCode; message: string; updatedAt: string }

export type Connection = {
  state: 'no_token' | 'checking' | 'connected' | 'token_invalid' | 'network' | 'server_error'
  /** 저장한 토큰의 끝 4자리(원본은 팝업에 넘기지 않는다) */
  tokenHint?: string
  email?: string
  checkedAt?: string
}

/** 마지막 실시간(partial) 전송 결과 */
export type Realtime = { at: string; ok: boolean; message: string }

export type Message =
  | { type: 'token:save'; token: string }
  | { type: 'token:clear' }
  | { type: 'connection:check' }
  | { type: 'sync:full' }
  | { type: 'sync:confirm' }
  | { type: 'sync:cancel' }

export type Reply = { ok: true } | { ok: false; message: string }
