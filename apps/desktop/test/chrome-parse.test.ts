// Bookmarks 파일 → 요청 항목 (DESK-01, docs/01-spec.md 'Bookmarks 파일 읽기 규칙').
//
// 앞부분은 확장(apps/extension/test/tree.test.ts)과 '같은 샘플 파일, 같은 기대값'이다.
// 앱은 파일을, 확장은 chrome.bookmarks API를 읽지만 서버로 가는 요청은 같아야 하므로 숫자를 맞춰 둔다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { syncChromeInput } from '@baro/shared'
import { describe, expect, it } from 'vitest'
import { parseBookmarksJson, toAddedAt } from '../src/main/chrome-parse'

const fixture = readFileSync(join(__dirname, '../../api/test/fixtures/chrome-bookmarks.json'), 'utf8')

/** 성공을 전제로 tree를 꺼낸다(실패면 테스트를 여기서 끝낸다) */
function parse(text: string, now?: number) {
  const r = parseBookmarksJson(text, now)
  if (!r.ok) throw new Error(`파싱이 실패했다: ${r.reason} ${r.message}`)
  return r.tree
}

describe('parseBookmarksJson (크롬 샘플 파일)', () => {
  const tree = parse(fixture)

  it('최상위 폴더(1·2·3)는 folders에 없다. 그 아래 폴더는 모두 있다', () => {
    expect(tree.folders.map((f) => f.chromeId)).toEqual(['7', '9', '11', '17', '20'])
    expect(tree.folders.find((f) => f.chromeId === '7')).toEqual({ chromeId: '7', parentChromeId: '1', title: '개발' })
    expect(tree.folders.find((f) => f.chromeId === '11')!.parentChromeId).toBe('9')
  })

  it('최상위 폴더 바로 아래 북마크의 parentChromeId는 최상위 폴더 id(서버가 미분류로 둔다)', () => {
    expect(tree.bookmarks.find((b) => b.chromeId === '6')!.parentChromeId).toBe('1')
    expect(tree.bookmarks.find((b) => b.chromeId === '22')!.parentChromeId).toBe('2')
  })

  it('javascript:·chrome:// 는 보내지 않고 개수만 센다(13개 중 2개)', () => {
    expect(tree.filtered).toBe(2)
    expect(tree.bookmarks).toHaveLength(11)
    expect(tree.bookmarks.some((b) => /^(javascript|chrome):/.test(b.url))).toBe(false)
  })

  it('date_added → addedAt(ISO). 같은 URL 중복은 서버가 정리하므로 그대로 보낸다', () => {
    expect(tree.bookmarks.find((b) => b.chromeId === '5')!.addedAt).toBe('2026-08-01T03:00:00.000Z')
    expect(tree.bookmarks.filter((b) => b.url.startsWith('https://github.com')).map((b) => b.chromeId)).toEqual(['5', '13'])
  })

  it('제목은 자르지 않고 그대로 보낸다(100자 자르기는 서버가 한다)', () => {
    expect(tree.bookmarks.find((b) => b.chromeId === '16')!.title.length).toBeGreaterThan(100)
    expect(tree.bookmarks.find((b) => b.chromeId === '23')!.title).toBe('')
  })

  it('루트별 북마크 수를 센다(빈 synced는 0)', () => {
    expect(tree.rootCounts).toEqual({ bookmark_bar: 8, other: 3, synced: 0 })
  })

  it('북마크가 있으므로 suspicious가 아니다', () => {
    expect(tree.suspicious).toBe(false)
  })

  it('결과가 서버 스키마(syncChromeInput)를 그대로 통과한다', () => {
    const parsed = syncChromeInput.safeParse({
      mode: 'full',
      source: 'app',
      profile: 'Default',
      folders: tree.folders,
      bookmarks: tree.bookmarks
    })
    expect(parsed.success).toBe(true)
  })
})

describe('toAddedAt (1601년 기준 마이크로초 → ISO)', () => {
  it('17자리 값도 정밀도를 잃지 않는다(BigInt로 나눈다)', () => {
    // Number('13430026800000000') / 1e6 으로 계산하면 MAX_SAFE_INTEGER를 넘겨 밀리초가 어긋난다
    expect(toAddedAt('13430026800000000')).toBe('2026-08-01T03:00:00.000Z')
    expect(toAddedAt('13430026800123000')).toBe('2026-08-01T03:00:00.123Z')
  })

  it.each([
    ['0', '크롬이 시각을 모를 때'],
    ['', '빈 문자열'],
    ['abc', '숫자가 아님'],
    ['11644473600000000', '정확히 1970-01-01(0 이하로 본다)'],
    ['1000000', '1601년 근처라 1970년 이전']
  ])('%s → undefined (%s)', (raw) => {
    expect(toAddedAt(raw)).toBeUndefined()
  })

  it.each([[undefined], [null], [123], [{}]])('문자열이 아니면 undefined: %s', (raw) => {
    expect(toAddedAt(raw)).toBeUndefined()
  })

  it('하루 넘게 미래면 넣지 않는다(시계가 어긋난 PC)', () => {
    const now = Date.UTC(2026, 0, 1)
    const twoDaysLater = BigInt(now + 2 * 86_400_000 + 11_644_473_600_000) * 1000n
    expect(toAddedAt(twoDaysLater.toString(), now)).toBeUndefined()
    const inAnHour = BigInt(now + 3_600_000 + 11_644_473_600_000) * 1000n
    expect(toAddedAt(inAnHour.toString(), now)).toBe(new Date(now + 3_600_000).toISOString())
  })
})

