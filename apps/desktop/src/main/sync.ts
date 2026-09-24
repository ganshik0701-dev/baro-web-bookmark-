// DESK-03: 크롬 북마크를 서버로 보낸다 (docs/01-spec.md '동기화 실행 규칙', docs/03-api.md POST /sync/chrome).
//
// 이 파일은 electron을 import하지 않는다. 파일 읽기·토큰·fetch·확인 대화상자를 전부 인자로 받아서
// 단위 테스트에서 진짜 서버 없이 흐름을 확인할 수 있다(요청이 '나가지 않는' 경우까지).
import type { MassDeleteDetails, SyncChromeInput, SyncChromeResult } from '@baro/shared'
import { authedFetch, type ApiDeps } from './api-client'
import type { ChromeReadResult } from './chrome-selection'

export type SyncPhase = 'idle' | 'syncing' | 'needs_confirm' | 'done' | 'error'

export type SyncState = {
  phase: SyncPhase
  /** 마지막으로 성공한 동기화 결과 */
  lastResult: SyncChromeResult | null
  /** needs_confirm일 때만. 사용자에게 보여 준 삭제 예정 수 */
  confirm: MassDeleteDetails | null
  error: { code: string; message: string } | null
  /** 이번에 읽은 프로필(화면 표시용) */
  profile: { name: string; displayName: string | null } | null
  /**
   * 아직 한 번도 동기화하지 않은 계정인가 (SCR-02를 띄울지 판단).
   * null이면 아직 확인 전. 서버 GET /me의 lastSyncedAt으로 정한다
   */
  firstSync: boolean | null
  /**
   * 서버가 마지막으로 동기화한 시각(ISO). 상태바 표시용(SCR-03).
   * 앱 시작 때 GET /me의 lastSyncedAt, 이후엔 성공한 동기화의 syncedAt. runSync는 이 값을 모른다
   */
  lastSyncedAt: string | null
}

export const initialSyncState: SyncState = {
  phase: 'idle',
  lastResult: null,
  confirm: null,
  error: null,
  profile: null,
  firstSync: null,
  lastSyncedAt: null
}

/** 토큰·fetch·주소(ApiDeps)에 파일 읽기와 확인 함수를 더한 것 */
export type SyncDeps = ApiDeps & {
  /** 지금 선택된 프로필·파일을 읽는다 */
  readBookmarks: () => Promise<ChromeReadResult>
  /** 대량 삭제 확인. 사용자가 확인하면 true */
  confirmMassDelete: (details: MassDeleteDetails) => Promise<boolean>
  /** 북마크가 0개일 때 확인(수동 동기화에서만 불린다) */
  confirmSuspicious: () => Promise<boolean>
}

export type SyncTrigger = 'startup' | 'manual'

type ApiError = { error: { code: string; message: string; details?: unknown } }

/** 사람이 읽을 메시지. 서버 메시지를 그대로 쓰되 없으면 코드로 */
const failure = (code: string, message: string): SyncState => ({
  ...initialSyncState,
  phase: 'error',
  error: { code, message }
})

/** 파싱 실패 사유 → 안내 문구 */
const READ_FAIL_MESSAGE: Record<string, string> = {
  no_selection: '읽을 크롬 프로필을 찾지 못했습니다. 프로필을 고르거나 Bookmarks 파일을 직접 선택하세요',
  read_error: '크롬 북마크 파일을 열 수 없습니다. 크롬이 실행 중이면 잠시 뒤 다시 시도하세요',
  invalid_json: '크롬 북마크 파일을 읽을 수 없습니다(저장 중일 수 있습니다)',
  no_roots: '크롬 북마크 파일 형식이 아닙니다',
  bad_root: '크롬 북마크 파일 구조가 올바르지 않습니다',
  too_large: '크롬 북마크 파일이 너무 큽니다'
}

/**
 * 동기화 한 번. 상태를 돌려주고, 중간에 확인이 필요하면 deps의 확인 함수를 부른다.
 * 서버가 409를 주면 확인 → 같은 요청에 confirmDeleteCount만 붙여 재전송한다(파일을 다시 읽지 않는다).
 * confirmDeleteCount는 서버가 알려 준 값을 여기서 붙인다(렌더러가 정하지 않는다)
 */
