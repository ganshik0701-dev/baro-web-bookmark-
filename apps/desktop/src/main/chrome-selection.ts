// 어느 크롬 프로필(또는 직접 고른 파일)을 읽을지 고르고 기억한다 (DESK-02, docs/01-spec.md).
// 메인 프로세스 전용. 렌더러는 경로를 정할 수 없고, 이 파일이 정한 경로만 읽힌다.
//
// 저장은 이 PC에만 한다(userData/chrome-selection.json). 서버의 profiles.chrome_profile은
// 동기화(DESK-03)가 profile 필드로 갱신한다. 프로필은 PC마다 다를 수 있어 이 PC 값이 더 정확하다.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { ParsedTree } from './chrome-parse'
import type { ReadFailReason } from './chrome-bookmarks'
import { findChromeProfiles, type ChromeProfile } from './chrome-profiles'

export type ChromeSelection =
  | { kind: 'profile'; name: string; displayName: string | null; bookmarksPath: string }
  | { kind: 'file'; bookmarksPath: string }

/** 렌더러가 받는 읽기 결과. 트리와 '무엇을 읽었는지'만 넘긴다 */
export type ChromeReadResult =
  | { ok: true; selection: ChromeSelection; tree: ParsedTree }
  | { ok: false; reason: ReadFailReason | 'no_selection'; message: string; selection?: ChromeSelection }

/** 저장 파일에 담는 것. 경로는 'file'일 때만 쓴다(프로필은 이름으로 다시 찾는다) */
type Saved = { kind: 'profile'; name: string } | { kind: 'file'; bookmarksPath: string }

const filePath = (): string => join(app.getPath('userData'), 'chrome-selection.json')

async function loadSaved(): Promise<Saved | null> {
  let text: string
  try {
    text = await readFile(filePath(), 'utf8')
  } catch {
    return null
  }
  try {
    const parsed = JSON.parse(text) as Partial<Saved>
    if (parsed?.kind === 'profile' && typeof parsed.name === 'string') return { kind: 'profile', name: parsed.name }
    if (parsed?.kind === 'file' && typeof parsed.bookmarksPath === 'string') {
      return { kind: 'file', bookmarksPath: parsed.bookmarksPath }
    }
  } catch {
    // 파일이 깨졌으면 저장한 적 없는 것으로 본다
  }
  return null
}

async function saveSelection(saved: Saved): Promise<void> {
  try {
    await writeFile(filePath(), JSON.stringify(saved), 'utf8')
  } catch {
    // 저장에 실패해도 이번 실행은 그대로 쓴다(다음 실행 때 다시 고르면 된다)
  }
}

const toSelection = (p: ChromeProfile): ChromeSelection => ({
  kind: 'profile',
  name: p.name,
  displayName: p.displayName,
  bookmarksPath: p.bookmarksPath
})

/**
 * 지금 읽어야 할 대상. 순서는 docs/01-spec.md '표시 이름과 자동 선택':
 * ①저장해 둔 선택 ②Local State의 last_used ③Default ④수정 시각 최근
 * ②~④는 findChromeProfiles가 이미 그 순서로 정렬해 돌려준다.
 * 저장해 둔 프로필이 사라졌으면(프로필 삭제) 조용히 다음으로 내려간다
 */
export async function getChromeSelection(): Promise<ChromeSelection | null> {
  const saved = await loadSaved()
  if (saved?.kind === 'file') return { kind: 'file', bookmarksPath: saved.bookmarksPath }

  const profiles = await findChromeProfiles()
  if (saved?.kind === 'profile') {
    const still = profiles.find((p) => p.name === saved.name)
    if (still) return toSelection(still)
  }
  return profiles[0] ? toSelection(profiles[0]) : null
}

/**
 * 프로필을 고른다. **탐색 목록에 있는 폴더명일 때만** 받는다.
 * 렌더러가 보낸 문자열이 여기로 들어오므로, 목록에 없으면 경로를 만들지 않고 거절한다
 */
export async function selectChromeProfile(name: unknown): Promise<ChromeSelection | null> {
  if (typeof name !== 'string') return null
  const found = (await findChromeProfiles()).find((p) => p.name === name)
  if (!found) return null
  await saveSelection({ kind: 'profile', name: found.name })
  return toSelection(found)
}

/** 직접 고른 파일을 선택으로 저장한다. 경로는 dialog가 준 것만 들어온다(렌더러가 아니라) */
export async function selectChromeFile(bookmarksPath: string): Promise<ChromeSelection> {
  await saveSelection({ kind: 'file', bookmarksPath })
  return { kind: 'file', bookmarksPath }
}
