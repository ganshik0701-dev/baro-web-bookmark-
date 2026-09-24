import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ApiFailure, ApiSuccess, AuthStatus, HealthResponse } from '@baro/shared'
// 타입만 가져온다(번들에 메인 코드가 들어가지 않는다)
import type { ChromeProfile } from '../main/chrome-profiles'
import type { BookmarkListResult } from '../main/api-client'
import type { ChromeReadResult, ChromeSelection } from '../main/chrome-selection'
import type { SyncState } from '../main/sync'

// 렌더러에 노출하는 유일한 통로. 여기에 없는 기능은 렌더러에서 쓸 수 없다.
// API는 범용 fetch를 노출하지 않고, 엔드포인트마다 인자가 정해진 함수만 둔다.
const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  // GET /health. 실제 요청은 메인 프로세스가 한다
  getHealth: (): Promise<ApiSuccess<HealthResponse> | ApiFailure> => ipcRenderer.invoke('api:health'),
  // AUTH-01. 시스템 브라우저로 Google 로그인. 끝나면(또는 2분 뒤) 결과가 온다
  login: (): Promise<AuthStatus> => ipcRenderer.invoke('auth:login'),
  getAuthStatus: (): Promise<AuthStatus> => ipcRenderer.invoke('auth:status'),
  // SCR-01. 브라우저 대기 중인 로그인 취소
  cancelLogin: (): Promise<void> => ipcRenderer.invoke('auth:cancelLogin'),
  // AUTH-03. 세션이 없어도 저장된 로그인(파일)이 있으면 지운다
  logout: (): Promise<AuthStatus> => ipcRenderer.invoke('auth:logout'),
  // AUTH-02. 자동 로그인·갱신으로 상태가 바뀌면 불린다. 반환값을 부르면 구독을 끊는다
  onAuthChanged: (fn: (status: AuthStatus) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, status: AuthStatus): void => fn(status)
    ipcRenderer.on('auth:changed', listener)
    return () => ipcRenderer.removeListener('auth:changed', listener)
  },

  // DESK-01·02. 크롬 북마크 읽기라는 좁은 용도만 연다.
  // 읽기 함수에는 인자가 없다. 경로를 받는 함수를 두면 렌더러가 아무 파일이나 읽을 수 있게 된다.
  listChromeProfiles: (): Promise<ChromeProfile[]> => ipcRenderer.invoke('chrome:listProfiles'),
  getChromeSelection: (): Promise<ChromeSelection | null> => ipcRenderer.invoke('chrome:getSelection'),
  // 탐색 목록에 있는 폴더명만 통한다. 그 밖의 문자열은 메인이 거절하고 null을 준다
  selectChromeProfile: (name: string): Promise<ChromeSelection | null> =>
    ipcRenderer.invoke('chrome:selectProfile', name),
  // 파일 선택 창은 메인이 연다. 취소하면 null
  pickChromeBookmarksFile: (): Promise<ChromeReadResult | null> => ipcRenderer.invoke('chrome:pickFile'),
  // 지금 선택된 프로필·파일을 읽는다
  readChromeBookmarks: (): Promise<ChromeReadResult> => ipcRenderer.invoke('chrome:read'),

  // SCR-03. GET /bookmarks. 인자 없음. 실패하면 { error }가 온다(예외를 던지지 않는다)
  listBookmarks: (): Promise<BookmarkListResult> => ipcRenderer.invoke('bookmarks:list'),

  // DESK-03. 렌더러는 '지금 동기화'만 알린다. 삭제 확인 개수(confirmDeleteCount)는 메인이 정한다
  syncNow: (): Promise<SyncState> => ipcRenderer.invoke('sync:now'),
  getSyncState: (): Promise<SyncState> => ipcRenderer.invoke('sync:state'),
  // SCR-02 대량 삭제 모달의 답. 개수는 보내지 않는다(메인이 409에서 받은 값을 쓴다)
  answerMassDelete: (ok: boolean): Promise<void> => ipcRenderer.invoke('sync:confirm', ok),
  // 자동 동기화도 메인에서 일어나므로 상태가 바뀌면 알려 준다
  onSyncChanged: (fn: (state: SyncState) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, state: SyncState): void => fn(state)
    ipcRenderer.on('sync:changed', listener)
    return () => ipcRenderer.removeListener('sync:changed', listener)
  }
}

contextBridge.exposeInMainWorld('baro', api)

export type BaroApi = typeof api
