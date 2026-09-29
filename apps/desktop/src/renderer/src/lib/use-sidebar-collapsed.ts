// 사이드바 접힘 상태 (docs/01-spec.md '사이드바 규칙'의 '접기').
// 이 PC에만 기억한다: 창 크기와 관련된 설정이라 PC마다 다른 게 자연스럽다(서버에 두면 큰 모니터와 노트북이 묶인다).
// renderer localStorage는 이 PC의 앱 데이터 폴더(userData)에 저장된다. 읽기·쓰기에 실패하면 편 상태로 둔다
import { useCallback, useState } from 'react'

const KEY = 'baro.sidebarCollapsed'

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(read)
  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(KEY, next ? '1' : '0')
      } catch {
        // 기억하지 못해도 이번 실행 동안은 접히고 펴진다
      }
      return next
    })
  }, [])
  return [collapsed, toggle]
}
