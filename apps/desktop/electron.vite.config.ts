import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// 개발 서버가 index.html을 보낼 때만 CSP를 넓힌다.
// - connect-src: Vite HMR 웹소켓, 로컬 API
// - script-src 'unsafe-inline': React 핫 리로드가 HTML에 넣는 인라인 스크립트
// apply: 'serve'라서 빌드 때는 실행되지 않고, 설치 파일에는 index.html에 적힌 CSP가 그대로 들어간다.
function devCsp(): Plugin {
  return {
    name: 'baro-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      // index.html의 CSP 모양이 바뀌어 못 찾으면 조용히 넘어가지 말고 바로 알린다
      if (!/connect-src [^;"]*/.test(html)) {
        throw new Error('index.html의 CSP에서 connect-src를 찾지 못했습니다')
      }
      return html.replace(
        /connect-src ([^;"]*)/,
        "connect-src $1 ws://localhost:* http://localhost:*; script-src 'self' 'unsafe-inline'"
      )
    }
  }
}

// @fontsource CSS는 woff2와 woff를 둘 다 가리킨다. Electron(Chromium)은 woff2만 쓰므로
// woff 참조를 지워 쓰지 않는 파일이 번들에 들어가지 않게 한다
function woff2Only(): Plugin {
  return {
    name: 'baro-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]@fontsource[\\/].*\.css$/.test(id)) return null
      return code.replace(/,\s*url\([^)]*\.woff\)\s*format\('woff'\)/g, '')
    }
  }
}

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [woff2Only(), react(), devCsp()] }
})
