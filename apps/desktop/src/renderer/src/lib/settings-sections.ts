// 설정 화면의 카드 셋 (docs/01-spec.md '설정 화면 규칙 (SCR-05)'). 사이드바 목록과 본문 카드가 같은 순서·이름을 쓴다
export const SETTINGS_SECTIONS = ['sync', 'extension', 'account'] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export const SETTINGS_LABELS: Record<SettingsSection, string> = {
  sync: '동기화',
  extension: '확장 프로그램',
  account: '계정'
}

/** 본문 카드의 id. 사이드바가 이 id로 스크롤한다 */
export const settingsCardId = (s: SettingsSection): string => `settings-${s}`
