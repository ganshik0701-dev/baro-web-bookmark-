// 설정 저장(SEARCH-05 정렬, SCR-05 자동 동기화). 화면은 바로 바꾸고 저장은 뒤에서 한다.
// 요청은 한 번에 하나만. 보내는 사이 값이 또 바뀌면 마지막 값만 기억했다가 끝나면 한 번 더 보낸다.
// 그래서 빠르게 여러 번 바꿔도 요청이 몰리지 않고, 순서가 뒤바뀐 응답 때문에 옛 값이 저장되지 않는다.
import { useCallback, useRef } from 'react'

type Saved = { ok: true } | { error: unknown }

/** onSaved(ok): 마지막 값의 저장이 끝났을 때 한 번(중간 값의 결과는 알리지 않는다) */
export function useLatestSaver<T>(save: (value: T) => Promise<Saved>, onSaved: (ok: boolean) => void): (value: T) => void {
  const sending = useRef(false)
  // 값 자체가 false일 수 있어 '없음'을 따로 표시한다
  const next = useRef<{ value: T } | null>(null)
  const saveRef = useRef(save)
  saveRef.current = save
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  return useCallback((value: T) => {
    if (sending.current) {
      next.current = { value }
      return
    }
    sending.current = true
    void (async () => {
      let v: { value: T } | null = { value }
      while (v) {
        const r = await saveRef.current(v.value)
        v = next.current
        next.current = null
        if (!v) onSavedRef.current(!('error' in r))
      }
      sending.current = false
    })()
  }, [])
}
