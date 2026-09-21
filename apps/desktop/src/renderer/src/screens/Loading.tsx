import { useEffect, useState } from 'react'

// 자동 로그인 확인 중. 저장된 로그인이 없으면 몇 ms 만에 끝나므로 처음 300ms는 배경만 보여준다.
// 짧게 끝날 때 문구가 번쩍였다 사라지는 것을 막기 위해서다
const SHOW_AFTER_MS = 300

export default function Loading() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <main className="loading">
      {/* 상태 영역은 처음부터 두고 내용만 채운다. 그래야 스크린리더가 바뀐 내용을 읽는다 */}
      <p role="status" className="loading-text">
        {visible && '저장된 로그인 확인 중…'}
      </p>
    </main>
  )
}
