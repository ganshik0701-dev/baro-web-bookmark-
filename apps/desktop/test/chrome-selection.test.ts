// 프로필 선택·저장·복원 (DESK-02). electron의 app.getPath만 가짜로 두고, 나머지는 실제 파일로 확인한다.
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// app.getPath('userData')가 가리킬 폴더. vi.mock은 끌어올려지므로 변수 이름을 mock으로 시작한다
const mockUserData = await mkdtemp(join(tmpdir(), 'baro-userdata-'))
vi.mock('electron', () => ({ app: { getPath: () => mockUserData } }))

const { getChromeSelection, selectChromeFile, selectChromeProfile } = await import('../src/main/chrome-selection')

const GOOD = JSON.stringify({
  roots: { bookmark_bar: { id: '1', children: [{ id: '5', name: 'a', type: 'url', url: 'https://a.example.com/' }] } }
})

let root: string
let userDataDir: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'baro-sel-'))
  // chromeUserDataDir()이 만드는 경로 모양 그대로 둔다: <LOCALAPPDATA>/Google/Chrome/User Data
  userDataDir = join(root, 'Google', 'Chrome', 'User Data')
  for (const [name, mtime] of [
    ['Default', new Date('2026-01-01')],
    ['Profile 1', new Date('2026-05-01')]
  ] as const) {
    await mkdir(join(userDataDir, name), { recursive: true })
    const path = join(userDataDir, name, 'Bookmarks')
    await writeFile(path, GOOD, 'utf8')
    await utimes(path, mtime, mtime)
  }
  vi.stubEnv('LOCALAPPDATA', root)
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
  await rm(mockUserData, { recursive: true, force: true })
})

/** 저장해 둔 선택을 지운다 */
beforeEach(async () => {
  await rm(join(mockUserData, 'chrome-selection.json'), { force: true })
  await rm(join(userDataDir, 'Local State'), { force: true })
})

describe('getChromeSelection (고를 순서)', () => {
  it('저장한 선택이 없으면 Default를 고른다', async () => {
    const s = await getChromeSelection()
    expect(s).toMatchObject({ kind: 'profile', name: 'Default' })
  })

  it('Local State의 last_used가 있으면 그것을 먼저 고른다', async () => {
    await writeFile(join(userDataDir, 'Local State'), '{"profile":{"last_used":"Profile 1"}}', 'utf8')
    const s = await getChromeSelection()
    expect(s).toMatchObject({ kind: 'profile', name: 'Profile 1' })
  })

  it('저장한 선택이 last_used보다 우선한다(사용자가 고른 것이 먼저)', async () => {
    await writeFile(join(userDataDir, 'Local State'), '{"profile":{"last_used":"Profile 1"}}', 'utf8')
    await selectChromeProfile('Default')
    const s = await getChromeSelection()
    expect(s).toMatchObject({ kind: 'profile', name: 'Default' })
  })

  it('저장한 프로필이 사라졌으면 조용히 다음으로 내려간다', async () => {
    await writeFile(join(mockUserData, 'chrome-selection.json'), '{"kind":"profile","name":"Profile 9"}', 'utf8')
    const s = await getChromeSelection()
    expect(s).toMatchObject({ kind: 'profile', name: 'Default' })
  })

  it('저장 파일이 깨졌어도 오류를 내지 않는다', async () => {
    await writeFile(join(mockUserData, 'chrome-selection.json'), '{깨진', 'utf8')
    expect(await getChromeSelection()).toMatchObject({ kind: 'profile', name: 'Default' })
  })

  it('크롬을 못 찾으면 null(사용자가 파일을 직접 골라야 한다)', async () => {
    vi.stubEnv('LOCALAPPDATA', join(root, '없는폴더'))
    expect(await getChromeSelection()).toBeNull()
    vi.stubEnv('LOCALAPPDATA', root)
  })
})

describe('selectChromeProfile (렌더러가 보낸 값이 들어오는 자리)', () => {
  it('목록에 있는 폴더명은 저장하고 다음 실행 때 복원된다', async () => {
    expect(await selectChromeProfile('Profile 1')).toMatchObject({ kind: 'profile', name: 'Profile 1' })
    expect(await getChromeSelection()).toMatchObject({ kind: 'profile', name: 'Profile 1' })
  })

  it.each([
    ['Profile 9', '없는 프로필'],
    ['..', '상위 폴더'],
    ['../../../Windows/System32/config/SAM', '경로 타고 올라가기'],
    ['C:\\Windows\\win.ini', '절대 경로'],
    ['Default\\..\\Profile 1', '경로 섞기'],
    ['', '빈 문자열'],
    ['default', '대소문자 다름']
  ])('목록에 없는 값은 거절한다: %s (%s)', async (name) => {
    expect(await selectChromeProfile(name)).toBeNull()
    // 거절했으면 저장도 하지 않는다
    expect(await getChromeSelection()).toMatchObject({ kind: 'profile', name: 'Default' })
  })

  it.each([[undefined], [null], [123], [{ name: 'Default' }], [['Default']]])(
    '문자열이 아니면 거절한다: %s',
    async (name) => {
      expect(await selectChromeProfile(name)).toBeNull()
    }
  )
})

describe('selectChromeFile (직접 고른 파일)', () => {
  it('저장하면 다음 실행 때 그 파일을 읽는다', async () => {
    const picked = join(root, '내보낸-북마크')
    await writeFile(picked, GOOD, 'utf8')
    expect(await selectChromeFile(picked)).toEqual({ kind: 'file', bookmarksPath: picked })
    expect(await getChromeSelection()).toEqual({ kind: 'file', bookmarksPath: picked })
  })

  it('고른 파일은 크롬 프로필이 있어도 그것보다 우선한다', async () => {
    const picked = join(root, '다른-북마크')
    await writeFile(picked, GOOD, 'utf8')
    await selectChromeFile(picked)
    expect(await getChromeSelection()).toMatchObject({ kind: 'file' })
  })
})
