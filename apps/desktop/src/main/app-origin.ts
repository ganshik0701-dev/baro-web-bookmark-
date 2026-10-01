// 앱 자신의 페이지인지 가리는 공통 검사 (CLAUDE.md 'Electron 보안').
// preload는 창에 불러온 페이지라면 어디든 window.baro(토큰 발급 등)를 연다. 그래서
//   1) 창이 다른 주소로 넘어가지 않게 막고(will-navigate·will-redirect)
//   2) IPC는 보낸 프레임이 앱 페이지일 때만 처리하고
//   3) 권한 요청도 앱 페이지에서 온 것만 따진다.
// electron을 쓰지 않는 순수 함수라 단위 테스트로 확인한다(test/app-origin.test.ts).

/** 앱 페이지가 어디서 오는가. 설치본·빌드 실행은 파일 하나, 개발 실행은 Vite 개발 서버 */
export type AppLocation = { kind: 'file'; fileUrl: string } | { kind: 'dev'; origin: string }

/**
 * 개발 서버 주소가 있으면 그 origin, 없으면 렌더러 파일.
 * devServerUrl은 창에 loadURL하는 값과 같은 것을 넘긴다(설치본에서는 undefined)
 */
export function appLocation(opts: { devServerUrl?: string; rendererFileUrl: string }): AppLocation {
  if (opts.devServerUrl) return { kind: 'dev', origin: new URL(opts.devServerUrl).origin }
  return { kind: 'file', fileUrl: withoutQueryAndHash(opts.rendererFileUrl) }
}

/**
 * url이 앱 페이지인가.
 * - 파일: 렌더러 index.html 그 파일만(같은 폴더의 다른 파일도 아니다). 쿼리·해시는 보지 않는다.
 *   Windows 경로는 대소문자를 가리지 않으므로 소문자로 비교한다
 * - 개발: 개발 서버와 origin(스킴·호스트·포트)이 같으면 통과(Vite가 같은 서버에서 모듈을 내준다)
 */
export function isAppUrl(url: string | null | undefined, loc: AppLocation): boolean {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (loc.kind === 'dev') return parsed.origin === loc.origin
  if (parsed.protocol !== 'file:') return false
  return withoutQueryAndHash(parsed.href).toLowerCase() === loc.fileUrl.toLowerCase()
}

function withoutQueryAndHash(href: string): string {
  const u = new URL(href)
  u.search = ''
  u.hash = ''
  return u.href
}

/** IPC 이벤트에서 쓰는 부분만(테스트에서 가짜로 만들 수 있게) */
export type IpcEventLike = { senderFrame: { url: string } | null }

/**
 * IPC 처리기를 감싼다. 보낸 프레임이 앱 페이지가 아니면 처리하지 않고 거절한다(렌더러에는 오류로 간다).
 * 프레임이 이미 사라진 요청(senderFrame null)도 거절한다
 */
export function guardIpcHandler<E extends IpcEventLike, A extends unknown[], R>(
  channel: string,
  loc: AppLocation,
  handler: (event: E, ...args: A) => R
): (event: E, ...args: A) => R {
  return (event, ...args) => {
    if (!isAppUrl(event.senderFrame?.url, loc)) {
      throw new Error(`허용하지 않는 페이지에서 온 요청입니다(${channel})`)
    }
    return handler(event, ...args)
  }
}

/** 권한 요청: 앱 페이지의 클립보드 쓰기(확장 토큰 복사)만 허용하고 나머지는 모두 거절한다 */
export function isAllowedPermission(permission: string, requestingUrl: string | null | undefined, loc: AppLocation): boolean {
  return permission === 'clipboard-sanitized-write' && isAppUrl(requestingUrl, loc)
}
