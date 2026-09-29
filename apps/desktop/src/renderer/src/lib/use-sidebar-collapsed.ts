// 사이드바 접힘 상태 (docs/01-spec.md '사이드바 규칙'의 '접기').
// 상태는 둘이다. 사용자가 접은 것(버튼으로만 바뀌고 기억한다)과 창 때문에 접힌 것(창이 좁을 때, 기억하지 않는다).
// 둘 중 하나라도 참이면 접혀 보인다. 그래서 창을 다시 넓히면 사용자 설정으로 돌아간다.
// 사용자 설정은 이 PC에만 기억한다: 창 크기와 관련된 설정이라 PC마다 다른 게 자연스럽다(서버에 두면 큰 모니터와 노트북이 묶인다).
// renderer localStorage는 이 PC의 앱 데이터 폴더(userData)에 저장된다. 읽기·쓰기에 실패하면 편 상태로 둔다
import { useCallback, useState, useSyncExternalStore } from 'react'

const KEY = 'baro.sidebarCollapsed'
/** tokens.css를 못 읽었을 때의 기본값. docs/04-design.md '좁은 창' */
const DEFAULT_AUTO_COLLAPSE = 650

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** 창 안쪽 폭이 --sidebar-auto-collapse보다 좁은지 알려 주는 media query */
function narrowQuery(): MediaQueryList {
  const raw = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-auto-collapse'))
  const px = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_AUTO_COLLAPSE
  return window.matchMedia(`(width < ${px}px)`)
}

function subscribeNarrow(onChange: () => void): () => void {
  const mq = narrowQuery()
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

const isNarrow = () => narrowQuery().matches

export type SidebarCollapse = {
  /** 화면에 접혀 보이는가(사용자가 접었거나 창이 좁다) */
  collapsed: boolean
  /** 창이 좁아 접혀 있는가. 이때 펴기 버튼은 비활성 */
  narrow: boolean
  /** 사용자 설정만 바꾼다(창 때문에 접힌 것은 기억하지 않는다) */
  toggle: () => void
}

export function useSidebarCollapsed(): SidebarCollapse {
  const [userCollapsed, setUserCollapsed] = useState(read)
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow)
  const toggle = useCallback(() => {
    setUserCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(KEY, next ? '1' : '0')
      } catch {
        // 기억하지 못해도 이번 실행 동안은 접히고 펴진다
      }
      return next
    })
  }, [])
  return { collapsed: userCollapsed || narrow, narrow, toggle }
}
