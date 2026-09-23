// 크롬 프로필 폴더 탐색 (DESK-01, docs/01-spec.md 'Bookmarks 파일 읽기 규칙').
// 메인 프로세스 전용. 읽기만 한다(readdir·stat).
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export type ChromeProfile = {
  /** 폴더 이름. 서버로 보내는 profile 값이다('Default', 'Profile 1') */
  name: string
  /** Bookmarks 파일의 전체 경로 */
  bookmarksPath: string
  /** Bookmarks 파일의 마지막 수정 시각. 자동 선택에 쓴다 */
  modifiedAt: Date
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
 * Bookmarks 파일이 실제로 있는 프로필만 모은다. 자동 선택 순서로 정렬해 돌려준다:
 * Default가 맨 앞, 나머지는 Bookmarks 수정 시각이 최근인 것부터
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

  const found: ChromeProfile[] = []
  for (const name of entries.filter((n) => PROFILE_DIR.test(n))) {
    const bookmarksPath = join(userDataDir, name, 'Bookmarks')
    try {
      const info = await stat(bookmarksPath)
      if (info.isFile()) found.push({ name, bookmarksPath, modifiedAt: info.mtime })
    } catch {
      // 이 프로필에는 북마크 파일이 없다(한 번도 북마크를 만들지 않은 프로필)
    }
  }

  return found.sort((a, b) => {
    if (a.name === DEFAULT_PROFILE) return -1
    if (b.name === DEFAULT_PROFILE) return 1
    return b.modifiedAt.getTime() - a.modifiedAt.getTime()
  })
}
