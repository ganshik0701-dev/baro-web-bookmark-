import { useEffect, useRef } from 'react'

// 화면이 바뀌면 창 제목을 바꾸고 그 화면의 제목(h1, tabIndex=-1)으로 포커스를 옮긴다.
// 스크린리더 사용자가 화면이 바뀐 것을 알 수 있게 하기 위해서다
export function useScreenTitle(title: string) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    document.title = title
    headingRef.current?.focus()
  }, [title])
  return headingRef
}
