// GET /metadata: 페이지 제목·아이콘 추출 (BM-01 보조, docs/03-api.md).
// 서버가 사용자 대신 임의의 주소를 여는 기능이라 SSRF 차단이 핵심이다. 차단 규칙:
//   1) URL 모양 검사(checkUrl): http/https, 포트 80·443, localhost·아이디/비밀번호 금지, IP 표기면 그 IP 검사.
//      처음 주소와 리다이렉트 목적지마다 한다(리다이렉트는 직접 따라간다).
//   2) 접속 시점 검사(connector): undici가 소켓을 열 때 DNS를 여기서 풀고, 모든 답이 공인 unicast일 때만
//      그 IP로 바로 접속한다. "검사할 때 DNS 한 번, 접속할 때 또 한 번" 풀면 그 사이 답이 바뀌는
//      DNS 리바인딩(검사 땐 공인 IP, 접속 땐 127.0.0.1)에 뚫리므로, 검사한 IP를 그대로 접속에 쓴다.
// 운영 경로(라우트)는 아래 fetchMetadata만 쓴다. 정책을 바꿀 수 있는 createMetadataFetcher는 테스트 전용이다
// (metadata.test.ts가 이 규칙을 검사한다). 환경 변수 등으로 검사를 끄는 스위치는 두지 않는다.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import ipaddr from 'ipaddr.js'
import { parse } from 'node-html-parser'
import { Agent, buildConnector, fetch, type Response } from 'undici'
import { ApiError } from './errors'

const TIMEOUT_MS = 3_000
const MAX_BYTES = 1024 * 1024
const MAX_REDIRECTS = 3
const TITLE_MAX = 100
const ICON_URL_MAX = 2048
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])

export type PageMetadata = { title: string | null; iconUrl: string }

/** 어디로 접속해도 되는지. 운영 값은 PRODUCTION_POLICY 하나뿐이다 */
export type NetworkPolicy = {
  readonly ports: readonly number[]
  /** 접속해도 되는 IP인가 (정규 표기 IP 문자열을 받는다) */
  readonly isAllowedAddress: (ip: string) => boolean
  /** 호스트 이름 → IP 목록 */
  readonly resolve: (hostname: string) => Promise<string[]>
}

/**
 * 공인 unicast IP인가. 사설·루프백·링크 로컬(169.254 클라우드 메타데이터 포함)·CGNAT·0.0.0.0·멀티캐스트·
 * IPv6 ULA·NAT64 등 'unicast'가 아닌 범위는 모두 거절한다(허용 목록 방식이라 빠뜨린 범위가 열리지 않는다).
 * ::ffff:127.0.0.1 같은 IPv4 매핑 주소는 process()로 IPv4로 바꾼 뒤 검사한다.
 * '2130706433'처럼 정규 표기가 아닌 문자열은 IP로 보지 않고 거절한다(URL 파서가 이미 정규 표기로 바꿔 준다)
 */
export function isPublicUnicast(ip: string): boolean {
  if (isIP(ip) === 0) return false
  return ipaddr.process(ip).range() === 'unicast'
}

export const PRODUCTION_POLICY: NetworkPolicy = Object.freeze({
  ports: Object.freeze([80, 443]),
  isAllowedAddress: isPublicUnicast,
  resolve: async (hostname: string) => (await lookup(hostname, { all: true, verbatim: true })).map((a) => a.address)
})

/** 차단한 주소. 400 INVALID_URL로 바뀐다 */
class BlockedUrl extends Error {}
/** 가져오기 실패. 422 METADATA_FETCH_FAILED로 바뀐다 */
class FetchFailed extends Error {}

const stripBrackets = (host: string) => (host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host)

/** 1) URL 모양 검사. 네트워크는 쓰지 않는다 */
function checkUrl(url: URL, policy: NetworkPolicy): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrl('http 또는 https 주소만 가져올 수 있습니다')
  }
  if (url.username || url.password) throw new BlockedUrl('아이디·비밀번호가 들어간 주소는 가져올 수 없습니다')
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  if (!policy.ports.includes(port)) throw new BlockedUrl('80·443 이외의 포트는 가져올 수 없습니다')
  const host = stripBrackets(url.hostname).replace(/\.$/, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) throw new BlockedUrl('내부 주소는 가져올 수 없습니다')
  if (isIP(host) !== 0 && !policy.isAllowedAddress(host)) throw new BlockedUrl('내부 주소는 가져올 수 없습니다')
}

