// 상태바의 '마지막 동기화 N분 전' (SCR-03)

/** ISO 시각을 지금 기준으로. 1분 안 '방금', 1시간 안 'N분 전', 하루 안 'N시간 전', 그 밖 'M월 D일' */
export function relativeTime(iso: string, now: number): string {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ''
  const min = Math.floor((now - at) / 60_000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours}시간 전`
  const d = new Date(at)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}
