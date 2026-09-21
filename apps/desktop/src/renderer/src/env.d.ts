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
    /** Supabase 프로젝트 주소. 메인 프로세스가 로그인(AUTH-01)에 쓴다 */
    readonly VITE_SUPABASE_URL?: string
    /** Supabase anon 키(공개값). Auth 요청의 apikey 헤더 */
    readonly VITE_SUPABASE_ANON_KEY?: string
  }
}