/** 2) 접속 시점 검사. 접속할 IP 하나를 고른다. DNS 답 중 하나라도 막힌 IP면 전부 거절한다 */
async function pickAddress(hostname: string, port: number, policy: NetworkPolicy): Promise<string> {
  if (!policy.ports.includes(port)) throw new BlockedUrl('80·443 이외의 포트는 가져올 수 없습니다')
  const host = stripBrackets(hostname)
  const addresses = isIP(host) !== 0 ? [host] : await policy.resolve(host)
  if (addresses.length === 0) throw new FetchFailed('주소를 찾을 수 없습니다')
  if (addresses.some((ip) => !policy.isAllowedAddress(ip))) throw new BlockedUrl('내부 주소는 가져올 수 없습니다')
  // IPv6로 나가지 못하는 서버도 있어 IPv4를 먼저 쓴다
  return addresses.find((ip) => isIP(ip) === 4) ?? addresses[0]
}

/**
 * undici 연결 함수. hostname만 검사한 IP로 바꿔 기본 연결 함수에 넘긴다.
 * TLS 인증서 확인(SNI)과 Host 헤더는 원래 호스트 이름(host)으로 그대로 한다
 */
function createConnector(policy: NetworkPolicy): buildConnector.connector {
  const base = buildConnector({})
  return (opts, callback) => {
    const port = Number(opts.port) || (opts.protocol === 'https:' ? 443 : 80)
    pickAddress(opts.hostname, port, policy).then(
      (ip) => base({ ...opts, hostname: ip }, callback),
      (err: Error) => callback(err, null)
    )
  }
}

const REQUEST_HEADERS = {
  'user-agent': 'Mozilla/5.0 (compatible; baro-metadata/0.1)',
  accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
  'accept-language': 'ko,en;q=0.8'
}

/** 리다이렉트를 직접 따라간다. 목적지마다 checkUrl을 다시 하고, 접속은 매번 connector를 지난다 */
async function fetchFollowing(start: URL, policy: NetworkPolicy, dispatcher: Agent, signal: AbortSignal) {
  let url = start
  for (let hop = 0; ; hop++) {
    checkUrl(url, policy)
    const res = await fetch(url, { dispatcher, redirect: 'manual', headers: REQUEST_HEADERS, signal })
    if (!REDIRECT_STATUS.has(res.status)) return { res, url }
    await res.body?.cancel()
    const location = res.headers.get('location')
    if (!location) throw new FetchFailed('리다이렉트 목적지가 없습니다')
    if (hop >= MAX_REDIRECTS) throw new FetchFailed(`리다이렉트가 ${MAX_REDIRECTS}번을 넘었습니다`)
    try {
      url = new URL(location, url)
    } catch {
      throw new FetchFailed('리다이렉트 목적지가 올바른 주소가 아닙니다')
    }
  }
}

/** 본문을 1MB까지만 읽는다(압축은 undici가 풀고, 푼 크기로 센다). 넘으면 나머지는 받지 않고 끊는다 */
async function readLimited(res: Response): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
  }
  if (total >= MAX_BYTES) await reader.cancel()
  const out = new Uint8Array(Math.min(total, MAX_BYTES))
  let offset = 0
  for (const chunk of chunks) {
    const part = chunk.subarray(0, out.length - offset)
    out.set(part, offset)
    offset += part.length
    if (offset >= out.length) break
  }
  return out
}

const CHARSET_IN_HEADER = /charset\s*=\s*["']?\s*([\w.:-]+)/i
const CHARSET_IN_META = /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i

/** 문자 인코딩: BOM → Content-Type의 charset → 앞 4KB의 <meta> → UTF-8. 모르는 이름이면 UTF-8 */
export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  let label = 'utf-8'
  const isUtf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  if (!isUtf8Bom) {
    const fromHeader = contentType?.match(CHARSET_IN_HEADER)?.[1]
    const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, 4096))
    label = fromHeader ?? head.match(CHARSET_IN_META)?.[1] ?? 'utf-8'
  }
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

