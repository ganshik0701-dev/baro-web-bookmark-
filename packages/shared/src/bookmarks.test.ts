// 북마크 스키마 단위 테스트. 실행: pnpm --filter @baro/shared test
import { describe, expect, it } from 'vitest'
import { bookmarkId, createBookmarkInput, httpUrl, normalizeUrl, updateBookmarkInput } from './bookmarks'

const UUID = '3f2b8c1e-6a4d-4e2f-9b7a-1c2d3e4f5a6b'

describe('httpUrl (BM-02)', () => {
  it.each([
    ['github.com', 'https://github.com/'],
    ['  github.com/foo  ', 'https://github.com/foo'],
    ['HTTP://GitHub.COM/Path', 'http://github.com/Path'],
    ['https://github.com:443/x', 'https://github.com/x'],
    ['localhost:3000', 'https://localhost:3000/'],
    ['github.com:8080/x', 'https://github.com:8080/x'],
    ['https://한국.kr/경로', 'https://xn--3e0b707e.kr/%EA%B2%BD%EB%A1%9C']
  ])('%s → %s', (input, expected) => {
    expect(httpUrl.parse(input)).toBe(expected)
  })

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///C:/Windows/win.ini',
    'ftp://example.com',
    'chrome://settings',
    'mailto:a@example.com',
    'vbscript:msgbox(1)'
  ])('위험하거나 http(s)가 아닌 주소는 거부: %s', (input) => {
    expect(httpUrl.safeParse(input).success).toBe(false)
  })

  it.each(['', '   ', 'https://', 'http://exa mple.com'])('형식이 틀린 주소는 거부: "%s"', (input) => {
    expect(httpUrl.safeParse(input).success).toBe(false)
  })

  it('2048자를 넘으면 거부', () => {
    expect(httpUrl.safeParse('https://a.com/' + 'x'.repeat(2048)).success).toBe(false)
  })
})

describe('normalizeUrl (중복 검사)', () => {
  it.each([
    ['https://github.com/', 'https://github.com'],
    ['https://github.com/foo/', 'https://github.com/foo'],
    ['https://github.com/foo//', 'https://github.com/foo'],
    ['https://a.com/x?utm_source=y&b=1&UTM_Medium=z', 'https://a.com/x?b=1'],
    ['https://a.com/?utm_source=y', 'https://a.com'],
    ['https://a.com/x?b=1#top', 'https://a.com/x?b=1#top'],
    ['http://a.com/', 'http://a.com']
  ])('%s → %s', (input, expected) => {
    expect(normalizeUrl(httpUrl.parse(input))).toBe(expected)
  })

  it('입력 모양이 달라도 같은 주소면 같은 값이 된다', () => {
    const variants = ['GitHub.com', 'https://github.com/', 'https://GITHUB.com?utm_campaign=x', 'github.com/']
    const normalized = new Set(variants.map((v) => normalizeUrl(httpUrl.parse(v))))
    expect([...normalized]).toEqual(['https://github.com'])
  })
})

describe('createBookmarkInput (POST /bookmarks)', () => {
  it('최소 입력은 url만', () => {
    expect(createBookmarkInput.parse({ url: 'github.com' })).toEqual({ url: 'https://github.com/' })
  })

  it('빈 제목은 없는 것으로 본다(서버가 도메인을 쓴다)', () => {
    expect(createBookmarkInput.parse({ url: 'github.com', title: '   ' }).title).toBeUndefined()
  })

  it('태그는 공백을 자르고 중복을 합친다', () => {
    expect(createBookmarkInput.parse({ url: 'a.com', tags: [' 개발 ', '개발', 'git'] }).tags).toEqual(['개발', 'git'])
  })

  it.each([
    [{ url: 'a.com', title: 'x'.repeat(101) }, 'title'],
    [{ url: 'a.com', tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, 'tags'],
    [{ url: 'a.com', tags: ['x'.repeat(21)] }, 'tags'],
    [{ url: 'a.com', tags: [''] }, 'tags'],
    [{ url: 'a.com', groupId: 'not-a-uuid' }, 'groupId'],
    [{ url: 'a.com', iconUrl: 'http://a.com/favicon.ico' }, 'iconUrl'],
    [{ url: 'a.com', allowDuplicate: true }, ''],
    [{}, 'url']
  ])('거부: %j (%s)', (input, field) => {
    const r = createBookmarkInput.safeParse(input)
    expect(r.success).toBe(false)
    // 어느 필드의 오류인지만 본다(태그 하나의 오류는 경로가 tags.0처럼 나온다)
    if (!r.success) expect(String(r.error.issues[0].path[0] ?? '')).toBe(field)
  })

  it('groupId·iconUrl은 null로 비울 수 있다', () => {
    expect(createBookmarkInput.parse({ url: 'a.com', groupId: null, iconUrl: null })).toMatchObject({
      groupId: null,
      iconUrl: null
    })
  })
})

describe('updateBookmarkInput (PATCH /bookmarks/:id)', () => {
  it('하나만 바꿔도 된다', () => {
    expect(updateBookmarkInput.parse({ isPinned: true })).toEqual({ isPinned: true })
  })

  it('빈 객체는 거부', () => {
    expect(updateBookmarkInput.safeParse({}).success).toBe(false)
  })

  it('제목을 보내면 비어 있으면 안 된다', () => {
    expect(updateBookmarkInput.safeParse({ title: '  ' }).success).toBe(false)
  })

  it('url도 같은 규칙으로 검증한다', () => {
    expect(updateBookmarkInput.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false)
  })
})

describe('bookmarkId', () => {
  it('uuid만', () => {
    expect(bookmarkId.safeParse(UUID).success).toBe(true)
    expect(bookmarkId.safeParse('1').success).toBe(false)
  })
})
