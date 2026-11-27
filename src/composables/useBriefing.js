import { computed, onMounted, ref } from 'vue'
import { readSavedCity, resolveCityId, saveCity } from '../utils/city.js'
import { isFreshItem } from '../utils/format.js'
import { groupBlocks, splitLead, takePage } from '../utils/layout.js'

// 組成 public 資料的網址，並帶上站台子路徑
// name: 檔名
// 回傳: 如 /data/news.json
const dataUrl = (name) => `${import.meta.env.BASE_URL}data/${name}`

// 讀取簡報 JSON，並依分類篩選新聞
// 回傳: 資料、載入狀態、分類與重新載入方法
export const useBriefing = () => {
  const news = ref([])
  const weather = ref(null)
  const catalog = ref(null)
  const cityId = ref(readSavedCity())
  const generatedAt = ref('')
  const previousGeneratedAt = ref('')
  const todayBrief = ref([])
  const newsError = ref('')
  const weatherError = ref('')
  const loading = ref(true)
  const category = ref('all')
  const sortMode = ref('coverage')
  const openPages = ref({})

  // 今日重點收成字串或帶分類的物件
  // line: news.json 的一句
  // 回傳: 字串、{ text, category }，空的回傳 null
  const briefLine = (line) => {
    if (typeof line === 'string' && line.trim()) return line.trim()
    if (line && typeof line.text === 'string' && line.text.trim()) {
      return { text: line.text.trim(), category: typeof line.category === 'string' ? line.category : '' }
    }
    return null
  }

  // 讀取 JSON。不快取，方便同一天替換檔案後重新整理
  // name: data 目錄裡的檔名
  // 回傳: 解析後的物件
  const loadJson = async (name) => {
    const res = await fetch(dataUrl(name), { cache: 'no-store' })
    if (!res.ok) throw new Error('http')
    const text = await res.text()
    if (!text.trim()) throw new Error('empty')
    try {
      return JSON.parse(text)
    } catch {
      throw new Error('parse')
    }
  }

  // 這則新聞有沒有可點的連結
  // item: news.json 的一筆
  // 回傳: 是否可顯示
  const hasLink = (item) => {
    if (!item?.title) return false
    if (item.url) return true
    return Array.isArray(item.sources) && item.sources.some((source) => source?.url)
  }

  // 讀取新聞。失敗時留下給畫面用的說明
  // 回傳: 無
  const loadNews = async () => {
    news.value = []
    generatedAt.value = ''
    previousGeneratedAt.value = ''
    todayBrief.value = []
    newsError.value = ''
    try {
      const data = await loadJson('news.json')
      if (!Array.isArray(data.items)) throw new Error('parse')
      news.value = data.items.filter(hasLink)
      generatedAt.value = data.generatedAt || data.updatedAt || ''
      previousGeneratedAt.value = data.previousGeneratedAt || ''
      todayBrief.value = Array.isArray(data.todayBrief)
        ? data.todayBrief.map(briefLine).filter(Boolean).slice(0, 3)
        : []
    } catch (err) {
      newsError.value = err?.message === 'parse'
        ? '新聞資料無法讀取。'
        : '今天的新聞暫時讀不到，請稍後再試。'
    }
  }

  // 目錄裡可以選的縣市
  // 回傳: { id, name } 陣列
  const cityOptions = computed(() => {
    const data = catalog.value
    if (!data) return []
    if (data.cities || data.split) {
      const order = Array.isArray(data.order) ? data.order : Object.keys(data.cities ?? {})
      return order.map((id) => {
        const file = data.cities?.[id]
        const preview = data.previews?.[id]
        return {
          id,
          name: data.names?.[id] || file?.location || id,
          temp: file?.current?.temp ?? preview?.temp,
          conditionCode: file?.current?.conditionCode || preview?.conditionCode || '',
        }
      })
    }
    if (data.current) return [{ id: 'taipei', name: data.location || '臺北市' }]
    return []
  })

  // 把選到的縣市放進天氣卡。分割檔才另外讀那一縣市
  // id: 縣市代碼
  // 回傳: 無
  const applyCity = async (id) => {
    const data = catalog.value
    const next = resolveCityId(id, cityOptions.value)
    cityId.value = next
    if (!data || !next) {
      weather.value = null
      return
    }
    if (data.split) {
      const file = await loadJson(`weather/${next}.json`)
      if (!file?.current || !Array.isArray(file.forecast) || !file.forecast.length) throw new Error('parse')
      weather.value = file
      return
    }
    if (data.cities) {
      const file = data.cities[next]
      if (!file?.current || !Array.isArray(file.forecast) || !file.forecast.length) throw new Error('parse')
      weather.value = file
      return
    }
    weather.value = data
  }

  // 讀取天氣目錄，再套用記住的縣市
  // 回傳: 無
  const loadWeather = async () => {
    weather.value = null
    catalog.value = null
    weatherError.value = ''
    try {
      const data = await loadJson('weather.json')
      const usable = data?.split || data?.cities || data?.current
      if (!usable) throw new Error('parse')
      catalog.value = data
      await applyCity(readSavedCity())
      if (!weather.value) throw new Error('parse')
    } catch (err) {
      weatherError.value = err?.message === 'parse'
        ? '天氣資料不完整。'
        : '今天的天氣暫時讀不到，請稍後再試。'
    }
  }

  // 切換縣市並記住。寫入失敗仍會切換這次的畫面
  // id: 縣市代碼
  // 回傳: 無
  const selectCity = async (id) => {
    saveCity(id)
    try {
      await applyCity(id)
      weatherError.value = ''
    } catch (err) {
      weatherError.value = err?.message === 'parse'
        ? '天氣資料不完整。'
        : '今天的天氣暫時讀不到，請稍後再試。'
    }
  }

  // 同時載入新聞與天氣。一邊失敗不會清掉另一邊
  // 回傳: 無
  const load = async () => {
    loading.value = true
    await Promise.all([loadNews(), loadWeather()])
    loading.value = false
  }

  // 依家數或時間排序。預設多家優先，同家數再比時間
  // 回傳: 排序後的新聞
  const orderedNews = computed(() => {
    return [...news.value].sort((a, b) => {
      if (sortMode.value === 'coverage') {
        const byCount = (b.sourceCount ?? 1) - (a.sourceCount ?? 1)
        if (byCount) return byCount
      }
      return new Date(b.publishedAt) - new Date(a.publishedAt)
    })
  })

  // 依目前分類取出要顯示的新聞
  // 回傳: 新聞陣列
  const filteredNews = computed(() => {
    if (category.value === 'all') return orderedNews.value
    return orderedNews.value.filter((item) => item.category === category.value)
  })

  // 這個分頁目前畫出來的新聞。沒按看更多時只有前 15 則
  // 回傳: 新聞陣列
  const visibleNews = computed(() => takePage(filteredNews.value, Boolean(openPages.value[category.value])))

  // 這個分頁還沒展開的則數
  // 回傳: 0 或正整數
  const hiddenCount = computed(() => Math.max(0, filteredNews.value.length - visibleNews.value.length))

  // 展開目前分頁。其他分頁維持各自的 15 則
  // 回傳: 無
  const revealMore = () => {
    openPages.value = { ...openPages.value, [category.value]: true }
  }

  // 頭條、次要，以及其餘的單行
  // 回傳: { lead, sides, blocks }
  const presented = computed(() => {
    const { lead, sides, rest } = splitLead(visibleNews.value)
    return { lead, sides, blocks: groupBlocks(rest) }
  })

  // 上次更新之後才出現的事件
  // item: news.json 的一筆
  // 回傳: 要不要顯示「新」
  const isFresh = (item) => isFreshItem(item?.firstSeenAt, previousGeneratedAt.value)

  // 切換排序
  // mode: coverage 或 time
  // 回傳: 無
  const setSortMode = (mode) => {
    sortMode.value = mode
  }

  // 切換分類
  // id: 分類代碼
  // 回傳: 無
  const selectCategory = (id) => {
    category.value = id
  }

  onMounted(() => {
    load()
  })

  return {
    news,
    weather,
    cityId,
    cityOptions,
    selectCity,
    generatedAt,
    todayBrief,
    presented,
    visibleNews,
    hiddenCount,
    revealMore,
    isFresh,
    newsError,
    weatherError,
    loading,
    category,
    sortMode,
    filteredNews,
    selectCategory,
    setSortMode,
    load,
  }
}
