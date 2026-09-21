// GET·PATCH·DELETE /bookmarks/:id (BM-04·05). docs/03-api.md
// id가 uuid가 아니어도 400이 아니라 404로 답한다. 남의 북마크와 똑같이 '없음'으로 보인다
import { bookmarkId, updateBookmarkInput } from '@baro/shared'
import { withAuth } from '@/lib/auth'
import { deleteBookmark, getBookmark, updateBookmark } from '@/lib/bookmarks'
import { ApiError, ok } from '@/lib/errors'
import { parseBody } from '@/lib/validation'

export const dynamic = 'force-dynamic'

type Params = { id: string }

async function idFrom(params: Promise<Params>): Promise<string> {
  const parsed = bookmarkId.safeParse((await params).id)
  if (!parsed.success) throw new ApiError('BOOKMARK_NOT_FOUND', '북마크를 찾을 수 없습니다')
  return parsed.data
}

export const GET = withAuth<Params>(async (_req, { auth, params }) => {
  return ok(await getBookmark(auth, await idFrom(params)))
})

export const PATCH = withAuth<Params>(async (req, { auth, params }) => {
  const id = await idFrom(params)
  const input = await parseBody(req, updateBookmarkInput)
  return ok(await updateBookmark(auth, id, input))
})

export const DELETE = withAuth<Params>(async (_req, { auth, params }) => {
  await deleteBookmark(auth, await idFrom(params))
  return new Response(null, { status: 204 })
})
