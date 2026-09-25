// 아이콘 타일에 무엇을 그릴지 정하는 순수 함수들 (SCR-03, docs/01-spec.md '아이콘 출처').
// DOM을 쓰지 않아 단위 테스트로 확인한다(test/tile.test.ts).

/** 타일 색 개수(--tile-1 ~ --tile-8) */
export const TILE_COLORS = 8

/** 호스트. 소문자, 앞의 www.는 뗀다(www.github.com과 github.com이 같은 색이 되게). 주소가 이상하면 '' */
export function tileHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** FNV-1a 32비트. 짧은 문자열에도 고르게 퍼지고 몇 줄이면 된다 */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** 1~8. 같은 호스트는 늘 같은 번호 → CSS에서 var(--tile-N) */
export function tileColor(url: string): number {
  return (fnv1a(tileHost(url)) % TILE_COLORS) + 1
}

const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' })
// 글자·숫자만 고른다('[공지] …'의 '['나 이모지 대신 '공'을 쓰게)
const LETTER = /[\p{L}\p{N}]/u

function firstLetter(text: string): string | null {
  for (const { segment } of segmenter.segment(text)) {
    if (LETTER.test(segment)) return segment.toLocaleUpperCase('ko')
  }
  return null
}

/** 글자 타일의 글자. 제목의 첫 글자, 없으면 호스트의 첫 글자, 그것도 없으면 '?' */
export function tileLetter(title: string, url: string): string {
  return firstLetter(title) ?? firstLetter(tileHost(url)) ?? '?'
}

/** 타일 아래 이름. 제목이 비면 호스트 */
export function tileLabel(title: string, url: string): string {
  return title.trim() || tileHost(url) || url
}

/**
 * 파비콘 주소. iconUrl이 있으면 그것, 없으면 Google 파비콘 서비스(sz=64 고정).
 * 호스트를 알 수 없으면 null(글자 타일만)
 */
export function faviconUrl(iconUrl: string | null, url: string): string | null {
  if (iconUrl) return iconUrl
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return null
  }
  return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : null
}

/** 크롬에서 온 북마크. 바로에서 고치거나 지워도 다음 동기화 때 크롬 값으로 돌아간다(보조 메뉴와 SCR-04가 막는다) */
export function isFromChrome(source: string): boolean {
  return source === 'app_sync' || source === 'ext_sync'
}

/**
 * 불러온 파비콘을 쓸지. Google은 모르는 도메인에 16px 기본 아이콘(지구본)을 준다.
 * 16px 이하는 크게 늘리면 흐려서 어차피 글자 타일이 낫다
 */
export function isUsableFavicon(naturalWidth: number): boolean {
  return naturalWidth > 16
}
