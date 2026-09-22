// GET /metadata (lib/metadata.ts) 테스트.
// - 단위: IP 판정, HTML에서 제목·아이콘 추출, 문자 인코딩
// - 통합: 127.0.0.1에 테스트 서버를 띄우고, 그 서버만 허용하는 테스트 전용 정책으로 실제 요청을 보낸다
// - SSRF: 운영용 fetchMetadata로 실제 요청을 보내 막히는지 본다. 테스트 서버가 요청을 한 번도 받지 않아야 한다
// - 인터넷이 필요한 SSRF 확인(localtest.me, 공인 사이트 → 내부 리다이렉트)은 METADATA_LIVE=1일 때만 돈다
//   실행: METADATA_LIVE=1 pnpm --filter @baro/api test lib/metadata.test.ts
import { resolve4 } from 'node:dns/promises'
import { readdirSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, relative } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from './errors'
import {
  createMetadataFetcher,
  decodeHtml,
  extractMetadata,
  fetchMetadata,
  googleFavicon,
  isPublicUnicast,
  PRODUCTION_POLICY
} from './metadata'

async function apiError(p: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await p
  } catch (err) {
    if (err instanceof ApiError) return { code: err.code, message: err.message }
    throw err
  }
  throw new Error('오류가 나야 하는데 성공했습니다')
}

// "한글" (EUC-KR: 한=C7 D1, 글=B1 DB)
const HANGUL_EUCKR = Buffer.from([0xc7, 0xd1, 0xb1, 0xdb])

describe('isPublicUnicast', () => {
  it.each([
    '127.0.0.1', '127.1.2.3', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.0.1',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '255.255.255.255', '224.0.0.1', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1',
    '64:ff9b::7f00:1', 'ff02::1',
    // 정규 표기가 아니면 IP로 보지 않는다
    '2130706433', '0x7f.1', 'localhost', ''
  ])('차단: %s', (ip) => {
    expect(isPublicUnicast(ip)).toBe(false)
  })

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '223.130.200.107', '2606:4700:4700::1111'])('허용: %s', (ip) => {
    expect(isPublicUnicast(ip)).toBe(true)
  })

  it('운영 정책은 얼려 있어 바꿀 수 없다', () => {
    expect(Object.isFrozen(PRODUCTION_POLICY)).toBe(true)
    expect(Object.isFrozen(PRODUCTION_POLICY.ports)).toBe(true)
    expect(PRODUCTION_POLICY.ports).toEqual([80, 443])
    expect(PRODUCTION_POLICY.isAllowedAddress).toBe(isPublicUnicast)
  })
})

describe('extractMetadata', () => {
  const page = new URL('https://example.com/a/b')

  it('og:title이 title보다 먼저, 엔티티를 풀고 공백을 줄인다', () => {
    const html = `<html><head><title>그냥 제목</title>
      <meta property="og:title" content="  OG &amp; 제목
        두 줄 "></head></html>`
    expect(extractMetadata(html, page).title).toBe('OG & 제목 두 줄')
  })

  it('og:title이 없으면 title, 둘 다 없으면 null', () => {
    expect(extractMetadata('<title> A &lt;B&gt; </title>', page).title).toBe('A <B>')
    expect(extractMetadata('<html><body>본문</body></html>', page).title).toBeNull()
    expect(extractMetadata('<title>   </title>', page).title).toBeNull()
  })

  it('제목은 100자까지 자른다(한글·이모지도 글자 단위)', () => {
    const title = extractMetadata(`<title>${'가'.repeat(99)}😀😀</title>`, page).title!
    expect(Array.from(title)).toHaveLength(100)
    expect(title.endsWith('😀')).toBe(true)
  })

  it('script 안의 <title>은 제목으로 보지 않는다', () => {
    const html = `<head><script>document.write("<title>가짜</title>")</script><title>진짜</title></head>`
    expect(extractMetadata(html, page).title).toBe('진짜')
  })

  it('아이콘: 상대 경로를 최종 주소 기준으로 푼다', () => {
    const html = `<link rel="apple-touch-icon" href="/apple.png"><link rel="shortcut icon" href="fav.ico">`
    expect(extractMetadata(html, page).iconUrl).toBe('https://example.com/a/fav.ico')
  })

  it('아이콘: <base href>가 있으면 그것을 기준으로 푼다', () => {
    const html = `<base href="https://cdn.example.net/x/"><link rel="icon" href="i.png">`
    expect(extractMetadata(html, page).iconUrl).toBe('https://cdn.example.net/x/i.png')
  })

  it('아이콘: https가 아니면 건너뛰고, 없으면 Google 파비콘', () => {
    const html = `<link rel="icon" href="http://example.com/a.ico"><link rel="icon" href="data:image/png;base64,AAAA">`
    expect(extractMetadata(html, page).iconUrl).toBe(googleFavicon('example.com'))
    expect(extractMetadata('<title>x</title>', new URL('http://www.naver.com/')).iconUrl).toBe(
      'https://www.google.com/s2/favicons?domain=www.naver.com&sz=64'
    )
    const both = `<link rel="icon" href="http://example.com/a.ico"><link rel="icon" href="https://s.example.com/b.png">`
    expect(extractMetadata(both, page).iconUrl).toBe('https://s.example.com/b.png')
  })
})

