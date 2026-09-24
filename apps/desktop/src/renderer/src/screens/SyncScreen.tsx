// SCR-02 첫 동기화 (docs/01-spec.md 화면 명세, 시안 project/Sync.dc.html).
// 프로필을 고르고 '가져오기' → 단계 표시 → 결과. 대량 삭제 확인은 MassDeleteModal이 받는다.
//
// 이 화면은 서버 lastSyncedAt이 null일 때만 보인다. 한 번이라도 동기화한 계정은 바로 홈으로 간다.
import { useEffect, useState } from 'react'
import type { ChromeProfile, ChromeSelection, SyncState } from '../types'
import { useScreenTitle } from './use-screen-title'

type Props = {
  sync: SyncState
  onSkip: () => void
}

/** skippedReasons를 사람이 읽는 문구로. 0인 이유는 빼고 보여준다 */
const SKIP_LABEL: Record<string, string> = {
  invalidUrl: '주소가 http/https가 아님',
  duplicateUrl: '같은 주소가 여러 번',
  manualExists: '바로에서 직접 추가한 것'
}

export default function SyncScreen({ sync, onSkip }: Props) {
  const headingRef = useScreenTitle('첫 동기화')
  const [profiles, setProfiles] = useState<ChromeProfile[] | null>(null)
  const [selection, setSelection] = useState<ChromeSelection | null>(null)
  const [picking, setPicking] = useState(false)

  // 프로필 목록과 지금 고른 대상을 읽는다. 경로는 메인이 정하고 여기선 보여주기만 한다
  useEffect(() => {
    let alive = true
    Promise.all([window.baro.listChromeProfiles(), window.baro.getChromeSelection()])
      .then(([list, current]) => {
        if (!alive) return
        setProfiles(list)
        setSelection(current)
      })
      .catch(() => alive && setProfiles([]))
    return () => {
      alive = false
    }
  }, [])

  async function choose(name: string) {
    const next = await window.baro.selectChromeProfile(name)
    if (next) setSelection(next)
  }

  async function pickFile() {
    setPicking(true)
    try {
      const result = await window.baro.pickChromeBookmarksFile()
      // 취소하면 null. 크롬 파일이 아니면 ok:false로 오고 그때는 고른 것으로 치지 않는다
      if (result?.ok) setSelection(result.selection)
    } finally {
      setPicking(false)
    }
  }

  const busy = sync.phase === 'syncing' || sync.phase === 'needs_confirm'
  const done = sync.phase === 'done' ? sync.lastResult : null
  const selectedName = selection?.kind === 'profile' ? selection.name : null

  return (
    <main className="sync-screen">
      <div className="sync-card">
        <div className="sync-head">
          <h1 ref={headingRef} tabIndex={-1} className="sync-title">
            {done ? '가져왔습니다' : '크롬 북마크를 찾았습니다'}
          </h1>
          <p className="sync-lead">
            {done
              ? '이제 바로에서 북마크를 열 수 있습니다. 크롬에서 바꾼 내용은 앱을 켤 때마다 따라옵니다.'
              : '가져올 크롬 프로필을 고르세요. 폴더는 그룹으로 옮겨지고, 같은 주소는 건너뜁니다.'}
          </p>
        </div>

        {done ? (
          <ResultList result={done} />
        ) : (
          <ProfileList
            profiles={profiles}
            selection={selection}
            selectedName={selectedName}
            busy={busy}
            onChoose={choose}
          />
        )}

        {busy && <Progress phase={sync.phase} />}

        {sync.phase === 'error' && sync.error && (
          <p className="sync-error" role="alert">
            {sync.error.message}
          </p>
        )}

        <div className="sync-actions">
          {done ? (
            <button type="button" className="button-primary" onClick={onSkip}>
              시작하기
            </button>
          ) : (
            <>
              <button
                type="button"
                className="button-primary"
                onClick={() => void window.baro.syncNow()}
                disabled={busy || !selection}
              >
                {sync.phase === 'error' ? '다시 시도' : '가져오기'}
              </button>
              <button type="button" className="button-secondary" onClick={onSkip} disabled={busy}>
                나중에 하기
              </button>
              <button type="button" className="sync-link" onClick={() => void pickFile()} disabled={busy || picking}>
                파일 직접 선택
              </button>
            </>
          )}
        </div>

        <p className="sync-note">
          크롬을 쓰지 않거나 파일을 찾지 못했다면 <code>Bookmarks</code> 파일을 직접 고를 수 있습니다. 바로는 이 파일을
          읽기만 하고 고치지 않습니다.
        </p>
      </div>
    </main>
  )
}

function ProfileList({
  profiles,
  selection,
  selectedName,
  busy,
  onChoose
}: {
  profiles: ChromeProfile[] | null
  selection: ChromeSelection | null
  selectedName: string | null
  busy: boolean
  onChoose: (name: string) => void
}) {
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
                마지막 변경 {new Date(p.modifiedAt).toLocaleDateString('ko-KR')}
              </span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}

/**
 * 진행 표시. 실제로는 파일 읽기가 순식간이고 서버 요청이 대부분이라 중간 개수를 알 수 없다.
 * 그래서 남은 시간이나 가짜 퍼센트를 만들지 않고 단계만 보여준다(바는 불확정 애니메이션)
 */
function Progress({ phase }: { phase: SyncState['phase'] }) {
  const label = phase === 'needs_confirm' ? '확인을 기다리는 중' : '북마크를 읽어 서버로 보내는 중'
  return (
    <div className="progress" aria-live="polite">
      <span className="progress-label">{label}</span>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuetext={label}
        aria-busy={phase !== 'needs_confirm'}
      >
        <span className={`progress-fill${phase === 'needs_confirm' ? ' is-paused' : ''}`} />
      </div>
    </div>
  )
}

function ResultList({ result }: { result: NonNullable<SyncState['lastResult']> }) {
  const reasons = Object.entries(result.skippedReasons ?? {}).filter(([, n]) => Number(n) > 0)
  return (
    <dl className="result-list">
      <div>
        <dt>추가</dt>
        <dd>{result.created}개</dd>
      </div>
      <div>
        <dt>수정</dt>
        <dd>{result.updated}개</dd>
      </div>
      <div>
        <dt>삭제</dt>
        <dd>{result.deleted}개</dd>
      </div>
      <div>
        <dt>건너뜀</dt>
        <dd>
          {result.skipped}개
          {reasons.length > 0 && (
            <span className="result-reasons">
              {reasons.map(([key, n]) => `${SKIP_LABEL[key] ?? key} ${n}`).join(' · ')}
            </span>
          )}
        </dd>
      </div>
    </dl>
  )
}
