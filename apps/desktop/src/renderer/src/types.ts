// 메인 프로세스가 IPC로 넘겨주는 값의 타입. 타입만 가져오므로 번들에 메인 코드가 들어가지 않는다.
export type { ChromeProfile } from '../../main/chrome-profiles'
export type { ChromeReadResult, ChromeSelection } from '../../main/chrome-selection'
export type { SyncState } from '../../main/sync'
