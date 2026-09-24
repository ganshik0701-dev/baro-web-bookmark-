// POST /sync/chrome — 크롬 북마크 동기화 (DESK-03, EXT-02~04, docs/03-api.md).
// 앱 토큰·확장 토큰 모두 받는다. source는 토큰 종류와 맞아야 한다(확장이 앱인 척 기록하지 못하게)
import { SYNC_MAX_BYTES, syncChromeInput } from '@baro/shared'
import { withAuth } from '@/lib/auth'
import { ApiError, ok } from '@/lib/errors'
import { syncChrome } from '@/lib/sync'
import { parseBody } from '@/lib/validation'

export const dynamic = 'force-dynamic'
// 5,000개 동기화도 몇 초면 끝나지만(통합 테스트로 측정) 여유를 둔다
export const maxDuration = 60

export const POST = withAuth(
  async (req, { auth }) => {
    const input = await parseBody(req, syncChromeInput, { maxBytes: SYNC_MAX_BYTES })
    const expected = auth.via === 'apiToken' ? 'extension' : 'app'
    if (input.source !== expected) {
      throw new ApiError('VALIDATION_ERROR', `${auth.via === 'apiToken' ? '확장' : '앱'} 토큰으로 보낼 때 source는 '${expected}'이어야 합니다`)
    }
    return ok(await syncChrome(auth, input))
  },
  { allowApiToken: true, rateBucket: 'sync' }
)
