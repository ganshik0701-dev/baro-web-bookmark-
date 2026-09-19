/// <reference types="vite/client" />
import type { BaroApi } from '../../preload'

declare global {
  interface Window {
    /** preload/index.ts가 contextBridge로 노출한 함수들 */
    baro: BaroApi
  }

  interface ImportMetaEnv {
    /** API 기본 주소(/api/v1 포함). 없으면 http://localhost:3000/api/v1 */
    readonly VITE_API_BASE_URL?: string
  }
}
