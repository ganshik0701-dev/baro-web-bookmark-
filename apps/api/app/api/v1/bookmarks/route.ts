// GET /bookmarks (목록), POST /bookmarks (BM-01~03). docs/03-api.md
import { createBookmarkInput } from '@baro/shared'
import { withAuth } from '@/lib/auth'
import { createBookmark, listBookmarks } from '@/lib/bookmarks'
import { ok } from '@/lib/errors'
import { parseBody } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (_req, { auth }) => {
  const data = await listBookmarks(auth)
  return Response.json({ data, meta: { total: data.length } })
})

export const POST = withAuth(async (req, { auth }) => {
  const input = await parseBody(req, createBookmarkInput)
  return ok(await createBookmark(auth, input), { status: 201 })
})
