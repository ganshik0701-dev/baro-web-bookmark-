import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'node:path'
import type { ApiFailure, ApiSuccess, HealthResponse } from '@baro/shared'
import { getAuthStatus, initAuth, login, onAuthChange } from './auth'

// API 서버 주소 (apps/desktop/.env의 VITE_API_BASE_URL, 공개값). 렌더러에게서 주소를 받지 않는다.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1'

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
}

app.whenReady().then(() => {
  registerIpc()
  // 자동 로그인·갱신은 메인 프로세스에서 일어나므로, 바뀔 때마다 열린 창에 알린다(토큰 없는 상태만)
  onAuthChange((status) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('auth:changed', status)
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
