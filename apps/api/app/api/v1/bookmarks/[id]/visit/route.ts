// POST /bookmarks/:id/visit (OPEN-02). docs/03-api.md
// uuid가 아니면 404(다른 /bookmarks/:id와 같음). uuid면 없거나 남의 것이어도 204 — 앱은 결과를 쓰지 않는다
import { bookmarkId } from '@baro/shared'
import { withAuth } from '@/lib/auth'
import { recordVisit } from '@/lib/bookmarks'
import { ApiError } from '@/lib/errors'

export const dynamic = 'force-dynamic'

type Params = { id: string }

export const POST = withAuth<Params>(async (_req, { auth, params }) => {
  const parsed = bookmarkId.safeParse((await params).id)
  if (!parsed.success) throw new ApiError('BOOKMARK_NOT_FOUND', '북마크를 찾을 수 없습니다')
  await recordVisit(auth, parsed.data)
  return new Response(null, { status: 204 })
})
