// 앱 페이지 검사: 창 이동 막기·IPC 보낸 쪽 확인·권한 요청 (CLAUDE.md 'Electron 보안')
import { describe, expect, it } from 'vitest'
import { appLocation, guardIpcHandler, isAllowedPermission, isAppUrl } from '../src/main/app-origin'

const FILE = 'file:///C:/Users/u/AppData/Local/Programs/baro/resources/app.asar/out/renderer/index.html'
const packaged = appLocation({ rendererFileUrl: FILE })
const dev = appLocation({ devServerUrl: 'http://localhost:5173/', rendererFileUrl: FILE })

describe('isAppUrl — 설치본·빌드 실행(파일)', () => {
  it('렌더러 index.html 그 파일은 통과(쿼리·해시 무시, 대소문자 무시)', () => {
    expect(isAppUrl(FILE, packaged)).toBe(true)
    expect(isAppUrl(`${FILE}#/settings`, packaged)).toBe(true)
    expect(isAppUrl(`${FILE}?x=1`, packaged)).toBe(true)
    expect(isAppUrl(FILE.replace('C:/Users', 'c:/users'), packaged)).toBe(true)
  })

  it('다른 파일·다른 스킴·외부 주소는 막는다', () => {
    expect(isAppUrl(FILE.replace('index.html', 'other.html'), packaged)).toBe(false)
    expect(isAppUrl('file:///C:/Users/u/Downloads/evil.html', packaged)).toBe(false)
    expect(isAppUrl('http://127.0.0.1:9555/navigated', packaged)).toBe(false)
    expect(isAppUrl('https://example.com/', packaged)).toBe(false)
    expect(isAppUrl('http://localhost:5173/', packaged)).toBe(false)
    expect(isAppUrl('about:blank', packaged)).toBe(false)
    expect(isAppUrl('data:text/html,<p>x</p>', packaged)).toBe(false)
  })

  it('비었거나 주소가 아니면 막는다', () => {
    expect(isAppUrl('', packaged)).toBe(false)
    expect(isAppUrl(null, packaged)).toBe(false)
    expect(isAppUrl(undefined, packaged)).toBe(false)
    expect(isAppUrl('not a url', packaged)).toBe(false)
  })
})

describe('isAppUrl — 개발 실행(개발 서버)', () => {
  it('개발 서버와 같은 origin은 통과(경로·HMR 이동 포함)', () => {
    expect(isAppUrl('http://localhost:5173/', dev)).toBe(true)
    expect(isAppUrl('http://localhost:5173/index.html#/x', dev)).toBe(true)
  })

  it('포트·호스트·스킴이 다르거나 렌더러 파일이면 막는다', () => {
    expect(isAppUrl('http://localhost:5174/', dev)).toBe(false)
    expect(isAppUrl('http://127.0.0.1:5173/', dev)).toBe(false)
    expect(isAppUrl('https://localhost:5173/', dev)).toBe(false)
    expect(isAppUrl(FILE, dev)).toBe(false)
  })
})

describe('guardIpcHandler', () => {
  const handler = guardIpcHandler('test:echo', packaged, (_event: { senderFrame: { url: string } | null }, a: number, b: number) => a + b)

  it('앱 페이지에서 온 요청은 인자를 그대로 넘겨 처리한다', () => {
    expect(handler({ senderFrame: { url: `${FILE}#/home` } }, 2, 3)).toBe(5)
  })

  it('다른 페이지·프레임 없음은 처리하지 않고 거절한다', () => {
    expect(() => handler({ senderFrame: { url: 'http://127.0.0.1:9555/navigated' } }, 2, 3)).toThrow('test:echo')
    expect(() => handler({ senderFrame: null }, 2, 3)).toThrow('허용하지 않는 페이지')
  })

  it('거절할 때 처리기를 부르지 않는다', () => {
    let called = 0
    const h = guardIpcHandler('test:count', packaged, (_e: { senderFrame: { url: string } | null }) => ++called)
    expect(() => h({ senderFrame: { url: 'https://example.com/' } })).toThrow()
    expect(called).toBe(0)
  })
})

describe('isAllowedPermission', () => {
  it('앱 페이지의 클립보드 쓰기만 허용', () => {
    expect(isAllowedPermission('clipboard-sanitized-write', FILE, packaged)).toBe(true)
    expect(isAllowedPermission('clipboard-sanitized-write', 'https://example.com/', packaged)).toBe(false)
    expect(isAllowedPermission('clipboard-sanitized-write', undefined, packaged)).toBe(false)
  })

  it('그 밖의 권한은 앱 페이지여도 거절', () => {
    for (const p of ['media', 'notifications', 'geolocation', 'clipboard-read', 'openExternal', 'fullscreen']) {
      expect(isAllowedPermission(p, FILE, packaged), p).toBe(false)
    }
  })
})
