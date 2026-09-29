// 409 MASS_DELETE_CONFIRM_REQUIRED 확인 (DESK-03, SCR-02. 시안 '7 · 대량 삭제 확인').
// 이 시점에 서버는 **아무것도 바꾸지 않았다**. 확인하면 메인이 같은 요청에 confirmDeleteCount를 붙여 다시 보낸다.
// 렌더러는 true/false만 보낸다 — 삭제 개수는 메인이 409에서 받은 값을 쓴다.
import { useEffect, useRef } from 'react'
import type { MassDeleteDetails } from '@baro/shared'
import { tileColor, tileHost, tileLabel, tileLetter } from '../lib/tile'
import { letterTileStyle } from './TileIcon'

export default function MassDeleteModal({ details }: { details: MassDeleteDetails }) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // 위험한 쪽(지우기)이 아니라 취소에 처음 포커스를 둔다
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Esc는 취소와 같다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void window.baro.answerMassDelete(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const more = details.deleteCount - details.preview.length

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide" role="alertdialog" aria-modal="true" aria-labelledby="md-title" aria-describedby="md-desc">
        <h2 id="md-title" className="modal-title">
          크롬에 없는 북마크 {details.deleteCount}개를 지웁니다
        </h2>
        <p id="md-desc" className="modal-desc">
          동기화된 {details.syncedTotal}개 중 {details.deleteCount}개입니다. 지우면 방문 기록도 함께 사라져 되돌릴 수 없습니다.
        </p>

        <div className="md-samples">
          <p className="md-samples-title" id="md-samples-title">
            지워질 북마크 예시
          </p>
          <ul className="md-samples-list" aria-labelledby="md-samples-title">
            {details.preview.map((b) => (
              <li key={b.url} className="md-sample">
                <span className="md-sample-tile" style={letterTileStyle(tileColor(b.url))} aria-hidden="true">
                  {tileLetter(b.title, b.url)}
                </span>
                <span className="md-sample-title">{tileLabel(b.title, b.url)}</span>
                <span className="md-sample-domain">{tileHost(b.url)}</span>
              </li>
            ))}
          </ul>
          {more > 0 && <p className="md-samples-more">외 {more}개</p>}
        </div>

        <div className="modal-actions">
          <button ref={cancelRef} type="button" className="button-secondary" onClick={() => void window.baro.answerMassDelete(false)}>
            취소
          </button>
          <button type="button" className="button-danger" onClick={() => void window.baro.answerMassDelete(true)}>
            지우고 동기화
          </button>
        </div>
      </div>
    </div>
  )
}

