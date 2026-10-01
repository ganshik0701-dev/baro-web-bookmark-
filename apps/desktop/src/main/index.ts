import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  session,
  shell,
  ipcMain,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
  type OpenDialogOptions
} from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ApiFailure, ApiSuccess, HealthResponse, MassDeleteDetails } from '@baro/shared'
import {
  API_BASE,
  apiDeps,
  createBookmark,
  createToken,
  deleteBookmark,
  fetchMe,
  fetchMetadata,
  getAutoSync,
  getSortOption,
  listBookmarks,
  listTokens,
  recordVisit,
  revokeToken,
  saveAutoSync,
  saveSortOption,
  setPinned,
  updateBookmark
} from './api'
import { parseTileMenuInput, tileMenuItems, type TileMenuChoice } from './tile-menu'
import {
  cancelLogin,
  getAuthStatus,
  initAuth,
  login,
  logout,
  onAuthChange
} from './auth'
import { initialSyncState, runSync, type SyncState, type SyncTrigger } from './sync'
import { createLoginWatch } from './login-watch'
import { readBookmarksFile } from './chrome-bookmarks'
import { findChromeProfiles, withBookmarkCounts } from './chrome-profiles'
import {
  getChromeSelection,
  selectChromeFile,
  selectChromeProfile,
  type ChromeReadResult
} from './chrome-selection'
import { findForbiddenSwitch } from './launch-guard'
import { appLocation, guardIpcHandler, isAllowedPermission, isAppUrl } from './app-origin'

// 설치본에서는 디버깅·검사 스위치가 붙어 있으면 창을 띄우기 전에 끝낸다(CLAUDE.md 'Electron 보안').
// 개발 실행(electron-vite dev)은 CDP로 확인해야 하므로 막지 않는다
if (app.isPackaged) {
  const forbidden = findForbiddenSwitch(process.argv)
  if (forbidden) {
    console.error(`허용하지 않는 실행 스위치: --${forbidden}`)
    app.exit(1)
  }
  // 설치본 데이터 폴더는 %APPDATA%\baro로 개발 앱(%APPDATA%\@baro\desktop)과 나눈다(docs/01-spec.md '설치·제거').
  // 로그인 저장(session.bin)·프로필 선택이 섞이지 않게. 준비(ready) 전, userData를 처음 쓰기 전에 정해야 한다
  app.setPath('userData', join(app.getPath('appData'), 'baro'))
}

// 창에 불러오는 앱 페이지. 개발 서버 주소는 개발 실행에서만 읽는다. 설치본이 이 환경 변수로 다른 페이지를
// 불러오면 그 페이지가 preload의 window.baro(토큰 발급 등)를 쓸 수 있게 된다
const RENDERER_DEV_URL = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL
const RENDERER_FILE = join(__dirname, '../renderer/index.html')
// 창 이동·IPC·권한 요청은 이 주소의 페이지에서 온 것만 받는다(app-origin.ts, CLAUDE.md 'Electron 보안')
const APP_LOCATION = appLocation({ devServerUrl: RENDERER_DEV_URL, rendererFileUrl: pathToFileURL(RENDERER_FILE).href })

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
    // 크기는 모두 창 안쪽(내용) 폭·높이다. 테두리 두께는 Windows 테마·배율마다 달라 기준으로 쓰지 않는다
    // (docs/04-design.md '좁은 창'. 최소 420px에서 그리드 2열, 사이드바는 저절로 접힌다)
    useContentSize: true,
    width: 1100,
    height: 720,
    minWidth: 420,
    minHeight: 560,
    backgroundColor: '#F7F5F0',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 보안 기본값 (CLAUDE.md 참고): 렌더러에서 Node를 쓰지 않는다
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // 설치본에서는 개발자 도구를 열 수 없게 한다(메뉴·단축키 모두)
      devTools: !app.isPackaged
    }
  })

  win.once('ready-to-show', () => win.show())

  // 렌더러가 새 창을 열려고 하면 OS 기본 브라우저로 넘긴다 (DESK-08의 토대)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // 창은 앱 페이지에서 다른 주소로 넘어가지 않는다(링크·끌어 놓기·스크립트 이동·서버 리다이렉트 모두).
  // 넘어가면 그 페이지에서도 preload의 window.baro가 열리기 때문이다
  const blockForeignNavigation = (event: Electron.Event<{ url: string }>) => {
    if (!isAppUrl(event.url, APP_LOCATION)) event.preventDefault()
  }
  win.webContents.on('will-navigate', blockForeignNavigation)
  win.webContents.on('will-redirect', blockForeignNavigation)

  if (RENDERER_DEV_URL) win.loadURL(RENDERER_DEV_URL)
  else win.loadFile(RENDERER_FILE)

  return win
}

