// 파일 읽기·재시도·프로필 탐색 (DESK-01). 임시 폴더에 진짜 파일을 만들어 확인한다(DB·네트워크 없음).
// 크롬 파일은 읽기 전용이므로, 여기서 쓰는 것은 우리가 만든 임시 파일뿐이다.
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readBookmarksFile } from '../src/main/chrome-bookmarks'
import { chromeUserDataDir, findChromeProfiles } from '../src/main/chrome-profiles'

const GOOD = JSON.stringify({
  roots: {
    bookmark_bar: { id: '1', children: [{ id: '5', name: 'a', type: 'url', url: 'https://a.example.com/' }] }
  }
})

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'baro-desk-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** 이 테스트에서만 쓰는 파일을 만든다 */
async function write(name: string, text: string): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, text, 'utf8')
  return path
}

describe('readBookmarksFile', () => {
  it('정상 파일을 읽어 요청 항목으로 바꾼다', async () => {
    const r = await readBookmarksFile(await write('ok.json', GOOD), { retryDelayMs: 0 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.tree.bookmarks.map((b) => b.chromeId)).toEqual(['5'])
      expect(r.tree.suspicious).toBe(false)
    }
  })

  it('파일이 없으면 read_error', async () => {
    const r = await readBookmarksFile(join(dir, '없는파일'), { retryDelayMs: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('read_error')
  })

  it('잘린 JSON은 invalid_json', async () => {
    const r = await readBookmarksFile(await write('cut.json', GOOD.slice(0, 40)), { retryDelayMs: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('invalid_json')
  })

  it('크롬이 저장을 끝내면 재시도에서 성공한다(1초 뒤 1회)', async () => {
    const path = await write('racing.json', GOOD.slice(0, 40))
    // 첫 읽기는 잘린 파일, 재시도를 기다리는 사이 크롬이 저장을 끝낸 상황을 흉내 낸다
    setTimeout(() => void writeFile(path, GOOD, 'utf8'), 10)
    const r = await readBookmarksFile(path, { retryDelayMs: 50 })
    expect(r.ok).toBe(true)
  })

  it('bad_root는 재시도하지 않는다(다시 읽으면 성공할 파일이어도 실패로 끝낸다)', async () => {
    const path = await write('badroot.json', '{"roots":{"bookmark_bar":{"children":"x"}}}')
    setTimeout(() => void writeFile(path, GOOD, 'utf8'), 10)
    const r = await readBookmarksFile(path, { retryDelayMs: 50 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('bad_root')
  })

  it('파일이 상한을 넘으면 읽지 않고 too_large', async () => {
    const r = await readBookmarksFile(await write('big.json', GOOD), { retryDelayMs: 0, maxBytes: 10 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('too_large')
  })

  it('북마크가 0개면 성공이지만 suspicious', async () => {
    const path = await write('empty.json', '{"roots":{"bookmark_bar":{"id":"1","children":[]}}}')
    const r = await readBookmarksFile(path, { retryDelayMs: 0 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.tree.suspicious).toBe(true)
  })
})

describe('findChromeProfiles', () => {
  let userData: string

  beforeAll(async () => {
    userData = join(dir, 'User Data')
    // Bookmarks가 있는 프로필 3개 + 없는 프로필 + 북마크를 쓰지 않는 특수 폴더
    for (const [name, mtime] of [
      ['Default', new Date('2026-01-01')],
      ['Profile 1', new Date('2026-03-01')],
      ['Profile 2', new Date('2026-05-01')]
    ] as const) {
      await mkdir(join(userData, name), { recursive: true })
      const path = join(userData, name, 'Bookmarks')
      await writeFile(path, GOOD, 'utf8')
      await utimes(path, mtime, mtime)
    }
    await mkdir(join(userData, 'Profile 3'), { recursive: true }) // Bookmarks 없음
    await mkdir(join(userData, 'System Profile'), { recursive: true })
    await writeFile(join(userData, 'System Profile', 'Bookmarks'), GOOD, 'utf8')
  })

  it('Bookmarks가 있는 프로필만, Default 먼저, 나머지는 최근 수정순', async () => {
    const found = await findChromeProfiles(userData)
    expect(found.map((p) => p.name)).toEqual(['Default', 'Profile 2', 'Profile 1'])
    expect(found[0]!.bookmarksPath).toBe(join(userData, 'Default', 'Bookmarks'))
  })

  it('폴더가 없으면 빈 목록(크롬 미설치). 오류를 던지지 않는다', async () => {
    expect(await findChromeProfiles(join(dir, '없는폴더'))).toEqual([])
    expect(await findChromeProfiles(null)).toEqual([])
  })

  it('chromeUserDataDir: LOCALAPPDATA가 없으면 null', () => {
    expect(chromeUserDataDir({})).toBeNull()
    expect(chromeUserDataDir({ LOCALAPPDATA: 'C:\\x' })).toBe(join('C:\\x', 'Google', 'Chrome', 'User Data'))
  })
})
