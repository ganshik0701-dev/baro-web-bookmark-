// 크롬 프로필 폴더 탐색과 표시 이름 (DESK-01·02, docs/01-spec.md 'Bookmarks 파일 읽기 규칙').
// 메인 프로세스 전용. 읽기만 한다(readdir·stat·readFile).
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export type ChromeProfile = {
  /** 폴더 이름. 서버로 보내는 profile 값이다('Default', 'Profile 1') */
  name: string
  /** Local State에서 읽은 표시 이름('홍길동'). 못 읽으면 null */
  displayName: string | null
  /** Bookmarks 파일의 전체 경로 */
  bookmarksPath: string
  /** Bookmarks 파일의 마지막 수정 시각. 자동 선택에 쓴다 */
  modifiedAt: Date
}

/** Local State에서 꺼내 쓰는 것만. 이메일(user_name)은 읽지 않는다 */
export type LocalState = {
  /** 폴더명 → 표시 이름 */
  displayNames: Record<string, string>
  /** 마지막으로 쓴 프로필 폴더명 */
  lastUsed: string | null
}

const EMPTY_LOCAL_STATE: LocalState = { displayNames: {}, lastUsed: null }

/**
 * Local State(JSON) 파싱. 이 파일은 있으면 좋은 정보일 뿐이라 무엇이 잘못돼도 던지지 않는다.
 * 못 읽으면 표시 이름 없이 폴더명만 쓴다
 */
export function parseLocalState(text: string): LocalState {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return EMPTY_LOCAL_STATE
  }
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  if (!isRecord(parsed) || !isRecord(parsed.profile)) return EMPTY_LOCAL_STATE

  const profile = parsed.profile
  const displayNames: Record<string, string> = {}
  if (isRecord(profile.info_cache)) {
    for (const [dir, info] of Object.entries(profile.info_cache)) {
      if (isRecord(info) && typeof info.name === 'string' && info.name !== '') displayNames[dir] = info.name
    }
  }
  return { displayNames, lastUsed: typeof profile.last_used === 'string' ? profile.last_used : null }
}

/** Local State를 읽는다. 없거나 깨졌으면 빈 값 */
export async function readLocalState(userDataDir: string): Promise<LocalState> {
  try {
    return parseLocalState(await readFile(join(userDataDir, 'Local State'), 'utf8'))
  } catch {
    return EMPTY_LOCAL_STATE
  }
}

const DEFAULT_PROFILE = 'Default'
/** 'Default' 또는 'Profile 3'만 본다. 'System Profile'·'Guest Profile'은 북마크가 없다 */
const PROFILE_DIR = /^(Default|Profile \d+)$/

/** 크롬 사용자 데이터 폴더. %LOCALAPPDATA%가 없으면 null(윈도우가 아니거나 환경이 이상함) */
export function chromeUserDataDir(env = process.env): string | null {
  const local = env.LOCALAPPDATA
  return local ? join(local, 'Google', 'Chrome', 'User Data') : null
}

/**
 * Bookmarks 파일이 실제로 있는 프로필만 모은다(Local State에 있어도 파일이 없으면 뺀다).
 * 정렬은 last_used → Default → 수정 시각 최근순. 저장해 둔 선택은 부르는 쪽(chrome-selection)이 얹는다
 */
export async function findChromeProfiles(userDataDir: string | null = chromeUserDataDir()): Promise<ChromeProfile[]> {
  if (!userDataDir) return []
  let entries: string[]
  try {
    entries = (await readdir(userDataDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    // 크롬을 설치하지 않았거나 경로가 다르다. 사용자가 파일을 직접 고르는 길로 간다
    return []
  }

  const { displayNames, lastUsed } = await readLocalState(userDataDir)

  const found: ChromeProfile[] = []
  for (const name of entries.filter((n) => PROFILE_DIR.test(n))) {
    const bookmarksPath = join(userDataDir, name, 'Bookmarks')
    try {
      const info = await stat(bookmarksPath)
      if (info.isFile()) {
        found.push({ name, displayName: displayNames[name] ?? null, bookmarksPath, modifiedAt: info.mtime })
      }
    } catch {
      // 이 프로필에는 북마크 파일이 없다(한 번도 북마크를 만들지 않은 프로필)
    }
  }

  // 마지막으로 쓴 프로필이 맨 앞, 그다음 Default, 나머지는 최근에 고친 것부터
  const rank = (p: ChromeProfile): number => (p.name === lastUsed ? 0 : p.name === DEFAULT_PROFILE ? 1 : 2)
  return found.sort((a, b) => rank(a) - rank(b) || b.modifiedAt.getTime() - a.modifiedAt.getTime())
}