/**
 * IPC 처리기 등록은 모두 이 함수로 한다. 보낸 프레임이 앱 페이지가 아니면 처리하지 않고 거절한다
 * (창 이동을 막아도 한 겹 더: 다른 페이지가 어떻게든 열리면 window.baro로 토큰 발급까지 갈 수 있다)
 */
// 처리기마다 인자 모양이 달라 ipcMain.handle과 같은 any[]를 받는다
function handle(channel: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
  ipcMain.handle(channel, guardIpcHandler(channel, APP_LOCATION, handler))
}

// IPC 핸들러. 렌더러는 preload가 열어 준 함수로만 이걸 부른다.
function registerIpc(): void {
  handle('app:version', () => app.getVersion())

  handle('shell:openExternal', (_event, url: unknown) => {
    if (typeof url !== 'string') throw new Error('url은 문자열이어야 합니다')
    if (!/^https?:\/\//.test(url)) throw new Error('http/https만 열 수 있습니다')
    return shell.openExternal(url)
  })

  // 인자를 받지 않는다. 렌더러가 다른 주소·경로로 요청을 보낼 방법이 없게 하기 위해서다.
  // 4주차 이후 API마다 이런 좁은 핸들러를 하나씩 추가한다 (범용 'api:fetch' 같은 것은 만들지 않는다).
  handle('api:health', () => callApi<HealthResponse>('/health'))

  // AUTH-01·02. 렌더러는 로그인 여부·이메일·만료 시각·마지막 시도 결과만 받는다. 토큰은 넘기지 않는다
  handle('auth:login', async (event) => {
    const status = await login()
    // 브라우저에서 돌아온 사용자가 바로 앱을 보도록 창을 앞으로 가져온다
    BrowserWindow.fromWebContents(event.sender)?.focus()
    return status
  })
  handle('auth:status', () => getAuthStatus())
  // SCR-01. 브라우저 대기 중인 로그인을 끝낸다(auth:login이 '취소됨'으로 끝난다)
  handle('auth:cancelLogin', () => cancelLogin())
  // AUTH-03. 로컬 로그아웃은 항상 된다. 서버 무효화 결과는 lastAttempt로 알린다
  handle('auth:logout', () => logout())

  // DESK-01·02. 읽기 함수는 인자를 받지 않는다. 렌더러가 경로를 정할 방법이 없어야 하므로
  // '지금 선택된 대상'만 읽는다. 경로를 인자로 받는 핸들러는 만들지 않는다(범용 파일 읽기가 된다).
  handle('chrome:listProfiles', async () => withBookmarkCounts(await findChromeProfiles()))
  // 화면에 보이는 선택도 동기화(readSelectedBookmarks)와 똑같이 서버 chromeProfile을 넣어 정한다.
  // 빼면 이미 동기화한 계정에서 화면은 last_used를, 동기화는 서버 값을 쓴다(2026-09-29 발견, docs/01-spec.md)
  handle('chrome:getSelection', async () => getChromeSelection((await fetchMe())?.chromeProfile))
  // 목록에 있는 폴더명일 때만 통과한다(selectChromeProfile이 확인한다)
  handle('chrome:selectProfile', (_event, name: unknown) => selectChromeProfile(name))
  handle('chrome:pickFile', (event) => pickBookmarksFile(BrowserWindow.fromWebContents(event.sender)))
  handle('chrome:read', () => readSelectedBookmarks())

  // DESK-03. 렌더러는 '지금 동기화'만 알린다. confirmDeleteCount 같은 숫자는 메인이 정한다
  handle('sync:now', () => syncNow('manual'))

  // SCR-03. 인자를 받지 않는다(정렬·필터는 SEARCH-04에서 정해진 값만 받게 한다).
  // 토큰은 메인에서 붙이고, 렌더러는 { data, meta } 또는 { error }만 받는다
  handle('bookmarks:list', () => listBookmarks())

  // OPEN-02·03, BM-05. id는 렌더러가 보내므로 api-client가 uuid인지 확인한 뒤에만 요청한다
  handle('bookmarks:visit', (_event, id: unknown) => recordVisit(id))
  handle('bookmarks:setPinned', (_event, id: unknown, pinned: unknown) => setPinned(id, pinned))
  handle('bookmarks:delete', (_event, id: unknown) => deleteBookmark(id))
  // SCR-04. 값은 api-client가 shared 스키마로 다시 검사한다(주소·제목·아이콘만 받는다)
  handle('bookmarks:create', (_event, raw: unknown) => createBookmark(raw))
  handle('bookmarks:update', (_event, id: unknown, raw: unknown) => updateBookmark(id, raw))
  handle('metadata:fetch', (_event, url: unknown) => fetchMetadata(url))
  // SEARCH-05. 저장은 값 하나만 받고 메인이 4종인지 다시 검사한다
  handle('settings:getSort', () => getSortOption())
  handle('settings:saveSort', (_event, value: unknown) => saveSortOption(value))
  // SCR-05. 참/거짓·이름·uuid 검사는 api-client가 한다(렌더러가 보낸 값이 그대로 오므로)
  handle('settings:getAutoSync', () => getAutoSync())
  handle('settings:saveAutoSync', (_event, value: unknown) => saveAutoSync(value))
  handle('tokens:list', () => listTokens())
  handle('tokens:create', (_event, name: unknown) => createToken(name))
  handle('tokens:revoke', (_event, id: unknown) => revokeToken(id))
  // 보조 메뉴는 OS 네이티브 메뉴로 띄우고, 고른 항목 이름만 돌려준다(요청은 렌더러가 항목별로 한다)
  handle('bookmarks:menu', (event, raw: unknown) =>
    showTileMenu(BrowserWindow.fromWebContents(event.sender), raw)
  )
  handle('sync:state', () => syncState)
  // SCR-02 모달의 답. true/false만 받는다(삭제 개수는 메인이 들고 있다)
  handle('sync:confirm', (_event, ok: unknown) => settleConfirm(ok === true))
}

// ─── OPEN-03 보조 메뉴 ────────────────────────────────────────
/**
 * 타일 보조 메뉴를 띄우고 고른 항목을 돌려준다. 아무것도 고르지 않고 닫으면 null.
 * 메뉴가 닫히는 알림(callback)이 항목 click보다 먼저 올 때가 있어(Windows), 닫힘 뒤 잠깐 기다렸다가 null로 끝낸다
 */
function showTileMenu(win: BrowserWindow | null, raw: unknown): Promise<TileMenuChoice | null> {
  const input = parseTileMenuInput(raw)
  if (!win || !input) return Promise.resolve(null)
  return new Promise((resolve) => {
    let settled = false
    const done = (choice: TileMenuChoice | null) => {
      if (settled) return
      settled = true
      resolve(choice)
    }
    const template: MenuItemConstructorOptions[] = tileMenuItems(input).map((item) =>
      item.kind === 'separator'
        ? { type: 'separator' }
        : item.kind === 'note'
          ? { label: item.label, enabled: false }
          : { label: item.label, enabled: item.enabled, click: () => done(item.choice) }
    )
    Menu.buildFromTemplate(template).popup({
      window: win,
      // 키보드로 열면 렌더러가 타일 아래 좌표를 준다. 없으면 마우스 위치
      ...(input.x !== undefined && input.y !== undefined && { x: input.x, y: input.y }),
      callback: () => setTimeout(() => done(null), 100)
    })
  })
}

// ─── DESK-03 동기화 ────────────────────────────────────────────
let syncState: SyncState = initialSyncState
// '지금 동기화'를 연타해도 요청은 하나만 나간다
let pendingSync: Promise<SyncState> | null = null

function setSyncState(next: SyncState): void {
  syncState = next
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('sync:changed', syncState)
}

// 409 확인을 기다리는 동안 렌더러의 답을 받을 자리 (SCR-02 모달)
let pendingConfirm: ((ok: boolean) => void) | null = null

/** 렌더러가 답할 때까지 기다린다. 답은 true/false뿐이고 삭제 개수는 메인이 들고 있다 */
function askRenderer(details: MassDeleteDetails): Promise<boolean> {
  setSyncState({ ...syncState, phase: 'needs_confirm', confirm: details })
  return new Promise<boolean>((resolve) => {
    pendingConfirm = resolve
  })
}

/** 렌더러의 답을 한 번만 받아 넘긴다(중복 호출·창 닫힘 모두 여기로 모인다) */
function settleConfirm(ok: boolean): void {
  const resolve = pendingConfirm
  pendingConfirm = null
  resolve?.(ok)
}

/**
 * 대량 삭제 확인 (DESK-03). 시안 모달(SCR-02)로 묻는다.
 * 창이 없으면 물을 곳이 없으므로 취소로 본다(메인이 영원히 기다리지 않게)
 */
async function confirmMassDelete(details: MassDeleteDetails): Promise<boolean> {
  if (BrowserWindow.getAllWindows().length === 0) return false
  return askRenderer(details)
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

/**
 * 로그인 세션이 새로 생길 때마다 한 번(login-watch.ts). 첫 동기화 전(lastSyncedAt이 null)이면 **자동으로 보내지 않고**
 * SCR-02가 사용자에게 프로필을 고르게 한다. 설정에서 자동 동기화를 껐으면 하지 않는다(docs/01-spec.md '자동 동기화')
 */
async function startupSync(): Promise<void> {
  const me = await fetchMe()
  // 서버에 못 물어본 경우(오프라인 등)는 홈으로 보낸다. 첫 사용자는 어차피 지금 동기화할 수 없고,
  // 이미 쓰던 사용자에게 첫 동기화 화면이 잘못 뜨는 편이 더 나쁘다
  const firstSync = me ? me.lastSyncedAt === null : false
  setSyncState({ ...syncState, firstSync, lastSyncedAt: me?.lastSyncedAt ?? syncState.lastSyncedAt })
  // 서버에 못 물어봤으면(me가 null) 예전처럼 시도한다. 끈 것은 서버 값을 읽었을 때만 안다
  if (!firstSync && me?.autoSync !== false) await syncNow('startup')
}

function syncNow(trigger: SyncTrigger): Promise<SyncState> {
  pendingSync ??= runSync(
    {
      ...apiDeps,
      readBookmarks: readSelectedBookmarks,
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
      // runSync는 firstSync·lastSyncedAt을 모른다. 성공했으면 더는 첫 동기화가 아니고 시각이 바뀐다.
      // 실패·취소면 둘 다 그대로 둔다(상태바는 마지막으로 성공한 시각을 계속 보여준다)
      setSyncState({
        ...next,
        firstSync: next.phase === 'done' ? false : syncState.firstSync,
        lastSyncedAt: next.lastResult?.syncedAt ?? syncState.lastSyncedAt
      })
      return syncState
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

// DESK-03. 로그인 세션이 새로 생길 때마다 첫 동기화 확인·자동 동기화를 한 번(같은 세션의 토큰 갱신에서는 안 함).
// 주기적 동기화는 두지 않는다. 자동은 북마크 0개면 보내지 않고, 대량 삭제는 확인을 거친다.
// 로그아웃하면 이전 계정의 동기화 상태를 비운다(다음 계정 값으로 다시 정한다)
const watchLogin = createLoginWatch({
  onLogin: () => void startupSync(),
  onLogout: () => setSyncState(initialSyncState)
})

app.whenReady().then(() => {
  // 설치본에는 기본 메뉴(보기 → 개발자 도구, 새로 고침 등)를 두지 않는다. 앱 화면에는 메뉴가 필요 없다
  if (app.isPackaged) Menu.setApplicationMenu(null)
  // 권한 요청(카메라·알림 등)은 모두 거절한다. 예외는 앱 페이지의 클립보드 쓰기(확장 토큰 복사) 하나
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) =>
    callback(isAllowedPermission(permission, details.requestingUrl, APP_LOCATION))
  )
  session.defaultSession.setPermissionCheckHandler((_wc, permission, _origin, details) =>
    isAllowedPermission(permission, details.requestingUrl, APP_LOCATION)
  )
  registerIpc()
  // 자동 로그인·갱신은 메인 프로세스에서 일어나므로, 바뀔 때마다 열린 창에 알린다(토큰 없는 상태만)
  onAuthChange((status) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('auth:changed', status)
    watchLogin(status)
  })
  // safeStorage는 app ready 뒤에만 쓸 수 있어서 여기서 시작한다
  initAuth()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // 확인 모달을 띄운 채 창을 닫았으면 취소로 본다(runSync가 영원히 기다리지 않게)
  settleConfirm(false)
  // Windows 전용이라 창을 닫으면 종료한다. DESK-05에서 트레이로 바꾼다.
  if (process.platform !== 'darwin') app.quit()
})
