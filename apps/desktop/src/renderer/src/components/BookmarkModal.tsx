// SCR-04 북마크 추가·수정 모달 (docs/01-spec.md '추가·수정 모달 규칙', 시안 보드 '북마크 추가·수정').
// 요청은 메인이 한다(createBookmark·updateBookmark·fetchMetadata). 검증은 서버와 같은 shared 스키마.
// 낙관적 업데이트는 하지 않는다: 저장 응답을 받은 뒤 캐시에 그 항목만 넣거나 바꾼다.
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createBookmarkInput, httpUrl, updateBookmarkInput, type Bookmark } from '@baro/shared'
import { BOOKMARKS_KEY, upsertBookmarkInCache } from '../lib/queries'
import { isFromChrome, tileLabel } from '../lib/tile'
import TileIcon from './TileIcon'

export type BookmarkModalMode = { kind: 'add' } | { kind: 'edit'; bookmark: Bookmark }

type Props = {
  initial: BookmarkModalMode
  /** 409일 때 기존 북마크를 여기서 먼저 찾는다 */
  bookmarks: Bookmark[]
  /** 409 '기존 북마크 열기'. 열기와 방문 기록은 HomeScreen의 열기와 같다 */
  onOpen: (bookmark: Bookmark) => void
  onClose: () => void
}

/** 주소 칸 값 → 저장할 주소. 틀리면 null */
function parseUrl(raw: string): string | null {
  const r = httpUrl.safeParse(raw)
  return r.success ? r.data : null
}

/** 가져온 아이콘과 그 주소. 주소가 바뀌면 옛 아이콘을 쓰지 않는다 */
type Meta = { forUrl: string; iconUrl: string | null }

/** 409에서 찾은 기존 북마크. 캐시·다시 받은 목록 어디에도 없으면 null */
type Duplicate = { existing: Bookmark | null }

// 아이콘 미리보기는 그리드 중간 크기 타일과 같다
const PREVIEW_STYLE = { '--tile-size': 'var(--tile-size-md)' } as CSSProperties

