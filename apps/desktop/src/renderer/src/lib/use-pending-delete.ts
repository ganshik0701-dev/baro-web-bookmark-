// BM-05 삭제와 5초 실행 취소 (docs/01-spec.md '열기와 보조 메뉴 규칙').
// 누르면 타일을 바로 숨기고 5초 뒤에 DELETE를 보낸다. 그 사이 '실행 취소'하면 아무 요청도 가지 않는다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Bookmark } from '@baro/shared'
import { BOOKMARKS_KEY } from './queries'

export const UNDO_MS = 5_000

type Options = {
  /** DELETE가 실패했을 때(타일은 이미 되살렸다) */
  onFailed: (bookmark: Bookmark, message: string) => void
}

export function usePendingDelete({ onFailed }: Options) {
  const qc = useQueryClient()
  // 실행 취소를 기다리는 것(늘 하나)
  const [pending, setPending] = useState<Bookmark | null>(null)
  // 화면에서 숨길 id: 기다리는 것 + 보냈지만 아직 답이 안 온 것.
  // 그 사이 목록을 다시 받아도(포커스·동기화) 되살아나 보이지 않게 한다
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const timer = useRef<number | undefined>(undefined)
  const pendingRef = useRef<Bookmark | null>(null)
  const onFailedRef = useRef(onFailed)
  onFailedRef.current = onFailed

  const unhide = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  /** 지금 보낸다. 성공하면 캐시에서 빼고, 실패하면 되살린다 */
  const commit = useCallback(
    async (b: Bookmark) => {
      if (pendingRef.current?.id === b.id) {
        pendingRef.current = null
        setPending(null)
      }
      const r = await window.baro.deleteBookmark(b.id)
      if ('error' in r) {
        unhide(b.id)
        onFailedRef.current(b, r.error.message)
        return
      }
      qc.setQueryData<Bookmark[]>(BOOKMARKS_KEY, (list) => list?.filter((x) => x.id !== b.id))
      unhide(b.id)
    },
    [qc, unhide]
  )

  const start = useCallback(
    (b: Bookmark) => {
      // 기다리는 것이 있으면 그것은 바로 보낸다. 실행 취소는 늘 마지막 하나만
      const previous = pendingRef.current
      window.clearTimeout(timer.current)
      if (previous) void commit(previous)

      pendingRef.current = b
      setPending(b)
      setHidden((prev) => new Set(prev).add(b.id))
      timer.current = window.setTimeout(() => void commit(b), UNDO_MS)
    },
    [commit]
  )

  const undo = useCallback(() => {
    const b = pendingRef.current
    if (!b) return
    window.clearTimeout(timer.current)
    pendingRef.current = null
    setPending(null)
    unhide(b.id)
  }, [unhide])

  // 화면이 사라지면(로그아웃·앱 종료) 기다리던 삭제는 보내지 않고 버린다. 지워지지 않는 쪽이 안전하다
  useEffect(() => () => window.clearTimeout(timer.current), [])

  return { pending, hidden, start, undo }
}
