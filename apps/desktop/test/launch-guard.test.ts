// 설치본 실행 스위치 검사 (CLAUDE.md 'Electron 보안')
import { describe, expect, it } from 'vitest'
import { findForbiddenSwitch } from '../src/main/launch-guard'

const exe = 'baro.exe'

describe('findForbiddenSwitch', () => {
  it('평범한 실행(인자 없음)은 통과', () => {
    expect(findForbiddenSwitch([exe])).toBeNull()
  })

  it('디버깅 포트는 값 유무와 상관없이 막는다', () => {
    expect(findForbiddenSwitch([exe, '--remote-debugging-port=9222'])).toBe('remote-debugging-port')
    expect(findForbiddenSwitch([exe, '--remote-debugging-port', '9222'])).toBe('remote-debugging-port')
    expect(findForbiddenSwitch([exe, '--remote-debugging-pipe'])).toBe('remote-debugging-pipe')
  })

  it('Node 검사기 계열을 막는다', () => {
    expect(findForbiddenSwitch([exe, '--inspect'])).toBe('inspect')
    expect(findForbiddenSwitch([exe, '--inspect=9229'])).toBe('inspect')
    expect(findForbiddenSwitch([exe, '--inspect-brk=0'])).toBe('inspect-brk')
    expect(findForbiddenSwitch([exe, '--js-flags=--expose-gc'])).toBe('js-flags')
  })

  it('대시 하나·대문자로 써도 막는다(Windows Chromium이 그렇게 받아들인다)', () => {
    expect(findForbiddenSwitch([exe, '-remote-debugging-port=9222'])).toBe('remote-debugging-port')
    expect(findForbiddenSwitch([exe, '--REMOTE-DEBUGGING-PORT=9222'])).toBe('remote-debugging-port')
  })

  it('이름이 비슷하기만 한 스위치와 일반 인자는 통과', () => {
    expect(findForbiddenSwitch([exe, '--remote-debugging-portx=1', '--inspector', 'inspect', '--lang=ko'])).toBeNull()
  })
})
