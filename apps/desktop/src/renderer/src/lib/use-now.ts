// '3분 전' 같은 상대 시각이 멈춰 있지 않게 정해진 간격으로 다시 그린다(사이드바·상태바)
import { useEffect, useState } from 'react'

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