export default function BookmarkModal({ initial, bookmarks, onOpen, onClose }: Props) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<BookmarkModalMode>(initial)
  const editing = mode.kind === 'edit' ? mode.bookmark : null

  const [url, setUrl] = useState(editing?.url ?? '')
  const [title, setTitle] = useState(editing?.title ?? '')
  // 미리보기와 저장에 쓰는 주소·아이콘. 입력할 때마다가 아니라 주소 칸에서 포커스가 빠질 때 정한다
  // (글자마다 바꾸면 파비콘 요청이 글자 수만큼 나간다)
  const [committedUrl, setCommittedUrl] = useState<string | null>(editing?.url ?? null)
  const [meta, setMetaState] = useState<Meta | null>(editing ? { forUrl: editing.url, iconUrl: editing.iconUrl } : null)
  // 저장이 가져오기를 기다린 직후 읽으므로 ref에도 둔다(state는 다음 그리기 전까지 옛 값이다)
  const metaRef = useRef(meta)
  const setMeta = (m: Meta | null) => {
    metaRef.current = m
    setMetaState(m)
  }
  const [fetching, setFetching] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null)

  // 같은 주소로 /metadata를 두 번 부르지 않게. 수정 모드는 원래 주소를 이미 가져온 것으로 본다
  const lastFetched = useRef<string | null>(editing?.url ?? null)
  // 늦게 온 응답을 버리기 위한 번호
  const fetchSeq = useRef(0)
  const pendingMeta = useRef<Promise<void> | null>(null)
  const titleRef = useRef(title)
  titleRef.current = title

  const dialogRef = useRef<HTMLFormElement>(null)
  const urlInput = useRef<HTMLInputElement>(null)
  const titleInput = useRef<HTMLInputElement>(null)

  // 처음 포커스: 추가는 주소 칸, 수정은 제목 칸
  useEffect(() => {
    ;(mode.kind === 'edit' ? titleInput : urlInput).current?.focus()
  }, [mode])

  /** 주소 칸에서 포커스가 빠질 때. 새 주소면 제목·아이콘을 가져온다 */
  const commitUrl = () => {
    if (!url.trim()) return
    const parsed = parseUrl(url)
    if (!parsed) {
      setUrlError(httpUrl.safeParse(url).error?.issues[0]?.message ?? '올바른 주소가 아닙니다')
      return
    }
    setUrlError(null)
    setCommittedUrl(parsed)
    if (parsed === lastFetched.current) return
    lastFetched.current = parsed

    const seq = ++fetchSeq.current
    setFetching(true)
    pendingMeta.current = window.baro.fetchMetadata(parsed).then((r) => {
      // 그사이 다른 주소를 가져오기 시작했으면 이 결과는 버린다
      if (seq !== fetchSeq.current) return
      setFetching(false)
      // 실패(400·422·시간 초과)는 알리지 않는다. 빈 제목이면 서버가 도메인을 쓴다
      if ('error' in r) {
        setMeta({ forUrl: parsed, iconUrl: null })
        return
      }
      setMeta({ forUrl: parsed, iconUrl: r.data.iconUrl })
      // 사용자가 쓴 제목은 덮어쓰지 않는다. ref도 바로 바꿔 둔다(저장이 이 결과를 기다렸다가 곧바로 읽는다)
      if (!titleRef.current.trim() && r.data.title) {
        titleRef.current = r.data.title
        setTitle(r.data.title)
      }
    })
  }

  /** 입력을 고치면 중복 표시·저장 오류는 사라진다 */
  const edited = () => {
    setDuplicate(null)
    setSaveError(null)
  }

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      // 주소 칸에서 바로 Enter를 눌러 아직 안 가져왔으면 지금 가져온다. 가져오는 중이면 그 결과(제목)를 기다린다(서버가 3초에 끊는다)
      const typed = parseUrl(url)
      if (typed && typed !== lastFetched.current) commitUrl()
      if (pendingMeta.current) await pendingMeta.current

      const parsed = parseUrl(url)
      const m = metaRef.current
      const iconUrl = parsed && m?.forUrl === parsed ? m.iconUrl : null
      const result = editing
        ? await saveEdit(editing, parsed, iconUrl)
        : await saveAdd(parsed, iconUrl)
      if (!result) return
      if ('data' in result) {
        upsertBookmarkInCache(qc, result.data)
        onClose()
        return
      }
      if (result.error.code === 'DUPLICATE_URL') {
        await showDuplicate(result.error.details)
        return
      }
      setSaveError(`저장하지 못했습니다 · ${result.error.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function saveAdd(parsed: string | null, iconUrl: string | null) {
    const input = { url, title: titleRef.current, ...(parsed && iconUrl ? { iconUrl } : {}) }
    const check = createBookmarkInput.safeParse(input)
    if (!check.success) return showFieldErrors(check.error.issues)
    return window.baro.createBookmark(input)
  }

  /** 수정은 바뀐 칸만 보낸다. 바뀐 것이 없으면 요청 없이 닫는다 */
  async function saveEdit(b: Bookmark, parsed: string | null, iconUrl: string | null) {
    const fields: { url?: string; title?: string; iconUrl?: string | null } = {}
    if (parsed === null || parsed !== b.url) {
      fields.url = url
      fields.iconUrl = iconUrl
    }
    if (titleRef.current.trim() !== b.title) fields.title = titleRef.current
    if (Object.keys(fields).length === 0) {
      onClose()
      return null
    }
    const check = updateBookmarkInput.safeParse(fields)
    if (!check.success) return showFieldErrors(check.error.issues)
    return window.baro.updateBookmark(b.id, fields)
  }

  function showFieldErrors(issues: { path: (string | number)[]; message: string }[]): null {
    setUrlError(issues.find((i) => i.path[0] === 'url')?.message ?? null)
    setTitleError(issues.find((i) => i.path[0] === 'title')?.message ?? null)
    const other = issues.find((i) => i.path[0] !== 'url' && i.path[0] !== 'title')
    if (other) setSaveError(other.message)
    return null
  }

  /** 409: 기존 북마크를 캐시에서 찾고, 없으면 목록을 다시 받아 찾는다 */
  async function showDuplicate(details: unknown) {
    const id = (details as { existingId?: unknown } | undefined)?.existingId
    let existing = bookmarks.find((b) => b.id === id) ?? null
    if (!existing && typeof id === 'string') {
      await qc.invalidateQueries({ queryKey: BOOKMARKS_KEY })
      existing = qc.getQueryData<Bookmark[]>(BOOKMARKS_KEY)?.find((b) => b.id === id) ?? null
    }
    setDuplicate({ existing })
  }

  /** 409 '기존 북마크 수정': 그 북마크의 수정 모드로 바꾼다(입력하던 값은 버린다) */
  const switchToEdit = (b: Bookmark) => {
    fetchSeq.current++
    pendingMeta.current = null
    lastFetched.current = b.url
    setMode({ kind: 'edit', bookmark: b })
    setUrl(b.url)
    setTitle(b.title)
    setCommittedUrl(b.url)
    setMeta({ forUrl: b.url, iconUrl: b.iconUrl })
    setFetching(false)
    setUrlError(null)
    setTitleError(null)
    setSaveError(null)
    setDuplicate(null)
  }

  // Esc는 닫기(저장 중에는 무시), Tab은 모달 밖으로 나가지 않는다
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (!saving) onClose()
      return
    }
    if (e.key !== 'Tab' || !dialogRef.current) return
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('input, button')].filter(
      (el) => !(el as HTMLInputElement | HTMLButtonElement).disabled
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last?.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first?.focus()
    }
  }

  const heading = mode.kind === 'edit' ? '북마크 수정' : '북마크 추가'
  const previewUrl = committedUrl ?? ''
  const previewIcon = committedUrl && meta?.forUrl === committedUrl ? meta.iconUrl : null
  const existing = duplicate?.existing ?? null
  const existingFromChrome = existing ? isFromChrome(existing.source) : false

  return (
    <div className="modal-backdrop">
      <form
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bm-title"
        aria-describedby={duplicate ? 'bm-duplicate' : undefined}
        onSubmit={(e) => void save(e)}
        onKeyDown={onKeyDown}
        noValidate
      >
        <h2 id="bm-title" className="modal-title">
          {heading}
        </h2>

        <div className="field">
          <label htmlFor="bm-url" className="field-label">
            주소
          </label>
          <input
            ref={urlInput}
            id="bm-url"
            className="input"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setUrlError(null)
              edited()
            }}
            onBlur={commitUrl}
            aria-invalid={urlError ? true : undefined}
            aria-describedby={urlError ? 'bm-url-error' : undefined}
            disabled={saving}
          />
          {urlError && (
            <p id="bm-url-error" className="field-error">
              {urlError}
            </p>
          )}
        </div>

        <div className="bm-title-row">
          <span className="bm-preview" style={PREVIEW_STYLE}>
            <TileIcon title={title} url={previewUrl} iconUrl={previewIcon} />
          </span>
          <div className="field">
            <label htmlFor="bm-name" className="field-label">
              제목
            </label>
            <input
              ref={titleInput}
              id="bm-name"
              className="input"
              type="text"
              maxLength={100}
              autoComplete="off"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleError(null)
                edited()
              }}
              aria-invalid={titleError ? true : undefined}
              aria-describedby={titleError ? 'bm-name-error' : fetching ? 'bm-fetching' : undefined}
              disabled={saving}
            />
          </div>
        </div>
        {/* 제목 칸 아래 줄: 오류가 먼저, 없으면 가져오는 중 */}
        {titleError ? (
          <p id="bm-name-error" className="field-error">
            {titleError}
          </p>
        ) : (
          fetching && (
            <p id="bm-fetching" className="field-hint" role="status">
              제목을 가져오는 중…
            </p>
          )
        )}

        {duplicate ? (
          <>
            <div id="bm-duplicate" className="bm-duplicate" role="status">
              <p className="bm-duplicate-title">
                <strong>이미 저장된 주소입니다</strong>
                {existing && <> · ‘{tileLabel(existing.title, existing.url)}’</>}
              </p>
              {existingFromChrome && (
                <p className="bm-duplicate-note">
                  크롬에서 온 북마크라 여기서 고칠 수 없습니다. 크롬에서 고치면 다음 동기화 때 반영됩니다.
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="button-secondary" onClick={onClose}>
                취소
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={!existing || existingFromChrome}
                onClick={() => existing && switchToEdit(existing)}
              >
                기존 북마크 수정
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={!existing}
                onClick={() => {
                  if (!existing) return
                  onOpen(existing)
                  onClose()
                }}
              >
                기존 북마크 열기
              </button>
            </div>
          </>
        ) : (
          <>
            {saveError && (
              <p className="field-error" role="alert">
                {saveError}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="button-secondary" onClick={onClose} disabled={saving}>
                취소
              </button>
              <button type="submit" className="button-primary" disabled={saving}>
                {saving ? '저장하는 중…' : '저장'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
