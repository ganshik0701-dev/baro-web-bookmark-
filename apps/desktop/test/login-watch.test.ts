// DESK-03 자동 동기화·첫 동기화 확인을 언제 다시 하는가 (docs/01-spec.md '자동 동기화')
import { describe, expect, it } from 'vitest'
import { createLoginWatch, type SessionLike } from '../src/main/login-watch'

const signedIn = (email: string | null = 'a@example.com'): SessionLike => ({ session: { email } })
const signedOut: SessionLike = { session: null }

function setup() {
  const calls: string[] = []
  const watch = createLoginWatch({ onLogin: () => calls.push('login'), onLogout: () => calls.push('logout') })
  return { calls, watch }
}

describe('createLoginWatch', () => {
  it('앱을 켜며 저장된 로그인으로 들어오면 한 번(복원 중 로그아웃 상태 알림은 무시)', () => {
    const { calls, watch } = setup()
    watch(signedOut) // 복원 중
    watch(signedIn())
    expect(calls).toEqual(['login'])
  })

  it('같은 세션의 토큰 갱신(같은 계정으로 다시 알림)에서는 다시 돌지 않는다', () => {
    const { calls, watch } = setup()
    watch(signedIn())
    watch(signedIn()) // 갱신 1
    watch(signedIn()) // 갱신 2
    expect(calls).toEqual(['login'])
  })

  it('같은 실행 안에서 로그아웃 → 다시 로그인하면 다시 돈다', () => {
    const { calls, watch } = setup()
    watch(signedIn())
    watch(signedOut)
    watch(signedIn())
    watch(signedIn()) // 재로그인 뒤 갱신은 안 돈다
    expect(calls).toEqual(['login', 'logout', 'login'])
  })

  it('로그아웃 뒤 다른 계정으로 로그인해도 다시 돈다', () => {
    const { calls, watch } = setup()
    watch(signedIn('a@example.com'))
    watch(signedOut)
    watch(signedIn('b@example.com'))
    expect(calls).toEqual(['login', 'logout', 'login'])
  })

  it('로그아웃 없이 계정이 바뀌어도 새 로그인으로 본다', () => {
    const { calls, watch } = setup()
    watch(signedIn('a@example.com'))
    watch(signedIn('b@example.com'))
    expect(calls).toEqual(['login', 'login'])
  })

  it('로그인한 적 없이 로그아웃 알림만 오면 아무것도 하지 않는다', () => {
    const { calls, watch } = setup()
    watch(signedOut)
    watch(signedOut)
    expect(calls).toEqual([])
  })

  it('이메일이 없는 세션도 로그인으로 본다', () => {
    const { calls, watch } = setup()
    watch(signedIn(null))
    watch(signedIn(null))
    expect(calls).toEqual(['login'])
  })
})
