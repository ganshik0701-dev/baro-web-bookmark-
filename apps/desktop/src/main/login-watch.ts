// DESK-03 자동 동기화·첫 동기화 확인을 언제 다시 할지 정한다(docs/01-spec.md '자동 동기화').
// electron을 쓰지 않는 순수 함수라 단위 테스트로 확인한다.
//
// - 로그인 세션이 새로 생기면(없음 → 있음, 또는 계정이 바뀜) onLogin을 부른다
// - 같은 계정의 토큰 갱신(세션이 있는 채로 만료 시각만 바뀜)에서는 부르지 않는다
// - 세션이 없어지면(로그아웃·갱신 실패로 지움) onLogout을 부르고, 다음 로그인을 새로 본다

/** auth.ts의 AuthStatus에서 여기서 보는 부분만 */
export type SessionLike = { session: { email: string | null } | null }

export function createLoginWatch(handlers: { onLogin: () => void; onLogout?: () => void }): (status: SessionLike) => void {
  // 지금 로그인된 계정. null이면 로그인 안 됨
  let current: string | null = null
  return (status) => {
    // 이메일이 없는 세션도 로그인으로 본다(빈 문자열 키)
    const next = status.session ? (status.session.email ?? '') : null
    if (next === current) return
    const wasSignedIn = current !== null
    current = next
    if (next === null) {
      if (wasSignedIn) handlers.onLogout?.()
      return
    }
    // 없음 → 있음, 또는 로그아웃 없이 계정이 바뀜
    handlers.onLogin()
  }
}