describe('decodeHtml', () => {
  const eucKrPage = (meta: string) =>
    Buffer.concat([Buffer.from(`<html><head>${meta}<title>`), HANGUL_EUCKR, Buffer.from('</title></head></html>')])

  it('Content-Type의 charset=euc-kr', () => {
    expect(decodeHtml(eucKrPage(''), 'text/html; charset=EUC-KR')).toContain('<title>한글</title>')
  })

  it('<meta charset>, <meta http-equiv> (헤더에 charset이 없을 때)', () => {
    expect(decodeHtml(eucKrPage('<meta charset="euc-kr">'), 'text/html')).toContain('한글')
    expect(
      decodeHtml(eucKrPage('<meta http-equiv="Content-Type" content="text/html; charset=ks_c_5601-1987">'), 'text/html')
    ).toContain('한글')
  })

  it('헤더가 meta보다 먼저, 표시가 없으면 UTF-8, 모르는 이름이면 UTF-8', () => {
    const utf8 = Buffer.from('<meta charset="euc-kr"><title>한글</title>')
    expect(decodeHtml(utf8, 'text/html; charset=utf-8')).toContain('한글')
    expect(decodeHtml(Buffer.from('<title>한글</title>'), null)).toContain('한글')
    expect(decodeHtml(Buffer.from('<title>한글</title>'), 'text/html; charset=no-such-charset')).toContain('한글')
  })
})

// ---- 로컬 테스트 서버 ----

let server: Server
let port: number
let origin: string
/** 서버가 받은 요청 경로. 운영 정책 테스트에서 0건이어야 한다 */
let hits: string[] = []

function startServer(): Promise<void> {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    hits.push(url.pathname)
    const html = (body: string | Buffer, type = 'text/html; charset=utf-8') => {
      res.writeHead(200, { 'content-type': type })
      res.end(body)
    }
    const redirect = (to: string, status = 302) => {
      res.writeHead(status, { location: to })
      res.end()
    }
    switch (true) {
      case url.pathname === '/page':
        return html(`<html><head><title>테스트 페이지</title><link rel="icon" href="https://cdn.example.com/f.png"></head></html>`)
      case url.pathname === '/euckr-meta':
        return html(
          Buffer.concat([Buffer.from('<meta charset="euc-kr"><title>'), HANGUL_EUCKR, Buffer.from(' site</title>')]),
          'text/html'
        )
      case url.pathname === '/euckr-header':
        return html(Buffer.concat([Buffer.from('<title>'), HANGUL_EUCKR, Buffer.from('</title>')]), 'text/html; charset=euc-kr')
      case url.pathname.startsWith('/r/'): {
        // /r/n: 리다이렉트 n번 뒤 /r/0이 페이지를 준다
        const n = Number(url.pathname.slice(3))
        return n === 0 ? html('<title>테스트 페이지</title>') : redirect(`/r/${n - 1}`, [301, 302, 307, 308][n % 4])
      }
      case url.pathname === '/to':
        return redirect(url.searchParams.get('url')!)
      case url.pathname === '/no-location':
        res.writeHead(302)
        return res.end()
      case url.pathname === '/json':
        return html('{"title":"x"}', 'application/json')
      case url.pathname === '/no-type':
        res.writeHead(200)
        return res.end('<title>x</title>')
      case url.pathname === '/404':
        res.writeHead(404, { 'content-type': 'text/html' })
        return res.end('<title>없음</title>')
      case url.pathname === '/slow':
        setTimeout(() => html('<title>늦음</title>'), 5_000).unref()
        return
      case url.pathname === '/big': {
        // 제목은 앞에, 뒤로 5MB. 1MB에서 끊고 제목을 가져와야 한다
        res.writeHead(200, { 'content-type': 'text/html' })
        res.write('<html><head><title>큰 페이지</title></head><body>')
        const chunk = 'x'.repeat(64 * 1024)
        let sent = 0
        const pump = () => {
          while (sent < 5 * 1024 * 1024) {
            sent += chunk.length
            if (!res.write(chunk)) return res.once('drain', pump)
          }
          res.end('</body></html>')
        }
        res.on('error', () => {})
        return pump()
      }
      case url.pathname === '/late-title':
        // 1MB 넘어서 나오는 제목은 읽지 않는다
        return html(`<html><body>${'x'.repeat(1024 * 1024 + 10)}<title>늦은 제목</title></body></html>`)
      default:
        res.writeHead(404)
        return res.end()
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as AddressInfo).port
      origin = `http://127.0.0.1:${port}`
      resolve()
    })
  })
}

