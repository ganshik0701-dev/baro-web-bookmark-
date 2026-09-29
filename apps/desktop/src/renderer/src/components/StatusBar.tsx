// 하단 상태바 (SCR-03). 왼쪽은 지금 알릴 것 하나, 오른쪽 끝은 오프라인 배지 자리(DESK-04, v1.1이라 비워 둔다).
// 마지막 동기화 시각·크롬 프로필은 사이드바 아래로 옮겼다

export type StatusMessage = {
  text: string
  error: boolean
  /** 문구 옆 글자 버튼(삭제 '실행 취소') */
  action?: { label: string; onClick: () => void }
}

type Props = {
  /** 왼쪽에 띄울 문구. 없으면 비워 둔다 */
  message: StatusMessage | null
  /** 모달이 열린 동안 Tab이 닿지 않게 */
  inert?: boolean
}

export default function StatusBar({ message, inert }: Props) {
  return (
    <footer className="statusbar" inert={inert}>
      <span className="statusbar-left">
        {/* 비어 있어도 자리를 둔다(나중에 들어온 문구를 스크린리더가 읽게) */}
        <span role="status" className={`statusbar-message${message?.error ? ' is-error' : ''}`}>
          {message?.text}
        </span>
        {message?.action && (
          <button type="button" className="statusbar-action" onClick={message.action.onClick}>
            {message.action.label}
          </button>
        )}
      </span>
      {/* 오프라인 배지 자리(DESK-04 v1.1) */}
      <span className="statusbar-badge" />
    </footer>
  )
}
