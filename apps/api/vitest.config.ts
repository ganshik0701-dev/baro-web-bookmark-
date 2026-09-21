import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// Next.js가 읽는 apps/api/.env를 테스트에서도 읽는다(DB 주소 등). CI에는 이 파일이 없다
if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    // 실제 DB에 붙는 테스트라 네트워크 왕복을 감안한다
    testTimeout: 20_000
  }
})