beforeAll(startServer)
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))
beforeEach(() => {
  hits = []
})

describe('가져오기 (테스트 전용 정책: 127.0.0.1과 테스트 서버 포트만 허용)', () => {
  // 테스트 서버에 붙기 위해 127.0.0.1·임의 포트를 허용하는 정책. 운영 경로에서는 만들 수 없다(아래 '구조' 테스트)
  const fetchLocal = createMetadataFetcher({
    get ports() {
      return [port]
    },
    isAllowedAddress: (ip) => ip === '127.0.0.1',
    resolve: async () => {
      throw new Error('테스트에서는 DNS를 쓰지 않는다')
    }
  })

  it('제목·아이콘', async () => {
    expect(await fetchLocal(`${origin}/page`)).toEqual({ title: '테스트 페이지', iconUrl: 'https://cdn.example.com/f.png' })
  })

  it('EUC-KR (meta / 헤더)', async () => {
    expect((await fetchLocal(`${origin}/euckr-meta`)).title).toBe('한글 site')
    expect((await fetchLocal(`${origin}/euckr-header`)).title).toBe('한글')
  })

  it('리다이렉트 3회까지는 따라간다', async () => {
    expect((await fetchLocal(`${origin}/r/3`)).title).toBe('테스트 페이지')
    expect(hits).toEqual(['/r/3', '/r/2', '/r/1', '/r/0'])
  })

  it('리다이렉트 4회는 422', async () => {
    expect(await apiError(fetchLocal(`${origin}/r/4`))).toMatchObject({ code: 'METADATA_FETCH_FAILED' })
    // 4번째 리다이렉트 목적지(/r/0)로는 요청하지 않는다
    expect(hits).toEqual(['/r/4', '/r/3', '/r/2', '/r/1'])
  })

  it('리다이렉트 목적지가 내부 IP·다른 포트·localhost면 400, 그 목적지로는 접속하지 않는다', async () => {
    for (const to of ['http://10.0.0.1/', 'http://127.0.0.1:81/', `http://localhost:${port}/page`, 'http://[::1]/', 'file:///etc/passwd']) {
      hits = []
      expect(await apiError(fetchLocal(`${origin}/to?url=${encodeURIComponent(to)}`))).toMatchObject({ code: 'INVALID_URL' })
      expect(hits).toEqual(['/to'])
    }
  })

  it('HTML이 아니거나 2xx가 아니면 422', async () => {
    for (const path of ['/json', '/no-type', '/404', '/no-location']) {
      expect(await apiError(fetchLocal(`${origin}${path}`)), path).toMatchObject({ code: 'METADATA_FETCH_FAILED' })
    }
  })

  it('3초가 지나면 422', async () => {
    const started = Date.now()
    expect(await apiError(fetchLocal(`${origin}/slow`))).toMatchObject({ code: 'METADATA_FETCH_FAILED', message: '3초 안에 응답하지 않았습니다' })
    expect(Date.now() - started).toBeLessThan(3_800)
  })

  it('1MB까지만 읽는다: 5MB 페이지도 앞의 제목은 가져오고, 1MB 뒤의 제목은 못 읽는다', async () => {
    expect((await fetchLocal(`${origin}/big`)).title).toBe('큰 페이지')
    expect((await fetchLocal(`${origin}/late-title`)).title).toBeNull()
  })

  it('접속 시점 검사: DNS 답에 내부 IP가 하나라도 있으면 거절 (DNS 리바인딩)', async () => {
    for (const answer of [['127.0.0.1'], ['8.8.8.8', '10.0.0.5'], ['::1'], ['169.254.169.254']]) {
      const fetchRebind = createMetadataFetcher({
        ports: [80],
        isAllowedAddress: isPublicUnicast,
        resolve: async () => answer
      })
      expect(await apiError(fetchRebind('http://rebind.example/')), answer.join(',')).toMatchObject({ code: 'INVALID_URL' })
    }
  })
})

