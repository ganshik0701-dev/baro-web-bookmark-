// SEARCH-05 정렬 저장 (docs/01-spec.md '정렬 규칙'). 화면은 바로 바꾸고 저장은 뒤에서 한다.
// 요청은 한 번에 하나만. 보내는 사이 선택이 또 바뀌면 마지막 값만 기억했다가 끝나면 한 번 더 보낸다.
// 그래서 드롭다운을 방향키로 훑어도 요청이 몰리지 않고, 순서가 뒤바뀐 응답 때문에 옛 값이 저장되지 않는다.
import { useCallback, useRef } from 'react'
import type { SortOption } from './order'

/** onSaved(ok): 마지막 값의 저장이 끝났을 때 한 번(중간 값의 결과는 알리지 않는다) */
export function useSortSaver(onSaved: (ok: boolean) => void): (value: SortOption) => void {
  const sending = useRef(false)
  const next = useRef<SortOption | null>(null)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  return useCallback((value: SortOption) => {
    if (sending.current) {
      next.current = value
      return
    }
    sending.current = true
    void (async () => {
      let v: SortOption | null = value
      while (v) {
        const r = await window.baro.saveSortOption(v)
        v = next.current
        next.current = null
        if (!v) onSavedRef.current(!('error' in r))
      }
      sending.current = false
    })()
  }, [])
}
