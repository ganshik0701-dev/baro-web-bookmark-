// GET /me — 내 프로필·설정, PATCH /me — 설정 변경(SEARCH-05) (docs/03-api.md).
// 인증(withAuth) → 사용자 권한 트랜잭션(withUserDb) → RLS + user_id 조건 (lib/me.ts)
import { updateMeInput } from '@baro/shared'
import { withAuth } from '@/lib/auth'
import { fail, ok } from '@/lib/errors'
import { getMe, updateMe } from '@/lib/me'
import { parseBody } from '@/lib/validation'

export const dynamic = 'force-dynamic'

// 확장 토큰도 받는다: 확장 팝업이 연결 상태를 확인할 때 부른다(EXT-P)
export const GET = withAuth(async (_req, { auth }) => {
  const me = await getMe(auth)
  if (!me) return fail('INVALID_TOKEN', '가입이 끝나지 않은 계정입니다')
  return ok(me)
}, { allowApiToken: true })

// 앱 토큰만: 확장은 설정을 바꾸지 않는다
export const PATCH = withAuth(async (req, { auth }) => {
  const input = await parseBody(req, updateMeInput)
  const me = await updateMe(auth, input)
  if (!me) return fail('INVALID_TOKEN', '가입이 끝나지 않은 계정입니다')
  return ok(me)
})
