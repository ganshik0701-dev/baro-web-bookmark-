// 1주차 확인용 카드. 개발 모드(pnpm dev:desktop)에서만 보인다. SCR-03이 들어올 때 지운다
import { useState } from 'react'
import type { HealthResponse } from '@baro/shared'

// 화면에 주소를 보여주는 용도로만 쓴다. 실제 요청은 메인 프로세스가 같은 값으로 보낸다
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1'

type HealthState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: HealthResponse }
  | { kind: 'error'; message: string }

export default function DevApiCard() {
  const [health, setHealth] = useState<HealthState>({ kind: 'idle' })

  async function checkHealth() {
    setHealth({ kind: 'loading' })
    try {
      // 렌더러는 fetch하지 않는다. preload → IPC → 메인 프로세스가 요청한다 (CORS 없음)
      const body = await window.baro.getHealth()
      if ('error' in body) {
        setHealth({ kind: 'error', message: `${body.error.code}: ${body.error.message}` })
      } else {
        setHealth({ kind: 'ok', data: body.data })
      }
    } catch (err) {
      setHealth({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <section className="card" aria-labelledby="dev-api-title">
      <h2 id="dev-api-title" className="section-title">
        API 연결 (개발 모드)
      </h2>
      <p className="caption">{API_BASE}</p>
      <button type="button" className="button-secondary" onClick={checkHealth} disabled={health.kind === 'loading'}>
        API 상태 확인
      </button>
      <p role="status" className="card-status">
        {health.kind === 'loading' && '확인 중…'}
        {health.kind === 'ok' && (
          <span className="success">
            정상 · 버전 {health.data.version} · {health.data.time}
          </span>
        )}
        {health.kind === 'error' && <span className="danger">실패 · {health.message}</span>}
      </p>
    </section>
  )
}
