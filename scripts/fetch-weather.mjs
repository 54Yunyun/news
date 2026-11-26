import { mkdir, readFile, rm } from 'node:fs/promises'
import { loadEnv, redact, readEnv } from './lib/env.mjs'
import { taipeiDay, toTaipeiIso } from './lib/time.mjs'
import { assembleCities, packWeather, previousCities, toSun, toWeatherFile } from './lib/weather.mjs'
import { writeJson } from './lib/write-json.mjs'

const weatherFile = new URL('../public/data/weather.json', import.meta.url)
const weatherDir = new URL('../public/data/weather/', import.meta.url)

// 向氣象署取 JSON。金鑰放在查詢參數，錯誤訊息不帶回網址
// datasetId: 資料集代碼
// apiKey: CWA 授權碼
// params: 其他查詢參數，例如行政區或日期
// 回傳: 氣象署 JSON
const fetchForecast = async (datasetId, apiKey, params = {}) => {
  const url = new URL(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/${datasetId}`)
  url.searchParams.set('Authorization', apiKey)
  url.searchParams.set('format', 'JSON')
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }
  let res
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  } catch {
    throw new Error(`氣象署連線失敗（${datasetId}）`)
  }
  if (!res.ok) throw new Error(`氣象署回應 ${res.status}（${datasetId}）`)
  const data = await res.json()
  if (String(data?.success) === 'false') throw new Error(`氣象署回應失敗（${datasetId}）`)
  return data
}

// 讀上一份天氣。分割檔會把各縣市讀回 cities
// 回傳: 解析後的物件，讀不到時回傳 null
const readPrevious = async () => {
  try {
    const data = JSON.parse(await readFile(weatherFile, 'utf8'))
    if (!data?.split) return data
    const cities = {}
    for (const id of data.order ?? []) {
      try {
        cities[id] = JSON.parse(await readFile(new URL(`${id}.json`, weatherDir), 'utf8'))
      } catch (err) {
        if (err?.code !== 'ENOENT') throw err
      }
    }
    return { ...data, cities }
  } catch (err) {
    if (err?.code !== 'ENOENT') console.error(`[weather] 讀不到上一份天氣：${redact(err?.message)}`)
    return null
  }
}

// 抓完全臺縣市再寫檔。單一縣市失敗時留該縣市的上一份
// 回傳: 無
const main = async () => {
  await loadEnv()
  const apiKey = readEnv('CWA_API_KEY')
  if (!apiKey) throw new Error('缺少 CWA_API_KEY')
  const config = JSON.parse(await readFile(new URL('./weather.config.json', import.meta.url), 'utf8'))
  const cities = Array.isArray(config.cities) ? config.cities : []
  if (!cities.length) throw new Error('沒有縣市清單')
  const pauseMs = Number.isFinite(config.pauseMs) && config.pauseMs >= 0 ? config.pauseMs : 400
  const previous = previousCities(await readPrevious(), cities)
  const today = taipeiDay(new Date())
  const results = []
  const failed = []
  let calls = 0

  for (const city of cities) {
    if (calls > 0 && pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs))
    calls += 1
    try {
      const data = await fetchForecast(city.datasetId, apiKey, { locationName: city.district })
      const file = toWeatherFile(data, { ...city, reminders: config.reminders })
      if (calls > 0 && pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs))
      calls += 1
      try {
        const sunData = await fetchForecast('A-B0062-001', apiKey, { CountyName: city.location, Date: today })
        const sun = toSun(sunData, city.location)
        if (sun) file.sun = sun
        else if (previous[city.id]?.sun) file.sun = previous[city.id].sun
        else console.error(`[weather] ${city.location} 日出日落沒有今天的資料`)
      } catch (err) {
        if (previous[city.id]?.sun) file.sun = previous[city.id].sun
        console.error(`[weather] ${city.location} 日出日落未寫入：${redact(err?.message, [apiKey])}`)
      }
      results.push({ id: city.id, file })
      console.log(`[weather] ${city.location} ${city.district} ${city.datasetId}`)
    } catch (err) {
      failed.push(city.location)
      results.push({ id: city.id, file: null })
      console.error(`[weather] ${city.location} 保留上一份：${redact(err?.message, [apiKey])}`)
    }
  }

  const next = assembleCities(previous, results)
  const order = cities.map((city) => city.id).filter((id) => next[id])
  if (!order.length) throw new Error('沒有可寫入的縣市')
  const names = {}
  for (const id of order) names[id] = next[id].location
  const packed = packWeather({ updatedAt: toTaipeiIso(new Date()), order, names, cities: next })
  if (packed.mode === 'split') {
    await mkdir(weatherDir, { recursive: true })
    for (const [id, file] of Object.entries(packed.files)) {
      await writeJson(new URL(`${id}.json`, weatherDir), file)
    }
    await writeJson(weatherFile, packed.index)
  } else {
    await writeJson(weatherFile, packed.payload)
    await rm(weatherDir, { recursive: true, force: true })
  }
  console.log(`[weather] 已寫入 ${order.length} 個縣市，沿用舊資料 ${failed.length} 個${failed.length ? `：${failed.join('、')}` : ''}，${packed.bytes} bytes，${packed.mode === 'split' ? '拆成各縣市檔案' : '單一檔案'}`)
}

main().catch((err) => {
  console.error(`[weather] 保留原本的天氣檔：${redact(err?.message, [readEnv('CWA_API_KEY')])}`)
  process.exitCode = 1
})
