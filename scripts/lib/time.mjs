// 轉成台北時區的 ISO 8601
// date: Date，省略時用現在
// 回傳: 如 2026-11-23T07:00:00+08:00
export const toTaipeiIso = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type) => parts.find((part) => part.type === type)?.value ?? '00'
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}:${pick('second')}+08:00`
}

// 取出台北時區的日期
// date: Date
// 回傳: YYYY-MM-DD
export const taipeiDay = (date) => toTaipeiIso(date).slice(0, 10)

// 台北時區日期的下一天
// day: YYYY-MM-DD
// 回傳: 下一天的 YYYY-MM-DD
export const nextTaipeiDay = (day) => {
  const [year, month, date] = String(day).split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, date + 1))
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const d = String(utc.getUTCDate()).padStart(2, '0')
  return `${utc.getUTCFullYear()}-${m}-${d}`
}

// 預報列的短標籤
// dateStr: YYYY-MM-DD
// today: YYYY-MM-DD
// 回傳: 「今天」或週一到週日
export const dayLabel = (dateStr, today) => {
  if (dateStr === today) return '今天'
  const weekday = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
  return weekday[new Date(`${dateStr}T12:00:00+08:00`).getUTCDay()]
}
