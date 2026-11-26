import { dayLabel, nextTaipeiDay, taipeiDay, toTaipeiIso } from './time.mjs'

// 政府資料開放平臺所列的未來 3 天鄉鎮預報。臺北市為 F-D0047-061
// https://data.gov.tw/dataset/9293
export const datasets = {
  宜蘭縣: 'F-D0047-001',
  桃園市: 'F-D0047-005',
  新竹縣: 'F-D0047-009',
  苗栗縣: 'F-D0047-013',
  彰化縣: 'F-D0047-017',
  南投縣: 'F-D0047-021',
  雲林縣: 'F-D0047-025',
  嘉義縣: 'F-D0047-029',
  屏東縣: 'F-D0047-033',
  臺東縣: 'F-D0047-037',
  花蓮縣: 'F-D0047-041',
  澎湖縣: 'F-D0047-045',
  基隆市: 'F-D0047-049',
  新竹市: 'F-D0047-053',
  嘉義市: 'F-D0047-057',
  臺北市: 'F-D0047-061',
  高雄市: 'F-D0047-065',
  新北市: 'F-D0047-069',
  臺中市: 'F-D0047-073',
  臺南市: 'F-D0047-077',
  連江縣: 'F-D0047-081',
  金門縣: 'F-D0047-085',
}

const reminderDefaults = { umbrella: 50, maybeRain: 30, cold: 18, hot: 32, gap: 8, tomorrowRain: 60 }