export async function runSync(deps: SyncDeps, trigger: SyncTrigger): Promise<SyncState> {
  // ① 파일 읽기 — 실패하면 아무것도 보내지 않는다
  const read = await deps.readBookmarks()
  if (!read.ok) {
    return failure(read.reason, READ_FAIL_MESSAGE[read.reason] ?? '크롬 북마크를 읽지 못했습니다')
  }

  const profile =
    read.selection.kind === 'profile'
      ? { name: read.selection.name, displayName: read.selection.displayName }
      : { name: '직접 선택한 파일', displayName: null }

  // ② 북마크가 0개면 full이 서버 북마크를 전부 지울 수 있다. 자동은 보내지 않고, 수동은 확인받는다
  if (read.tree.suspicious) {
    if (trigger === 'startup') {
      return {
        ...failure('SUSPICIOUS_EMPTY', '크롬에서 북마크를 찾지 못했습니다. 프로필이 맞는지 확인하세요'),
        profile
      }
    }
    if (!(await deps.confirmSuspicious())) {
      return { ...initialSyncState, phase: 'idle', profile }
    }
  }

  // ③ 요청 본문. 이 스냅샷을 그대로 들고 있다가 409 확인 뒤에도 같은 것을 보낸다
  const body: SyncChromeInput = {
    mode: 'full',
    source: 'app',
    profile: read.selection.kind === 'profile' ? read.selection.name : null,
    folders: read.tree.folders,
    bookmarks: read.tree.bookmarks,
    deletedChromeIds: []
  }

  const first = await send(deps, body)
  if (first.kind === 'ok') {
    return { ...initialSyncState, phase: 'done', lastResult: first.result, profile }
  }
  if (first.kind === 'error') return { ...failure(first.code, first.message), profile }

  // ④ 409. 아무것도 반영되지 않았다. 사용자에게 묻고, 확인하면 같은 요청에 숫자만 붙인다
  let details = first.details
  // 확인하는 사이 삭제 대상이 늘면 서버가 다시 409를 준다. 자동으로 반복하지 않고 그때마다 다시 묻는다
  for (;;) {
    if (!(await deps.confirmMassDelete(details))) {
      // 취소: 아무 요청도 보내지 않는다. 다음 동기화에서 다시 묻는다
      return { ...initialSyncState, phase: 'idle', profile }
    }
    const again = await send(deps, { ...body, confirmDeleteCount: details.deleteCount })
    if (again.kind === 'ok') {
      return { ...initialSyncState, phase: 'done', lastResult: again.result, profile }
    }
    if (again.kind === 'error') return { ...failure(again.code, again.message), profile }
    details = again.details
  }
}

type SendResult =
  | { kind: 'ok'; result: SyncChromeResult }
  | { kind: 'confirm'; details: MassDeleteDetails }
  | { kind: 'error'; code: string; message: string }

/**
 * POST /sync/chrome 한 번. 401이면 갱신 후 1회만 다시 보낸다(authedFetch).
 * 그 밖의 오류는 재시도하지 않는다(본문이 최대 2MB라 함부로 다시 보내지 않는다)
 */
async function send(deps: SyncDeps, body: SyncChromeInput): Promise<SendResult> {
  const r = await authedFetch(deps, '/sync/chrome', { method: 'POST', body: JSON.stringify(body), timeoutMs: 60_000 })
  if (r.kind === 'error') return r
  const { res } = r

  const parsed = (await res.json().catch(() => null)) as { data?: SyncChromeResult } | ApiError | null

  if (res.ok && parsed && 'data' in parsed && parsed.data) return { kind: 'ok', result: parsed.data }

  const err = parsed && 'error' in parsed ? parsed.error : null
  if (res.status === 409 && err?.code === 'MASS_DELETE_CONFIRM_REQUIRED') {
    const details = err.details as MassDeleteDetails | undefined
    if (details && typeof details.deleteCount === 'number') {
      return { kind: 'confirm', details: { ...details, preview: details.preview ?? [] } }
    }
  }
  return {
    kind: 'error',
    code: err?.code ?? `HTTP_${res.status}`,
    message: err?.message ?? `서버가 ${res.status}로 응답했습니다`
  }
}
