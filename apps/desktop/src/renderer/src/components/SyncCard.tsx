// SCR-05 설정의 동기화 카드 (docs/01-spec.md '설정 화면 규칙'의 '동기화 카드', 시안 '8 · 설정').
// 크롬 프로필(카드 안에서 '변경') · 앱을 열 때 자동으로 동기화(스위치) · 마지막 동기화.
// 프로필을 바꿔도 바로 동기화하지 않는다. 설정 화면은 상태바를 덮으므로 동기화 상태도 여기서 보여준다
import { useEffect, useState } from 'react'
import { useLatestSaver } from '../lib/use-latest-saver'
import type { ChromeProfileSummary, ChromeSelection, SyncState } from '../types'
import ProfileList from './ProfileList'

type Props = { sync: SyncState | null }

const SWITCH_SAVE_FAILED = '자동 동기화 설정을 저장하지 못했습니다'

/** "2026년 9월 29일 오후 1시 29분" */
function formatSyncedAt(iso: string): string {
  // toLocaleString은 '오후 1:29'로 써서 시안 모양으로 직접 만든다
  const d = new Date(iso)
  const h = d.getHours()
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}시 ${d.getMinutes()}분`
}

/** Bookmarks 파일 경로 → 그 프로필 폴더 경로(시안처럼 폴더를 보여준다) */
function profileFolder(bookmarksPath: string): string {
  return bookmarksPath.replace(/[\\/]Bookmarks$/, '')
}

export default function SyncCard({ sync }: Props) {
  const [selection, setSelection] = useState<ChromeSelection | null | undefined>(undefined)
  const [profiles, setProfiles] = useState<ChromeProfileSummary[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [changed, setChanged] = useState(false)
  const [picking, setPicking] = useState(false)
  // null이면 아직 모름(불러오는 중), 'error'면 불러오지 못함
  const [autoSync, setAutoSync] = useState<boolean | null | 'error'>(null)
  const [switchNotice, setSwitchNotice] = useState<string | null>(null)

  // 지금 선택(동기화가 읽는 대상과 같다)과 자동 동기화 설정을 읽는다
  useEffect(() => {
    let alive = true
    window.baro.getChromeSelection().then(
      (s) => alive && setSelection(s),
      () => alive && setSelection(null)
    )
    window.baro.getAutoSync().then(
      (r) => alive && setAutoSync('data' in r ? r.data.autoSync : 'error'),
      () => alive && setAutoSync('error')
    )
    return () => {
      alive = false
    }
  }, [])

  // '변경'을 처음 펼칠 때 프로필 목록(북마크·폴더 수)을 읽는다
  useEffect(() => {
    if (!editing || profiles !== null) return
    let alive = true
    window.baro.listChromeProfiles().then(
      (list) => alive && setProfiles(list),
      () => alive && setProfiles([])
    )
    return () => {
      alive = false
    }
  }, [editing, profiles])

  const saveAutoSync = useLatestSaver<boolean>(
    (v) => window.baro.saveAutoSync(v),
    (ok) => setSwitchNotice((n) => (ok ? (n === SWITCH_SAVE_FAILED ? null : n) : SWITCH_SAVE_FAILED))
  )

  async function choose(name: string) {
    const next = await window.baro.selectChromeProfile(name)
    if (next) {
      setSelection(next)
      setChanged(true)
    }
  }

  async function pickFile() {
    setPicking(true)
    try {
      const result = await window.baro.pickChromeBookmarksFile()
      if (result?.ok) {
        setSelection(result.selection)
        setChanged(true)
      }
    } finally {
      setPicking(false)
    }
  }

  const syncing = sync?.phase === 'syncing' || sync?.phase === 'needs_confirm'
  const profileName =
    selection === undefined
      ? '불러오는 중…'
      : selection === null
        ? '크롬 프로필을 찾지 못했습니다'
        : selection.kind === 'file'
          ? '직접 고른 파일'
          : `크롬 프로필 · ${selection.displayName ?? selection.name}`
  const profilePath = selection ? (selection.kind === 'file' ? selection.bookmarksPath : profileFolder(selection.bookmarksPath)) : null

  const result = sync?.phase === 'done' ? sync.lastResult : null
  const lastLine = syncing
    ? '동기화하는 중…'
    : sync?.lastSyncedAt
      ? `마지막 동기화 ${formatSyncedAt(sync.lastSyncedAt)}${result ? ` · 추가 ${result.created}, 수정 ${result.updated}, 삭제 ${result.deleted}` : ''}`
      : '아직 동기화하지 않았습니다'

  return (
    <>
      <div className="settings-row">
        <span className="settings-text">
          <span className="settings-name">{profileName}</span>
          {profilePath && (
            <span className="settings-detail settings-path" title={profilePath}>
              {profilePath}
            </span>
          )}
        </span>
        <button
          type="button"
          className="button-secondary settings-button"
          aria-expanded={editing}
          aria-controls="settings-profiles"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? '닫기' : '변경'}
        </button>
      </div>

      {editing && (
        <div id="settings-profiles" className="settings-profiles">
          <ProfileList
            profiles={profiles}
            // 직접 고른 파일이어도 목록은 보여준다(프로필로 되돌릴 수 있게)
            selection={selection?.kind === 'profile' ? selection : null}
            selectedName={selection?.kind === 'profile' ? selection.name : null}
            busy={syncing}
            onChoose={(name) => void choose(name)}
          />
          <button type="button" className="sync-link settings-pick" onClick={() => void pickFile()} disabled={syncing || picking}>
            파일 직접 선택
          </button>
          {changed && (
            <div className="settings-row settings-changed" role="status">
              <span className="settings-detail">다음 동기화 때 반영됩니다.</span>
              <button
                type="button"
                className="button-secondary settings-button settings-button-small"
                onClick={() => void window.baro.syncNow()}
                disabled={syncing}
              >
                지금 동기화
              </button>
            </div>
          )}
        </div>
      )}

      <div className="settings-row settings-divided is-switch">
        <span className="settings-text">
          <label className="settings-name" htmlFor="settings-auto-sync">
            앱을 열 때 자동으로 동기화
          </label>
          <span className={`settings-detail${sync?.phase === 'error' ? ' is-error' : ''}`} role="status">
            {sync?.phase === 'error' && sync.error ? `동기화 실패 · ${sync.error.message}` : lastLine}
          </span>
          {(switchNotice || autoSync === 'error') && (
            <span className="settings-detail is-error" role="alert">
              {autoSync === 'error' ? '설정을 불러오지 못했습니다' : switchNotice}
            </span>
          )}
        </span>
        {/* 스위치: 체크박스에 role="switch". 화면은 바로 바꾸고 저장은 뒤에서(한 번에 하나·마지막 값) */}
        <input
          id="settings-auto-sync"
          type="checkbox"
          role="switch"
          className="switch"
          checked={autoSync === true}
          disabled={autoSync === null || autoSync === 'error'}
          onChange={(e) => {
            const v = e.target.checked
            setAutoSync(v)
            saveAutoSync(v)
          }}
        />
      </div>
    </>
  )
}
