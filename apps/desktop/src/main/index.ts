import { app, BrowserWindow, dialog, shell, ipcMain, type OpenDialogOptions } from 'electron'
import { join } from 'node:path'
import type { ApiFailure, ApiSuccess, HealthResponse, MassDeleteDetails } from '@baro/shared'
import { API_BASE, fetchMe } from './api'
import {
  cancelLogin,
  forceRefresh,
  getAccessToken,
  getAuthStatus,
  initAuth,
  login,
  logout,
  onAuthChange
} from './auth'
import { initialSyncState, runSync, type SyncState, type SyncTrigger } from './sync'
import { readBookmarksFile } from './chrome-bookmarks'
import { findChromeProfiles } from './chrome-profiles'
import {
  getChromeSelection,
  selectChromeFile,
  selectChromeProfile,
  type ChromeReadResult
} from './chrome-selection'

// API 서버 주소는 api.ts에 있다(인증 호출과 같은 값을 쓰기 위해).
// 아래 callApi는 인증이 필요 없는 health 전용이다.
//
// 앱의 모든 API 호출이 지나는 곳 (CLAUDE.md: 앱의 API 호출은 메인 프로세스에서만).
// 메인 프로세스(Node)의 fetch는 Origin 헤더를 붙이지 않아서 CORS와 무관하다.
// path에는 코드에 고정된 값만 넘긴다. 렌더러가 보낸 문자열을 그대로 넣지 않는다.
async function callApi<T>(path: `/${string}`): Promise<ApiSuccess<T> | ApiFailure> {
  const res = await fetch(`${API_BASE}${path}`, {
    // 3주차(AUTH-01·02): 메모리에 있는 액세스 토큰을 여기서 붙인다.
    //   headers: { Authorization: `Bearer ${accessToken}` },
    // 토큰은 렌더러로 돌려보내지 않고, 로그에도 찍지 않는다.
    signal: AbortSignal.timeout(5000)
  })
  // 서버가 JSON이 아닌 응답(HTML 에러 페이지 등)을 주면 파싱 에러 대신 상태 코드를 알린다
  const body = (await res.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null
  if (!body) throw new Error(`서버가 ${res.status}로 응답했습니다`)
  return body
}

// 창 하나만 띄운다. 트레이·전역 단축키(DESK-05, DESK-06)는 v1.1에서 여기에 붙는다.
function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#F7F5F0',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 보안 기본값 (CLAUDE.md 참고): 렌더러에서 Node를 쓰지 않는다
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // 렌더러가 새 창을 열려고 하면 OS 기본 브라우저로 넘긴다 (DESK-08의 토대)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// IPC 핸들러. 렌더러는 preload가 열어 준 함수로만 이걸 부른다.
function registerIpc(): void {
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('shell:openExternal', (_event, url: unknown) => {
    if (typeof url !== 'string') throw new Error('url은 문자열이어야 합니다')
    if (!/^https?:\/\//.test(url)) throw new Error('http/https만 열 수 있습니다')
    return shell.openExternal(url)
  })

  // 인자를 받지 않는다. 렌더러가 다른 주소·경로로 요청을 보낼 방법이 없게 하기 위해서다.
  // 4주차 이후 API마다 이런 좁은 핸들러를 하나씩 추가한다 (범용 'api:fetch' 같은 것은 만들지 않는다).
  ipcMain.handle('api:health', () => callApi<HealthResponse>('/health'))

  // AUTH-01·02. 렌더러는 로그인 여부·이메일·만료 시각·마지막 시도 결과만 받는다. 토큰은 넘기지 않는다
  ipcMain.handle('auth:login', async (event) => {
    const status = await login()
    // 브라우저에서 돌아온 사용자가 바로 앱을 보도록 창을 앞으로 가져온다
    BrowserWindow.fromWebContents(event.sender)?.focus()
    return status
  })
  ipcMain.handle('auth:status', () => getAuthStatus())
  // SCR-01. 브라우저 대기 중인 로그인을 끝낸다(auth:login이 '취소됨'으로 끝난다)
  ipcMain.handle('auth:cancelLogin', () => cancelLogin())
  // AUTH-03. 로컬 로그아웃은 항상 된다. 서버 무효화 결과는 lastAttempt로 알린다
  ipcMain.handle('auth:logout', () => logout())

  // DESK-01·02. 읽기 함수는 인자를 받지 않는다. 렌더러가 경로를 정할 방법이 없어야 하므로
  // '지금 선택된 대상'만 읽는다. 경로를 인자로 받는 핸들러는 만들지 않는다(범용 파일 읽기가 된다).
  ipcMain.handle('chrome:listProfiles', () => findChromeProfiles())
  ipcMain.handle('chrome:getSelection', () => getChromeSelection())
  // 목록에 있는 폴더명일 때만 통과한다(selectChromeProfile이 확인한다)
  ipcMain.handle('chrome:selectProfile', (_event, name: unknown) => selectChromeProfile(name))
  ipcMain.handle('chrome:pickFile', (event) => pickBookmarksFile(BrowserWindow.fromWebContents(event.sender)))
  ipcMain.handle('chrome:read', () => readSelectedBookmarks())

  // DESK-03. 렌더러는 '지금 동기화'만 알린다. confirmDeleteCount 같은 숫자는 메인이 정한다
  ipcMain.handle('sync:now', () => syncNow('manual'))
  ipcMain.handle('sync:state', () => syncState)
}

// ─── DESK-03 동기화 ────────────────────────────────────────────
let syncState: SyncState = initialSyncState
// '지금 동기화'를 연타해도 요청은 하나만 나간다
let pendingSync: Promise<SyncState> | null = null
// 앱을 켠 뒤 자동 동기화는 한 번만 한다(로그인·갱신으로 상태가 여러 번 바뀌어도)
let didStartupSync = false

function setSyncState(next: SyncState): void {
  syncState = next
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('sync:changed', syncState)
}

/** 대량 삭제 확인 (DESK-03). 지워질 북마크 최대 5개를 보여준다. SCR-02에서 시안 모달로 바꾼다 */
async function confirmMassDelete(details: MassDeleteDetails): Promise<boolean> {
  setSyncState({ ...syncState, phase: 'needs_confirm', confirm: details })
  const preview = details.preview.map((b) => `· ${b.title || b.url}`).join('\n')
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['취소', `${details.deleteCount}개 지우기`],
    defaultId: 0,
    cancelId: 0,
    title: '바로',
    message: `크롬에 없는 북마크 ${details.deleteCount}개를 바로에서 지울까요?`,
    detail: `지금 바로에 있는 동기화 북마크 ${details.syncedTotal}개 중 ${details.deleteCount}개가 사라집니다.\n방문 기록도 함께 지워지고 되돌릴 수 없습니다.\n\n${preview}${details.preview.length < details.deleteCount ? '\n· …' : ''}`
  })
  return response === 1
}

