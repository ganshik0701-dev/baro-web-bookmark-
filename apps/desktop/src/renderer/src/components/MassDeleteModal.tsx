// 409 MASS_DELETE_CONFIRM_REQUIRED 확인 (DESK-03, SCR-02).
// 이 시점에 서버는 **아무것도 바꾸지 않았다**. 확인하면 메인이 같은 요청에 confirmDeleteCount를 붙여 다시 보낸다.
// 렌더러는 true/false만 보낸다 — 삭제 개수는 메인이 409에서 받은 값을 쓴다.
import { useEffect, useRef } from 'react'
import type { MassDeleteDetails } from '@baro/shared'

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
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="md-title" aria-describedby="md-desc">
        <h2 id="md-title" className="modal-title">
          크롬에 없는 북마크 {details.deleteCount}개를 지울까요?
        </h2>
        <p id="md-desc" className="modal-desc">
          바로에 있는 동기화 북마크 {details.syncedTotal}개 중 {details.deleteCount}개가 사라집니다.{' '}
          <strong>방문 기록도 함께 지워지고 되돌릴 수 없습니다.</strong>
        </p>

        <ul className="modal-preview">
          {details.preview.map((b) => (
            <li key={b.url}>
              <span className="preview-title">{b.title || '(제목 없음)'}</span>
              <span className="preview-url">{b.url}</span>
            </li>
          ))}
          {more > 0 && <li className="preview-more">그 밖에 {more}개</li>}
        </ul>

        <div className="modal-actions">
          <button ref={cancelRef} type="button" className="button-secondary" onClick={() => void window.baro.answerMassDelete(false)}>
            취소
          </button>
          <button type="button" className="button-danger" onClick={() => void window.baro.answerMassDelete(true)}>
            {details.deleteCount}개 지우기
          </button>
        </div>
      </div>
    </div>
  )
}
