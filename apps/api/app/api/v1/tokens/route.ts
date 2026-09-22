// GET /tokens (목록), POST /tokens (발급). EXT-01, docs/03-api.md
// 앱 토큰으로만 부른다(withAuth 기본값). 확장 토큰으로 토큰을 만들 수 없다
import { createTokenInput } from '@baro/shared'
import { createToken, listTokens } from '@/lib/api-tokens'
import { withAuth } from '@/lib/auth'
import { ok } from '@/lib/errors'
import { parseBody } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (_req, { auth }) => {
  const data = await listTokens(auth)
  return Response.json({ data, meta: { total: data.length } })
})

export const POST = withAuth(async (req, { auth }) => {
  const input = await parseBody(req, createTokenInput)
  // 원본 토큰이 담긴 응답이라 어디에도 캐시되지 않게 한다
  return ok(await createToken(auth, input), { status: 201, headers: { 'cache-control': 'no-store' } })
})