describe('SSRF: 운영용 fetchMetadata로 실제 요청', () => {
  it.each([
    'http://localhost/',
    'http://LOCALHOST./',
    'http://app.localhost/',
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://2130706433/',
    'http://0x7f.1/',
    'http://0177.0.0.1/',
    'http://0.0.0.0/',
    'http://10.0.0.1/',
    'http://192.168.0.1/',
    'http://172.16.0.1/',
    'http://100.64.0.1/',
    'https://example.com:8443/',
    'http://example.com:22/',
    'https://user:pw@example.com/'
  ])('400 차단: %s', async (url) => {
    expect(await apiError(fetchMetadata(url))).toMatchObject({ code: 'INVALID_URL' })
  })

  it('127.0.0.1에 실제로 서버가 떠 있어도 닿지 않는다', async () => {
    for (const url of [`${origin}/page`, `http://localhost:${port}/page`, `http://2130706433:${port}/page`]) {
      expect(await apiError(fetchMetadata(url)), url).toMatchObject({ code: 'INVALID_URL' })
    }
    expect(hits).toEqual([])
  })
})

describe.skipIf(!process.env.METADATA_LIVE)('SSRF: 인터넷이 필요한 확인 (METADATA_LIVE=1)', () => {
  it.each([
    // 공인 도메인인데 DNS가 내부 IP를 돌려주는 경우 → 접속 시점 검사가 막는다
    'http://localtest.me/',
    'http://sub.localtest.me/',
    'http://10.0.0.1.nip.io/',
    'http://192.168.0.1.nip.io/',
    // 공인 사이트가 내부 주소로 리다이렉트하는 경우 → 리다이렉트마다 다시 검사한다
    'https://httpbin.org/redirect-to?url=http%3A%2F%2F127.0.0.1%2F',
    'https://httpbin.org/redirect-to?url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2F',
    'https://httpbin.org/redirect-to?url=http%3A%2F%2F2130706433%2F',
    'https://httpbin.org/redirect-to?url=http%3A%2F%2Flocaltest.me%2F',
    'https://httpbin.org/redirect-to?url=http%3A%2F%2F%5B%3A%3A1%5D%2F'
  ])('400 차단: %s', async (url) => {
    expect(await apiError(fetchMetadata(url))).toMatchObject({ code: 'INVALID_URL' })
  })

  it('169.254.169.254.nip.io: 실제 공개 DNS 답을 운영 IP 검사에 넣으면 막힌다', async () => {
    // 이 PC(Windows)는 OS DNS(getaddrinfo)가 169.254.x 답을 버려 접속 전에 422로 끝난다.
    // 운영(Vercel, Linux)은 답을 그대로 주므로 같은 조건을 만들려고 DNS 서버에 직접 물은 답을 쓴다
    const answers = await resolve4('169.254.169.254.nip.io')
    expect(answers).toEqual(['169.254.169.254'])
    const fetchPublicDns = createMetadataFetcher({ ...PRODUCTION_POLICY, resolve: resolve4 })
    expect(await apiError(fetchPublicDns('http://169.254.169.254.nip.io/latest/meta-data/'))).toMatchObject({ code: 'INVALID_URL' })
  })

  it('같은 리다이렉터로 공인 사이트에 가면 성공한다(차단이 리다이렉트 자체를 막는 게 아님)', async () => {
    const meta = await fetchMetadata('https://httpbin.org/redirect-to?url=https%3A%2F%2Fexample.com%2F')
    expect(meta.title).toBe('Example Domain')
  })
})

describe('구조: 검사를 바꿀 수 있는 createMetadataFetcher는 테스트에서만 쓴다', () => {
  it('lib/metadata.ts와 *.test.ts 밖(라우트 등)에서 쓰이지 않는다', () => {
    const root = join(__dirname, '..')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.next'].includes(entry.name)) continue
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
          const rel = relative(root, path).replaceAll('\\', '/')
          if (rel !== 'lib/metadata.ts' && readFileSync(path, 'utf8').includes('createMetadataFetcher')) offenders.push(rel)
        }
      }
    }
    walk(root)
    expect(offenders).toEqual([])
    // 라우트는 운영용 fetchMetadata를 쓴다
    expect(readFileSync(join(root, 'app/api/v1/metadata/route.ts'), 'utf8')).toMatch(/import \{ fetchMetadata \} from '@\/lib\/metadata'/)
  })
})
