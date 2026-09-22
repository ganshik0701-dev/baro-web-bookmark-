import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Next.js가 읽는 apps/api/.env를 테스트에서도 읽는다(DB 주소 등). CI에는 이 파일이 없다
if (existsSync('.env')) process.loadEnvFile('.env')
// 동시 요청 테스트용. 운영은 함수 하나당 연결 1개(기본값)
process.env.DB_POOL_MAX = '5'

export default defineConfig({
  // 라우트 파일의 '@/lib/...'를 테스트에서도 풀 수 있게(tsconfig paths와 같게)
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    // 실제 DB에 붙는 테스트라 네트워크 왕복을 감안한다
    testTimeout: 20_000
  }
})
