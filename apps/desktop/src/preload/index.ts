import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ApiFailure, ApiSuccess, AuthStatus, HealthResponse } from '@baro/shared'

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
  }
  // 5주차에 readChromeBookmarks(), listChromeProfiles() 가 여기에 추가된다
}

contextBridge.exposeInMainWorld('baro', api)

export type BaroApi = typeof api