function cleanTitle(raw: string | undefined): string | null {
  const text = raw?.replace(/\s+/g, ' ').trim()
  if (!text) return null
  return Array.from(text).slice(0, TITLE_MAX).join('')
}

export function googleFavicon(hostname: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`
}

/** HTML에서 제목(og:title → title)과 아이콘(https인 첫 rel=icon, 없으면 Google 파비콘)을 꺼낸다 */
export function extractMetadata(html: string, pageUrl: URL): PageMetadata {
  const root = parse(html)
  const og = root.querySelector('meta[property="og:title"]') ?? root.querySelector('meta[name="og:title"]')
  const title = cleanTitle(og?.getAttribute('content')) ?? cleanTitle(root.querySelector('title')?.text)

  // 상대 경로는 <base href>가 있으면 그것을, 없으면 최종 주소를 기준으로 푼다
  let base = pageUrl
  const baseHref = root.querySelector('base[href]')?.getAttribute('href')
  if (baseHref) {
    try {
      base = new URL(baseHref, pageUrl)
    } catch {
      // 잘못된 base는 무시
    }
  }
  let iconUrl: string | null = null
  for (const link of root.querySelectorAll('link[rel][href]')) {
    const rels = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/)
    if (!rels.includes('icon')) continue
    try {
      const u = new URL((link.getAttribute('href') ?? '').trim(), base)
      // 앱이 그대로 불러오는 주소라 https만 쓴다 (북마크 iconUrl 규칙과 같다)
      if (u.protocol === 'https:' && u.href.length <= ICON_URL_MAX) {
        iconUrl = u.href
        break
      }
    } catch {
      // 잘못된 href는 건너뛴다
    }
  }
  return { title, iconUrl: iconUrl ?? googleFavicon(pageUrl.hostname) }
}

function findCause<T extends Error>(err: unknown, type: new (...args: never[]) => T): T | null {
  for (let e = err, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) {
    if (e instanceof type) return e
  }
  return null
}

/** 내부 오류를 API 오류로. undici는 연결 함수의 오류를 TypeError('fetch failed')의 cause로 감싼다 */
function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  const blocked = findCause(err, BlockedUrl)
  if (blocked) return new ApiError('INVALID_URL', blocked.message)
  const failed = findCause(err, FetchFailed)
  if (failed) return new ApiError('METADATA_FETCH_FAILED', failed.message)
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return new ApiError('METADATA_FETCH_FAILED', `${TIMEOUT_MS / 1000}초 안에 응답하지 않았습니다`)
  }
  return new ApiError('METADATA_FETCH_FAILED', '페이지를 가져오지 못했습니다')
}

/**
 * 정책을 정해 가져오기 함수를 만든다. **테스트 전용**(로컬 테스트 서버에 붙으려고 127.0.0.1·임의 포트를 허용할 때).
 * 운영 코드는 아래 fetchMetadata만 쓴다
 */
export function createMetadataFetcher(policy: NetworkPolicy) {
  const dispatcher = new Agent({ connect: createConnector(policy) })

  return async function fetchPageMetadata(href: string): Promise<PageMetadata> {
    // 연결·리다이렉트·본문 읽기를 합쳐 3초
    const signal = AbortSignal.timeout(TIMEOUT_MS)
    try {
      const { res, url } = await fetchFollowing(new URL(href), policy, dispatcher, signal)
      if (!res.ok) {
        await res.body?.cancel()
        throw new FetchFailed(`사이트가 ${res.status}로 응답했습니다`)
      }
      const contentType = res.headers.get('content-type')
      if (!contentType || !/^\s*text\/html\b/i.test(contentType)) {
        await res.body?.cancel()
        throw new FetchFailed('HTML 페이지가 아닙니다')
      }
      const html = decodeHtml(await readLimited(res), contentType)
      return extractMetadata(html, url)
    } catch (err) {
      throw toApiError(err)
    }
  }
}

/** 운영용. 정책이 PRODUCTION_POLICY로 고정돼 있고 바꿀 방법이 없다 */
export const fetchMetadata = createMetadataFetcher(PRODUCTION_POLICY)
