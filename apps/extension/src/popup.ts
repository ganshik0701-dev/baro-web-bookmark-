// 팝업. fetch도 chrome.bookmarks도 쓰지 않는다: 서비스 워커에 메시지를 보내고, storage의 상태(PUBLIC_KEYS)를 읽어 그린다.
// 토큰 원본은 읽지 않는다(서비스 워커가 끝 4자리만 connection.tokenHint에 넣어 준다).
import {
  CONNECTION_KEY,
  FULL_NEEDED_KEY,
  PUBLIC_KEYS,
  REALTIME_KEY,
  STATUS_KEY,
  type Connection,
  type Message,
  type Realtime,
  type Reply,
  type SyncStatus
} from './state'

declare const __API_BASE__: string

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const show = (id: string, on: boolean) => $(id).classList.toggle('hidden', !on)
const send = (msg: Message) => chrome.runtime.sendMessage(msg) as Promise<Reply>
const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('ko-KR') : '')

$('api').textContent = new URL(__API_BASE__).host

function renderConnection(c: Connection | undefined) {
  const saved = !!c && c.state !== 'no_token'
  show('token-form', !saved)
  show('token-saved', saved)
  $('hint').textContent = c?.tokenHint ?? ''
  const el = $('connection')
  const text: Record<Connection['state'], [string, string]> = {
    no_token: ['토큰을 저장하면 연결됩니다', 'muted'],
    checking: ['연결 확인 중…', 'muted'],
    connected: [`연결됨${c?.email ? ` · ${c.email}` : ''}`, 'ok'],
    token_invalid: ['토큰 무효(401) · 앱에서 새 토큰을 발급해 저장하세요', 'bad'],
    network: ['서버 연결 실패(네트워크)', 'bad'],
    server_error: ['서버 오류 · 잠시 후 다시 확인하세요', 'bad']
  }
  const [t, cls] = text[c?.state ?? 'no_token']
  el.textContent = t
  el.className = cls
  $<HTMLButtonElement>('full').disabled = !saved
}

function renderStatus(s: SyncStatus | undefined) {
  const el = $('status')
  el.textContent = ''
  show('confirm', s?.state === 'needs_confirm')
  const busy = s?.state === 'syncing' || s?.state === 'needs_confirm'
  $<HTMLButtonElement>('full').disabled ||= busy
  if (!s || s.state === 'idle') return
  const p = (text: string, cls = '') => {
    const e = document.createElement('p')
    e.textContent = text
    e.className = cls
    el.append(e)
  }
  if (s.state === 'syncing') p('동기화 중…', 'muted')
  else if (s.state === 'done') {
    const r = s.result
    p(`완료 ${time(s.updatedAt)} · 추가 ${r.created} · 수정 ${r.updated} · 삭제 ${r.deleted}`, 'ok')
    const skipped = [
      s.filtered ? `보내지 않은 URL ${s.filtered}개(javascript:·chrome:// 등)` : '',
      r.skippedReasons.duplicateUrl ? `같은 URL ${r.skippedReasons.duplicateUrl}개` : '',
      r.skippedReasons.manualExists ? `바로에서 직접 추가한 URL과 같음 ${r.skippedReasons.manualExists}개` : '',
      r.skippedReasons.invalidUrl ? `서버가 거절한 URL ${r.skippedReasons.invalidUrl}개` : ''
    ].filter(Boolean)
    if (skipped.length) p(`건너뜀: ${skipped.join(' · ')}`, 'subtle')
  } else if (s.state === 'error') p(s.message, 'bad')
  else if (s.state === 'needs_confirm') {
    $('confirm-title').textContent = `크롬에 없는 북마크 ${s.deleteCount}개를 바로에서 지웁니다 (동기화된 ${s.syncedTotal}개 중)`
    const ul = $('preview')
    ul.textContent = ''
    for (const item of s.preview) {
      const li = document.createElement('li')
      li.textContent = `${item.title} — ${item.url}`
      li.title = item.url
      ul.append(li)
    }
    if (s.deleteCount > s.preview.length) {
      const li = document.createElement('li')
      li.textContent = `외 ${s.deleteCount - s.preview.length}개`
      li.className = 'subtle'
      ul.append(li)
    }
  }
}

function renderRealtime(r: Realtime | undefined) {
  $('realtime').textContent = r ? `실시간 동기화 ${time(r.at)} · ${r.ok ? '' : '실패: '}${r.message}` : ''
}

async function render() {
  const got = await chrome.storage.local.get([...PUBLIC_KEYS])
  renderConnection(got[CONNECTION_KEY] as Connection | undefined)
  renderStatus(got[STATUS_KEY] as SyncStatus | undefined)
  renderRealtime(got[REALTIME_KEY] as Realtime | undefined)
  show('full-needed', got[FULL_NEEDED_KEY] === true && (got[STATUS_KEY] as SyncStatus | undefined)?.state !== 'needs_confirm')
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && PUBLIC_KEYS.some((k) => k in changes)) void render()
})

$('save').addEventListener('click', async () => {
  const input = $<HTMLInputElement>('token')
  const reply = await send({ type: 'token:save', token: input.value })
  input.value = '' // 저장했든 아니든 입력창에 남기지 않는다
  $('token-error').textContent = reply.ok ? '' : reply.message
  show('token-error', !reply.ok)
})
$('token').addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter') $('save').click()
})
$('check').addEventListener('click', () => void send({ type: 'connection:check' }))
$('clear').addEventListener('click', () => void send({ type: 'token:clear' }))
$('full').addEventListener('click', () => void send({ type: 'sync:full' }))
$('confirm-yes').addEventListener('click', () => void send({ type: 'sync:confirm' }))
$('confirm-no').addEventListener('click', () => void send({ type: 'sync:cancel' }))

void render().then(async () => {
  // 열 때마다 연결 상태를 가볍게 다시 확인한다(토큰이 있을 때만 서비스 워커가 요청)
  const c = (await chrome.storage.local.get([CONNECTION_KEY]))[CONNECTION_KEY] as Connection | undefined
  if (c && c.state !== 'no_token') void send({ type: 'connection:check' })
})
