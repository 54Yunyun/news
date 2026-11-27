const taipei = { timeZone: 'Asia/Taipei' }

// 把時間字串轉成 Date
// iso: ISO 8601 時間字串
// 回傳: 有效的 Date，無效時回傳 null
const toDate = (iso) => {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

// 取出台北時區的小時，0 到 23
// date: Date 物件
// 回傳: 小時
const taipeiHour = (date) => {
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date).find((item) => item.type === 'hour')
  return Number(part?.value ?? '0') % 24
}

// 依產生時間決定版次。05–11 點晨間、11–17 點午間、17–05 點晚間，邊界算進較晚的那一版
// iso: ISO 8601 時間字串，空值時改用現在
// 回傳: 晨間版、午間版或晚間版
export const formatEdition = (iso) => {
  const hour = taipeiHour(toDate(iso) ?? new Date())
  if (hour >= 5 && hour < 11) return '晨間版'
  if (hour >= 11 && hour < 17) return '午間版'
  return '晚間版'
}

// 這則是不是上次更新之後才出現。沒有上一份產生時間時一律不當成新的
// firstSeenAt: 事件第一次出現的時間
// previousGeneratedAt: 上一份檔案的產生時間
// 回傳: 要不要顯示「新」
export const isFreshItem = (firstSeenAt, previousGeneratedAt) => {
  const seen = toDate(firstSeenAt)
  const prev = toDate(previousGeneratedAt)
  if (!seen || !prev) return false
  return seen.getTime() > prev.getTime()
}

// 格式化刊頭日期
// iso: ISO 8601 時間字串，空值時改用現在
// 回傳: 如「2026年11月23日 星期一」
export const formatMastheadDate = (iso) => {
  const date = toDate(iso) ?? new Date()
  return new Intl.DateTimeFormat('zh-TW', {
    ...taipei,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date)
}

// 格式化時分
// iso: ISO 8601 時間字串
// 回傳: 如「06:30」，無效時回傳空字串
export const formatClock = (iso) => {
  const date = toDate(iso)
  if (!date) return ''
  return new Intl.DateTimeFormat('zh-TW', {
    ...taipei,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

// 取出台北時區的日期鍵，用來判斷是不是同一天
// date: Date 物件
// 回傳: YYYY-MM-DD
const dayKey = (date) => {
  return new Intl.DateTimeFormat('en-CA', {
    ...taipei,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

// 格式化新聞時間
// iso: ISO 8601 時間字串
// 回傳: 今天顯示「今天 05:40」，其餘顯示「11月22日 22:10」
export const formatNewsTime = (iso) => {
  const date = toDate(iso)
  if (!date) return ''
  const time = formatClock(iso)
  if (dayKey(date) === dayKey(new Date())) return `今天 ${time}`
  const monthDay = new Intl.DateTimeFormat('zh-TW', {
    ...taipei,
    month: 'long',
    day: 'numeric',
  }).format(date)
  return `${monthDay} ${time}`
}
