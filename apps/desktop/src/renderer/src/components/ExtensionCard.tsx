// SCR-05 설정의 확장 프로그램 카드 (EXT-01, docs/01-spec.md '설정 화면 규칙'의 '확장 프로그램 카드', 시안 '8 · 설정').
// 토큰 목록(최대 5개) · 발급(원본은 이때 한 번만) · 폐기(그 줄에서 한 번 더 묻는다).
// 원본은 이 컴포넌트의 state에만 둔다. 설정을 떠나면(언마운트) 사라지고, 저장·기록하지 않는다
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createTokenInput, type ApiToken, type IssuedApiToken } from '@baro/shared'
import { relativeTime } from '../lib/relative-time'
import { useNow } from '../lib/use-now'

/** 사용자당 토큰 수(서버 DB 트리거와 같다, docs/03-api.md POST /tokens) */
const TOKEN_LIMIT = 5

type ListState = { status: 'loading' } | { status: 'error' } | { status: 'ok'; tokens: ApiToken[] }

export default function ExtensionCard() {
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [name, setName] = useState('이 PC 크롬')
  const [nameError, setNameError] = useState<string | null>(null)
  const [issueError, setIssueError] = useState<string | null>(null)
  const [issuing, setIssuing] = useState(false)
  const [issued, setIssued] = useState<IssuedApiToken | null>(null)
  const now = useNow(60_000)

  async function load() {
    setList({ status: 'loading' })
    const r = await window.baro.listTokens().catch(() => null)
    setList(r && 'data' in r ? { status: 'ok', tokens: r.data } : { status: 'error' })
  }

  useEffect(() => {
    void load()
  }, [])

  async function issue() {
    // 메인도 같은 스키마로 다시 검사한다. 여기서는 칸 아래에 문구를 보이려고 먼저 본다
    const check = createTokenInput.safeParse({ name })
    if (!check.success) {
      setNameError(check.error.issues[0]?.message ?? '토큰 이름을 확인하세요')
      return
    }
    setIssuing(true)
    setIssueError(null)
    try {
      const r = await window.baro.createToken(check.data.name)
      if ('data' in r) {
        setIssued(r.data)
        // 목록에는 원본을 빼고 넣는다
        const { token: _raw, ...listed } = r.data
        setList((l) => (l.status === 'ok' ? { status: 'ok', tokens: [listed, ...l.tokens] } : l))
      } else {
        setIssueError(r.error.message)
      }
    } finally {
      setIssuing(false)
    }
  }

  function removed(id: string) {
    setList((l) => (l.status === 'ok' ? { status: 'ok', tokens: l.tokens.filter((t) => t.id !== id) } : l))
    if (issued?.id === id) setIssued(null)
  }

  const count = list.status === 'ok' ? list.tokens.length : null
  const full = count !== null && count >= TOKEN_LIMIT

  return (
    <>
      <p className="settings-note">
        크롬에서 북마크를 추가하거나 지울 때 바로 반영하려면 확장을 설치하고, 아래 토큰을 확장 팝업에 붙여 넣으세요. 토큰은
        발급할 때 한 번만 보입니다.
        <br />
        앱과 확장을 함께 쓰면, 동기화 도중 크롬에서 막 추가한 북마크가 드물게 지워질 수 있습니다. 다음 동기화에서 돌아옵니다.
      </p>

      {issued && <NewToken token={issued} />}

      {list.status === 'loading' && <p className="settings-detail">토큰 목록을 불러오는 중…</p>}
      {list.status === 'error' && (
        <div className="settings-row">
          <span className="settings-detail is-error" role="alert">
            토큰 목록을 불러오지 못했습니다
          </span>
          <button type="button" className="button-secondary settings-button settings-button-small" onClick={() => void load()}>
            다시 시도
          </button>
        </div>
      )}
      {list.status === 'ok' && list.tokens.length > 0 && (
        <ul className="token-list">
          {list.tokens.map((t) => (
            <TokenRow key={t.id} token={t} now={now} onRemoved={removed} />
          ))}
        </ul>
      )}

      <div className="token-issue">
        <div className="token-issue-field">
          <label htmlFor="token-name" className="token-issue-label">
            새 토큰 이름
          </label>
          <input
            id="token-name"
            className="input token-input"
            type="text"
            maxLength={30}
            autoComplete="off"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameError(null)
              setIssueError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !full && !issuing && list.status === 'ok') void issue()
            }}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'token-name-error' : full ? 'token-limit' : undefined}
            disabled={issuing}
          />
        </div>
        <button
          type="button"
          className="button-primary settings-button"
          onClick={() => void issue()}
          disabled={issuing || full || list.status !== 'ok'}
        >
          {issuing ? '발급하는 중…' : '새 토큰 발급'}
        </button>
      </div>
      {nameError && (
        <p id="token-name-error" className="settings-detail is-error">
          {nameError}
        </p>
      )}
      {issueError && (
        <p className="settings-detail is-error" role="alert">
          {issueError}
        </p>
      )}
      {full && (
        <p id="token-limit" className="settings-detail">
          토큰은 {TOKEN_LIMIT}개까지 만들 수 있습니다. 쓰지 않는 것을 폐기하세요.
        </p>
      )}
    </>
  )
}