/** 북마크가 0개일 때 (수동 동기화에서만 불린다) */
async function confirmSuspicious(): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['취소', '그래도 동기화'],
    defaultId: 0,
    cancelId: 0,
    title: '바로',
    message: '크롬에서 북마크를 찾지 못했습니다',
    detail:
      '프로필을 잘못 골랐거나 파일을 읽지 못했을 수 있습니다.\n계속하면 바로의 동기화 북마크가 모두 지워질 수 있습니다.'
  })
  return response === 1
}

function syncNow(trigger: SyncTrigger): Promise<SyncState> {
  pendingSync ??= runSync(
    {
      readBookmarks: readSelectedBookmarks,
      getAccessToken,
      forceRefresh,
      fetch: globalThis.fetch,
      apiBaseUrl: API_BASE,
      confirmMassDelete,
      confirmSuspicious
    },
    trigger
  )
    .catch((err: unknown) => ({
      ...initialSyncState,
      phase: 'error' as const,
      error: { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) }
    }))
    .finally(() => {
      pendingSync = null
    })
    .then((next) => {
      setSyncState(next)
      return next
    })
  setSyncState({ ...syncState, phase: 'syncing', error: null })
  return pendingSync
}

/** 지금 선택된 프로필·파일을 읽는다. 선택이 없으면 그 사실을 알린다 */
async function readSelectedBookmarks(): Promise<ChromeReadResult> {
  // 이 PC에 저장한 선택이 없으면 서버가 기억하는 프로필을 쓴다(DESK-03)
  const selection = await getChromeSelection((await fetchMe())?.chromeProfile)
  if (!selection) return { ok: false, reason: 'no_selection', message: '읽을 크롬 프로필을 찾지 못했습니다' }
  const result = await readBookmarksFile(selection.bookmarksPath)
  return result.ok ? { ok: true, selection, tree: result.tree } : { ...result, selection }
}

/**
 * DESK-02. 기본 경로에서 못 찾았을 때 사용자가 Bookmarks 파일을 직접 고른다.
 * 고른 파일도 같은 읽기 규칙을 지나야 선택으로 저장한다(크롬 파일이 아니면 no_roots로 거절)
 */
async function pickBookmarksFile(parent: BrowserWindow | null): Promise<ChromeReadResult | null> {
  const options: OpenDialogOptions = {
    title: '크롬 Bookmarks 파일 선택',
    // 크롬 Bookmarks 파일은 확장자가 없다
    properties: ['openFile'],
    filters: [{ name: '크롬 북마크', extensions: ['*'] }]
  }
  const picked = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  const path = picked.filePaths[0]
  if (picked.canceled || !path) return null

  const result = await readBookmarksFile(path)
  if (!result.ok) return result
  return { ok: true, selection: await selectChromeFile(path), tree: result.tree }
}

app.whenReady().then(() => {
  registerIpc()
  // 자동 로그인·갱신은 메인 프로세스에서 일어나므로, 바뀔 때마다 열린 창에 알린다(토큰 없는 상태만)
  onAuthChange((status) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('auth:changed', status)
    // DESK-03. 로그인된 뒤 한 번만 자동 동기화한다(주기적 동기화는 두지 않는다).
    // 자동은 북마크 0개면 보내지 않고, 대량 삭제는 확인을 거친다
    if (status.session && !didStartupSync) {
      didStartupSync = true
      void syncNow('startup')
    }
  })
  // safeStorage는 app ready 뒤에만 쓸 수 있어서 여기서 시작한다
  initAuth()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Windows 전용이라 창을 닫으면 종료한다. DESK-05에서 트레이로 바꾼다.
  if (process.platform !== 'darwin') app.quit()
})