// 把值收成陣列
// value: 單一值或陣列
// 回傳: 陣列
const asList = (value) => {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

// 忽略大小寫取出欄位。氣象署的 JSON 有時大小寫不一致
// obj: 物件
// name: 欄位名稱
// 回傳: 欄位值，沒有時回傳 undefined
const field = (obj, name) => {
  if (!obj || typeof obj !== 'object') return undefined
  if (obj[name] != null) return obj[name]
  const key = Object.keys(obj).find((item) => item.toLowerCase() === name.toLowerCase())
  return key ? obj[key] : undefined
}

// 縣市名稱統一用「臺」
// name: 縣市
// 回傳: 正規化後的名稱
export const normalizeLocation = (name) => String(name ?? '').trim().replaceAll('台', '臺')

// 決定資料集代碼。有對照表時以縣市為準，否則用設定檔覆寫
// config: weather.config.json
// 回傳: 如 F-D0047-061
export const datasetFor = (config) => {
  const location = normalizeLocation(config.location)
  return datasets[location] || config.datasetId || ''
}

// 解析氣象署時間。沒有時區的字串視為台北時間
// raw: 時間字串
// 回傳: Date，無法解析時回傳 null
export const parseCwaTime = (raw) => {
  if (!raw) return null
  const text = String(raw).trim().replace(' ', 'T')
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}+08:00`
  const date = new Date(withZone)
  return Number.isNaN(date.getTime()) ? null : date
}

// 讀取 elementValue 的文字
// elementValue: 氣象署的元素值
// 回傳: 文字
const readText = (elementValue) => {
  const row = asList(elementValue)[0]
  if (row == null) return ''
  if (typeof row !== 'object') return String(row).trim()
  return String(row.value ?? row.Weather ?? row.weather ?? row.parameterName ?? '').trim()
}

// 讀取元素裡的整數。新版欄位用 Temperature、ProbabilityOfPrecipitation
// elementValue: 氣象署的元素值
// 回傳: 整數，無法解析時回傳 null
const readNumber = (elementValue) => {
  const row = asList(elementValue)[0]
  if (row == null) return null
  const raw = typeof row === 'object'
    ? row.value ?? row.Temperature ?? row.MinTemperature ?? row.MaxTemperature ?? row.ProbabilityOfPrecipitation ?? row.parameterName
    : row
  const n = Number(String(raw ?? '').replace('%', ''))
  return Number.isFinite(n) ? Math.round(n) : null
}

// 降雨機率一段涵蓋幾小時。這個資料集沒有逐時降雨，3 小時、6 小時、12 小時各一段
// name: 要素名稱
// 回傳: 小時數
const rainSpanHours = (name) => {
  if (/12/.test(name)) return 12
  if (/3/.test(name)) return 3
  return 6
}

// 把氣象署的要素名稱對到我們要的種類
// name: 要素名稱，可能是 T、Wx，或「溫度」「天氣現象」
// 回傳: temp、min、max、wx、rain，不認識時回傳空字串
const elementKind = (name) => {
  if (name === 'T' || name === '溫度') return 'temp'
  if (name === 'MinT' || name === '最低溫度') return 'min'
  if (name === 'MaxT' || name === '最高溫度') return 'max'
  if (name === 'Wx' || name === '天氣現象') return 'wx'
  if (/^PoP/i.test(name) || name.includes('降雨機率')) return 'rain'
  return ''
}

// 依中文天氣描述對到前端圖示代碼
// text: 如「多雲時晴」
// 回傳: sunny、partly-cloudy、cloudy、rain、thunderstorm、fog
export const conditionCode = (text) => {
  const value = String(text ?? '')
  if (value.includes('雷')) return 'thunderstorm'
  if (/[雨雪]/.test(value)) return 'rain'
  if (value.includes('霧')) return 'fog'
  if (value.includes('晴') && value.includes('雲')) return 'partly-cloudy'
  if (value.includes('陰') || value.includes('雲')) return 'cloudy'
  if (value.includes('晴')) return 'sunny'
  return 'cloudy'
}

// 用規則組成一句出門提醒。明天降雨超過門檻時補上「明天有雨」
// day: { rainProb, low, high }
// rules: 門檻，可省略
// tomorrow: 明天的預報，沒有時省略
// 回傳: 一句話
export const buildReminder = (day, rules = {}, tomorrow = null) => {
  const limit = { ...reminderDefaults, ...rules }
  const notes = []
  const tomorrowRain = tomorrow && Number(tomorrow.rainProb) > limit.tomorrowRain
  if (day.rainProb >= limit.umbrella && tomorrowRain) notes.push('今天降雨機率超過五成，明天也有雨，出門記得帶傘')
  else if (day.rainProb >= limit.maybeRain && tomorrowRain) notes.push('今天降雨機率不低，明天也有雨，可以帶把摺傘')
  else if (day.rainProb >= limit.umbrella) notes.push('降雨機率超過五成，出門記得帶傘')
  else if (day.rainProb >= limit.maybeRain) notes.push('降雨機率不低，可以帶把摺傘')
  else if (tomorrowRain) notes.push('明天有雨')
  if (day.low <= limit.cold) notes.push('氣溫偏低，注意保暖')
  else if (day.high - day.low >= limit.gap) notes.push('日夜溫差較大，可多帶一件')
  if (day.high >= limit.hot) notes.push('天氣偏熱，記得多補水')
  if (notes.length === 0) return '天氣變化不大，依氣溫增減衣物即可。'
  return `${notes.join('；')}。`
}

// 某個時刻落在哪一段降雨機率。沒有涵蓋時改用最接近的一段
// rains: { time, end, n, spanHours }
// target: Date
// 回傳: 降雨機率整數
const rainAt = (rains, target) => {
  const sorted = [...rains].sort((a, b) => a.time - b.time)
  for (let index = 0; index < sorted.length; index += 1) {
    const point = sorted[index]
    const end = point.end || sorted[index + 1]?.time || new Date(point.time.getTime() + point.spanHours * 3_600_000)
    if (target >= point.time && target < end) return point.n
  }
  const near = nearest(sorted, target)
  return near?.n ?? 0
}

// 未來 12 個小時。氣溫用逐時溫度，降雨機率用涵蓋該小時的那一段
// temps: { time, n }
// rains: { time, end, n, spanHours }
// now: 現在
// 回傳: { time, label, temp, rainProb } 陣列
export const buildHourly = (temps, rains, now) => {
  const hourText = toTaipeiIso(now).slice(0, 13)
  const thisHour = new Date(`${hourText}:00:00+08:00`)
  const start = now.getTime() > thisHour.getTime() ? new Date(thisHour.getTime() + 3_600_000) : thisHour
  const points = []
  for (let index = 0; index < 12; index += 1) {
    const time = new Date(start.getTime() + index * 3_600_000)
    const tempPoint = nearest(temps.filter((item) => Math.abs(item.time - time) <= 45 * 60 * 1000), time)
    if (!tempPoint) continue
    const labelHour = Number(toTaipeiIso(time).slice(11, 13))
    points.push({
      time: toTaipeiIso(time),
      label: `${labelHour}時`,
      temp: tempPoint.n,
      rainProb: rainAt(rains, time),
    })
  }
  return points
}

// 收成 HH:mm。氣象署的日出日沒是本地時間
// value: 時間文字
// 回傳: HH:mm，解析不到時回傳空字串
const clockText = (value) => {
  const match = String(value ?? '').trim().match(/(\d{1,2}):(\d{2})/)
  if (!match) return ''
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

// 日出日沒資料集 A-B0062-001。欄位是 Date、SunRiseTime、SunSetTime
// data: 氣象署 JSON
// location: 縣市
// now: 用來選今天
// 回傳: { date, sunrise, sunset }，沒有今天的資料時回傳 null
export const toSun = (data, location, now = new Date()) => {
  const roots = asList(field(data?.records, 'locations'))
  const areas = roots.flatMap((root) => asList(field(root, 'location')))
  const name = normalizeLocation(location)
  const area = areas.find((item) => normalizeLocation(field(item, 'CountyName') || field(item, 'locationName')) === name)
  if (!area) return null
  const today = taipeiDay(now)
  const times = asList(field(area, 'time'))
  const row = times.find((item) => String(field(item, 'Date') || field(item, 'date') || '').slice(0, 10) === today)
  if (!row) return null
  const sunrise = clockText(field(row, 'SunRiseTime') || field(row, 'SunriseTime') || field(row, '日出時刻'))
  const sunset = clockText(field(row, 'SunSetTime') || field(row, 'SunsetTime') || field(row, '日沒時刻'))
  if (!sunrise || !sunset) return null
  return { date: today, sunrise, sunset }
}

// 找出最接近指定時間的一筆
// points: { time, ... } 陣列
// target: Date
// 回傳: 最接近的一筆，空陣列回傳 null
const nearest = (points, target) => {
  if (!points.length) return null
  return points.reduce((best, point) => {
    return Math.abs(point.time - target) < Math.abs(best.time - target) ? point : best
  })
}

// 把一個鄉鎮的預報收成 weather.json
// data: 氣象署 JSON
// config: { location, district, reminders }
// now: 用來判斷「今天」
// 回傳: weather.json 物件
export const toWeatherFile = (data, config, now = new Date()) => {
  const records = data?.records
  const roots = asList(field(records, 'locations'))
  const areas = roots.flatMap((root) => asList(field(root, 'location')))
  if (!areas.length) throw new Error('氣象署回應裡沒有鄉鎮資料')
  const district = String(config.district || '').trim()
  const area = areas.find((item) => field(item, 'locationName') === district)
  if (!area) {
    const names = areas.map((item) => field(item, 'locationName')).filter(Boolean).slice(0, 8)
    throw new Error(`找不到${district}，可改成 ${names.join('、')}`)
  }

  const temps = []
  const rains = []
  const conditions = []
  const mins = []
  const maxs = []
  for (const element of asList(field(area, 'weatherElement'))) {
    const name = String(field(element, 'elementName') || '')
    for (const slot of asList(field(element, 'time'))) {
      const time = parseCwaTime(field(slot, 'dataTime') || field(slot, 'startTime'))
      if (!time) continue
      const value = field(slot, 'elementValue')
      const kind = elementKind(name)
      if (kind === 'temp' || kind === 'min' || kind === 'max' || kind === 'rain') {
        const n = readNumber(value)
        if (n == null) continue
        if (kind === 'temp') temps.push({ time, n })
        else if (kind === 'min') mins.push({ time, n })
        else if (kind === 'max') maxs.push({ time, n })
        else rains.push({ time, end: parseCwaTime(field(slot, 'endTime')), n, spanHours: rainSpanHours(name) })
      } else if (kind === 'wx') {
        const text = readText(value)
        if (text) conditions.push({ time, text })
      }
    }
  }
  if (!temps.length && !maxs.length) throw new Error('氣象署回應裡沒有溫度')

  const days = new Set([
    ...temps.map((item) => taipeiDay(item.time)),
    ...conditions.map((item) => taipeiDay(item.time)),
    ...rains.map((item) => taipeiDay(item.time)),
  ])
  const today = taipeiDay(now)
  const upcoming = [...days].filter((day) => day >= today).sort()
  const chosen = (upcoming.length ? upcoming : [...days].sort()).slice(0, 3)
  if (!chosen.length) throw new Error('氣象署回應裡沒有可用的日期')

  // 取出某一天的觀測點
  // points: 帶時間的數值
  // day: YYYY-MM-DD
  // 回傳: 當天的點
  const onDay = (points, day) => points.filter((item) => taipeiDay(item.time) === day)
  const forecast = chosen.map((day) => {
    const dayTemps = onDay(temps, day).map((item) => item.n)
    const dayMax = onDay(maxs, day).map((item) => item.n)
    const dayMin = onDay(mins, day).map((item) => item.n)
    const highs = dayMax.length ? dayMax : dayTemps
    const lows = dayMin.length ? dayMin : dayTemps
    if (!highs.length || !lows.length) return null
    const high = Math.max(...highs)
    const low = Math.min(...lows)
    const rainValues = onDay(rains, day).map((item) => item.n)
    const rainProb = rainValues.length ? Math.max(...rainValues) : 0
    const noon = nearest(onDay(conditions, day), new Date(`${day}T12:00:00+08:00`))
    const condition = noon?.text || nearest(conditions, new Date(`${day}T12:00:00+08:00`))?.text || '多雲'
    return {
      date: day,
      label: dayLabel(day, today),
      condition,
      conditionCode: conditionCode(condition),
      high,
      low,
      rainProb,
    }
  }).filter(Boolean)
  if (!forecast.length) throw new Error('氣象署回應裡沒有可用的溫度')

  const first = forecast[0]
  const currentTemp = nearest(temps, now)?.n ?? first.high
  const currentCondition = nearest(conditions, now)?.text || first.condition
  return {
    updatedAt: toTaipeiIso(now),
    location: normalizeLocation(config.location),
    current: {
      temp: currentTemp,
      condition: currentCondition,
      conditionCode: conditionCode(currentCondition),
      high: first.high,
      low: first.low,
      rainProb: first.rainProb,
    },
    reminder: buildReminder(first, config.reminders, forecast.find((day) => day.date === nextTaipeiDay(today))),
    hourly: buildHourly(temps, rains, now),
    forecast,
  }
}

const weatherBytes = 150 * 1024

// 從上一份檔案取出各縣市。舊的單縣市檔只對到名稱相符的那一筆
// data: 上一份 weather.json，或已展開的分割檔
// cities: 設定裡的縣市
// 回傳: id → 天氣
export const previousCities = (data, cities) => {
  const found = {}
  const list = cities ?? []
  if (data?.cities && typeof data.cities === 'object') {
    for (const city of list) {
      const item = data.cities[city.id]
      if (item?.current && Array.isArray(item.forecast) && item.forecast.length) found[city.id] = item
    }
    return found
  }
  if (data?.current && Array.isArray(data.forecast) && data.forecast.length) {
    const name = normalizeLocation(data.location)
    const city = list.find((item) => normalizeLocation(item.location) === name)
    if (city) found[city.id] = data
  }
  return found
}

// 成功的縣市用新資料，失敗的留上一份。兩邊都沒有就略過
// previous: previousCities 的結果
// results: { id, file }，file 為 null 代表這次失敗
// 回傳: id → 天氣
export const assembleCities = (previous, results) => {
  const next = {}
  for (const result of results ?? []) {
    if (result?.file?.current) next[result.id] = result.file
    else if (previous?.[result.id]?.current) next[result.id] = previous[result.id]
  }
  return next
}

// 超過 150KB 就拆成各縣市一個檔。索引只留代碼與名稱
// payload: { updatedAt, order, names, cities }
// 回傳: { mode, bytes, payload } 或 { mode, bytes, index, files }
export const packWeather = (payload) => {
  const text = JSON.stringify(payload)
  const bytes = Buffer.byteLength(text)
  if (bytes <= weatherBytes) return { mode: 'single', bytes, payload }
  return {
    mode: 'split',
    bytes,
    index: {
      updatedAt: payload.updatedAt,
      split: true,
      order: payload.order,
      names: payload.names,
    },
    files: payload.cities,
  }
}