/** 방금 발급한 토큰의 원본 + [복사]. 원본은 이 화면에서만 보인다 */
function NewToken({ token }: { token: IssuedApiToken }) {
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle')
  const rawRef = useRef<HTMLSpanElement>(null)

  // 다른 토큰을 새로 발급하면 복사 상태를 처음으로
  useEffect(() => setCopyState('idle'), [token.id])
  useEffect(() => {
    if (copyState !== 'done') return
    const id = window.setTimeout(() => setCopyState('idle'), 2000)
    return () => window.clearTimeout(id)
  }, [copyState])

  async function copy() {
    try {
      await navigator.clipboard.writeText(token.token)
      setCopyState('done')
    } catch {
      // 창에 포커스가 없거나 권한이 없으면 실패한다. 직접 복사할 수 있게 글자를 선택해 둔다
      setCopyState('failed')
      const el = rawRef.current
      if (el) window.getSelection()?.selectAllChildren(el)
    }
  }

  return (
    <div className="token-new">
      <span className="token-new-label">새 토큰 ‘{token.name}’ · 지금 복사해 두세요. 이 화면을 떠나면 다시 볼 수 없습니다.</span>
      <span className="token-new-row">
        <span ref={rawRef} className="token-raw" title={token.token}>
          {token.token}
        </span>
        <button type="button" className="button-primary settings-button settings-button-small" onClick={() => void copy()}>
          <span role="status">{copyState === 'done' ? '복사했습니다' : '복사'}</span>
        </button>
      </span>
      {copyState === 'failed' && (
        <span className="settings-detail is-error" role="alert">
          복사하지 못했습니다. 토큰을 직접 선택해 복사하세요
        </span>
      )}
    </div>
  )
}

/** 토큰 한 줄. 폐기는 그 줄에서 한 번 더 묻는다 */
function TokenRow({ token, now, onRemoved }: { token: ApiToken; now: number; onRemoved: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const revokeRef = useRef<HTMLButtonElement>(null)

  // 물을 때는 [취소]에, 묻기를 닫으면 [폐기]로 포커스
  const opened = useRef(false)
  useEffect(() => {
    if (confirming) {
      opened.current = true
      cancelRef.current?.focus()
    } else if (opened.current) {
      opened.current = false
      revokeRef.current?.focus()
    }
  }, [confirming])

  async function revoke() {
    setRevoking(true)
    setError(null)
    const r = await window.baro.revokeToken(token.id).catch(() => null)
    if (r && 'ok' in r) {
      onRemoved(token.id)
      return
    }
    setRevoking(false)
    setError(r && 'error' in r ? `폐기하지 못했습니다 · ${r.error.message}` : '폐기하지 못했습니다')
  }

  // 묻는 중 Esc는 묻기만 닫는다(설정 화면은 그대로)
  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (confirming && e.key === 'Escape' && !revoking) {
      e.preventDefault()
      setConfirming(false)
    }
  }

  const rel = token.lastUsedAt ? relativeTime(token.lastUsedAt, now) : null
  const used = rel === null ? '아직 쓰이지 않음' : rel === '방금' ? '방금 사용' : `최근 사용 ${rel}`

  return (
    <li className="token-row" onKeyDown={onKeyDown}>
      {confirming ? (
        <>
          <span className="settings-text">
            <span className="settings-name">폐기할까요? 이 토큰을 쓰는 확장은 바로 끊깁니다</span>
            <span className="settings-detail">
              {token.name} · {token.prefix}…
            </span>
          </span>
          <span className="token-actions">
            <button type="button" className="button-danger settings-button settings-button-small" onClick={() => void revoke()} disabled={revoking}>
              {revoking ? '폐기하는 중…' : '폐기'}
            </button>
            <button
              ref={cancelRef}
              type="button"
              className="button-secondary settings-button settings-button-small"
              onClick={() => setConfirming(false)}
              disabled={revoking}
            >
              취소
            </button>
          </span>
        </>
      ) : (
        <>
          <span className="settings-text">
            <span className="settings-name">{token.name}</span>
            <span className="settings-detail">
              {token.prefix}… · {used}
            </span>
          </span>
          <button
            ref={revokeRef}
            type="button"
            className="button-secondary settings-button settings-button-small"
            onClick={() => setConfirming(true)}
          >
            폐기
          </button>
        </>
      )}
      {error && (
        <span className="settings-detail is-error token-row-error" role="alert">
          {error}
        </span>
      )}
    </li>
  )
}
