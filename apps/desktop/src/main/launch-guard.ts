// 설치본(app.isPackaged)에서 막을 실행 스위치를 찾는다(CLAUDE.md 'Electron 보안').
// 디버깅 포트나 Node 검사기가 열리면 렌더러·메인에 접속해 토큰과 IPC를 그대로 쓸 수 있다.
// electron을 쓰지 않는 순수 함수라 단위 테스트로 확인한다. Node 쪽 통로(ELECTRON_RUN_AS_NODE 등)는
// 빌드 뒤 Electron Fuses로 막는다(build/after-pack.cjs).

/** 설치본에서 받지 않는 스위치 이름. `--x`와 `--x=값` 둘 다 막는다 */
export const FORBIDDEN_SWITCHES = [
  'remote-debugging-port',
  'remote-debugging-pipe',
  'remote-debugging-address',
  'remote-allow-origins',
  'inspect',
  'inspect-brk',
  'inspect-port',
  'inspect-publish-uid',
  'js-flags'
] as const

/**
 * 금지된 스위치가 있으면 그 이름(소문자), 없으면 null.
 * Windows의 Chromium은 `-`·`--` 둘 다 받고 스위치 이름의 대소문자를 가리지 않으므로 여기서도 같게 본다.
 * `--` 뒤의 인자는 Chromium이 스위치로 보지 않지만, 넓게 막아도 정상 실행에는 지장이 없어 그대로 검사한다
 */
export function findForbiddenSwitch(argv: readonly string[]): string | null {
  for (const arg of argv) {
    const m = /^--?([a-z0-9-]+)(=.*)?$/i.exec(arg)
    if (!m) continue
    const name = m[1].toLowerCase()
    if ((FORBIDDEN_SWITCHES as readonly string[]).includes(name)) return name
  }
  return null
}