describe('실패 판정 (full을 보내면 안 되는 경우)', () => {
  it.each([
    ['{', 'invalid_json', 'JSON이 잘렸다(크롬이 저장 중)'],
    ['not json at all', 'invalid_json', 'JSON이 아니다'],
    ['{"version":1}', 'no_roots', 'roots가 없다'],
    ['{"roots":[]}', 'no_roots', 'roots가 배열이다'],
    ['{"roots":null}', 'no_roots', 'roots가 null이다'],
    ['{"roots":{}}', 'no_roots', '알려진 루트가 하나도 없다'],
    ['{"roots":{"trash":{"children":[]}}}', 'no_roots', '모르는 루트만 있다'],
    ['{"roots":{"bookmark_bar":{"children":"x"}}}', 'bad_root', 'children이 배열이 아니다']
  ])('%s → %s (%s)', (text, reason) => {
    const r = parseBookmarksJson(text)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe(reason)
  })

  it('JSON 배열이나 문자열도 no_roots로 막는다', () => {
    for (const text of ['[]', '"hello"', 'null', '123']) {
      const r = parseBookmarksJson(text)
      expect(r.ok).toBe(false)
    }
  })
})

describe('의심스러운 결과와 이상한 항목', () => {
  it('북마크가 0개면 suspicious (루트는 정상이라 파싱은 성공)', () => {
    const tree = parse('{"roots":{"bookmark_bar":{"id":"1","children":[]},"other":{"id":"2","children":[]}}}')
    expect(tree.suspicious).toBe(true)
    expect(tree.bookmarks).toHaveLength(0)
  })

  it('폴더만 있고 북마크가 없어도 suspicious', () => {
    const tree = parse(
      '{"roots":{"bookmark_bar":{"id":"1","children":[{"id":"5","name":"빈 폴더","type":"folder","children":[]}]}}}'
    )
    expect(tree.folders).toHaveLength(1)
    expect(tree.suspicious).toBe(true)
  })

  it('걸러진 URL만 있으면 북마크 0개라 suspicious', () => {
    const tree = parse(
      '{"roots":{"bookmark_bar":{"id":"1","children":[{"id":"5","name":"북마클릿","type":"url","url":"javascript:void(0)"}]}}}'
    )
    expect(tree.filtered).toBe(1)
    expect(tree.suspicious).toBe(true)
  })

  it('id가 없거나 비었거나 문자열이 아닌 항목은 그것만 건너뛴다', () => {
    const tree = parse(
      JSON.stringify({
        roots: {
          bookmark_bar: {
            id: '1',
            children: [
              { name: 'id 없음', type: 'url', url: 'https://a.example.com/' },
              { id: '', name: 'id 빈 문자열', type: 'url', url: 'https://b.example.com/' },
              { id: 7, name: 'id가 숫자', type: 'url', url: 'https://c.example.com/' },
              '문자열 노드',
              null,
              { id: '9', name: '정상', type: 'url', url: 'https://d.example.com/' }
            ]
          }
        }
      })
    )
    expect(tree.bookmarks.map((b) => b.chromeId)).toEqual(['9'])
    expect(tree.filtered).toBe(0)
  })

  it('모르는 type은 건너뛰고, type이 없으면 url 유무로 본다', () => {
    const tree = parse(
      JSON.stringify({
        roots: {
          bookmark_bar: {
            id: '1',
            children: [
              { id: '5', name: '모르는 종류', type: 'separator', url: 'https://a.example.com/' },
              { id: '6', name: 'type 없는 북마크', url: 'https://b.example.com/' },
              { id: '7', name: 'type 없는 폴더', children: [{ id: '8', name: '안쪽', type: 'url', url: 'https://c.example.com/' }] }
            ]
          }
        }
      })
    )
    expect(tree.bookmarks.map((b) => b.chromeId)).toEqual(['6', '8'])
    expect(tree.folders.map((f) => f.chromeId)).toEqual(['7'])
    expect(tree.bookmarks.find((b) => b.chromeId === '8')!.parentChromeId).toBe('7')
  })

  it('name이 문자열이 아니면 빈 제목으로 두고 버리지 않는다', () => {
    const tree = parse('{"roots":{"bookmark_bar":{"id":"1","children":[{"id":"5","type":"url","url":"https://a.example.com/"}]}}}')
    expect(tree.bookmarks[0]!.title).toBe('')
  })

  it('루트에 id가 없으면 그 아래 북마크는 parentChromeId가 null(서버가 미분류로 둔다)', () => {
    const tree = parse('{"roots":{"bookmark_bar":{"children":[{"id":"5","name":"a","type":"url","url":"https://a.example.com/"}]}}}')
    expect(tree.bookmarks[0]!.parentChromeId).toBeNull()
  })

  it('synced(모바일 북마크)도 읽는다', () => {
    const tree = parse(
      '{"roots":{"bookmark_bar":{"id":"1","children":[]},"synced":{"id":"3","children":[{"id":"9","name":"폰","type":"url","url":"https://m.example.com/"}]}}}'
    )
    expect(tree.rootCounts).toEqual({ bookmark_bar: 0, other: 0, synced: 1 })
    expect(tree.bookmarks[0]!.parentChromeId).toBe('3')
  })
})
