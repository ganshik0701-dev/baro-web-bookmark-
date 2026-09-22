// 확장 빌드: src → dist (크롬 '압축해제된 확장 프로그램 로드'로 dist 폴더를 연다).
//   node build.mjs        운영 API(https://baro-web-bookmark-api.vercel.app)
//   node build.mjs --dev  로컬 개발 서버(http://localhost:3000)
// 두 주소 모두 manifest host_permissions에 있다. 그 밖의 주소는 권한이 없어 요청할 수 없다
import { build } from 'esbuild'
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'

const dev = process.argv.includes('--dev')
const apiBase = dev ? 'http://localhost:3000/api/v1' : 'https://baro-web-bookmark-api.vercel.app/api/v1'

rmSync('dist', { recursive: true, force: true })
mkdirSync('dist')
await build({
  entryPoints: { background: 'src/background.ts', popup: 'src/popup.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: 'chrome116',
  // 어느 서버에 붙는 빌드인지 코드에 박는다(팝업에도 표시)
  define: { __API_BASE__: JSON.stringify(apiBase) },
  logLevel: 'warning'
})
for (const f of ['manifest.json', 'src/popup.html']) copyFileSync(f, `dist/${f.split('/').pop()}`)
console.log(`dist/ 빌드 완료 (API: ${apiBase})`)
