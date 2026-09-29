// 크롬 프로필 라디오 목록 (SCR-02 첫 동기화, SCR-05 설정의 '변경'이 같이 쓴다).
// 고르면 onChoose(폴더 이름). 메인이 탐색 목록에 있는 이름인지 다시 검사하고 이 PC에 저장한다
import type { ChromeProfileSummary, ChromeSelection } from '../types'

type Props = {
  profiles: ChromeProfileSummary[] | null
  selection: ChromeSelection | null
  selectedName: string | null
  busy: boolean
  onChoose: (name: string) => void
}

export default function ProfileList({ profiles, selection, selectedName, busy, onChoose }: Props) {
  if (profiles === null) return <p className="sync-lead">크롬 프로필을 찾는 중…</p>

  if (selection?.kind === 'file') {
    return (
      <p className="sync-picked">
        고른 파일: <span className="sync-path">{selection.bookmarksPath}</span>
      </p>
    )
  }

  if (profiles.length === 0) {
    return (
      <p className="sync-lead">
        크롬 북마크 파일을 찾지 못했습니다. 아래 ‘파일 직접 선택’으로 <code>Bookmarks</code> 파일을 고르세요.
      </p>
    )
  }

  return (
    <ul className="profile-list">
      {profiles.map((p) => (
        <li key={p.name}>
          <label className={`profile-item${p.name === selectedName ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name="chrome-profile"
              value={p.name}
              checked={p.name === selectedName}
              disabled={busy}
              onChange={() => onChoose(p.name)}
            />
            <span className="profile-text">
              <span className="profile-name">{p.displayName ? `${p.name} · ${p.displayName}` : p.name}</span>
              <span className="profile-detail">
                {p.counts ? `북마크 ${p.counts.bookmarks}개 · 폴더 ${p.counts.folders}개` : '북마크 파일을 읽지 못했습니다'}
              </span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}
