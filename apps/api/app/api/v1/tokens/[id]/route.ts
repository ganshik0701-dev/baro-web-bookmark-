// DELETE /tokens/:id (폐기). EXT-01, docs/03-api.md
// id가 uuid가 아니어도 404. 남의 토큰과 똑같이 '없음'으로 보인다
import { tokenId } from '@baro/shared'
import { deleteToken } from '@/lib/api-tokens'
import { withAuth } from '@/lib/auth'
import { ApiError } from '@/lib/errors'

export const dynamic = 'force-dynamic'

export const DELETE = withAuth<{ id: string }>(async (_req, { auth, params }) => {
  const parsed = tokenId.safeParse((await params).id)
  if (!parsed.success) throw new ApiError('TOKEN_NOT_FOUND', '토큰을 찾을 수 없습니다')
  await deleteToken(auth, parsed.data)
  return new Response(null, { status: 204 })
})
