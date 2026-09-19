import { contextBridge, ipcRenderer } from 'electron'
import type { ApiFailure, ApiSuccess, HealthResponse } from '@baro/shared'

// 렌더러에 노출하는 유일한 통로. 여기에 없는 기능은 렌더러에서 쓸 수 없다.
// API는 범용 fetch를 노출하지 않고, 엔드포인트마다 인자가 정해진 함수만 둔다.
const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  // GET /health. 실제 요청은 메인 프로세스가 한다
  getHealth: (): Promise<ApiSuccess<HealthResponse> | ApiFailure> => ipcRenderer.invoke('api:health')
  // 5주차에 readChromeBookmarks(), listChromeProfiles() 가 여기에 추가된다
}

contextBridge.exposeInMainWorld('baro', api)

export type BaroApi = typeof api
