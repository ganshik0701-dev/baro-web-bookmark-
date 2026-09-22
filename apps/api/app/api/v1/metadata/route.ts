// GET /metadata?url= — 제목·아이콘 미리 가져오기 (BM-01 보조, docs/03-api.md).
// 인증만 하고 DB는 쓰지 않는다. SSRF 차단은 lib/metadata.ts의 운영 정책(fetchMetadata)이 맡는다
import { httpUrl } from '@baro/shared'
import { withAuth } from '@/lib/auth'
import { ApiError, ok } from '@/lib/errors'
import { fetchMetadata } from '@/lib/metadata'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req) => {
  // POST /bookmarks와 같은 주소 규칙(https:// 자동 부착, http/https만)
  const parsed = httpUrl.safeParse(req.nextUrl.searchParams.get('url') ?? undefined)
  if (!parsed.success) throw new ApiError('INVALID_URL', parsed.error.issues[0]?.message ?? '올바른 주소가 아닙니다')
  return ok(await fetchMetadata(parsed.data))
})
