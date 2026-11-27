import sharp from 'sharp'

// 封面只留原站網址。台灣媒體優先、國外媒體排最後，並過濾標誌、預設圖、太小、比例不合或左右有明顯黑邊的圖

const FOREIGN_OUTLETS = new Set([
  'BBC News',
  'BBC',
  'NHK',
  'TechCrunch',
  'Reuters',
  'AP',
  'AFP',
  'CNN',
  'Bloomberg',
])

const WEIGHTS = new Map([
  ['中央社', 100],
  ['公視', 90],
  ['自由時報', 80],
  ['聯合報', 70],
  ['巴哈姆特GNN', 65],
  ['遊戲角落', 65],
  ['ETtoday', 60],
  ['壹蘋新聞網', 60],
  ['4Gamers', 60],
  ['Yahoo奇摩新聞', 50],
  ['BBC News', 20],
  ['NHK', 15],
  ['TechCrunch', 10],
])

const MIN_WIDTH = 400
const MIN_RATIO = 0.8
const MAX_RATIO = 2.4
const BLACK_BAR_MAX_LUMA = 18
const BLACK_BAR_PIXEL_LUMA = 24
const BLACK_BAR_DARK_RATIO = 0.85
const BLACK_BAR_CENTER_GAP = 18
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// 把單一節點收成陣列
// value: 節點或陣列
// 回傳: 陣列
const asList = (value) => {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

// 把屬性收成像素。百分比與空值不當成寬高
// value: 屬性或 meta 內容
// 回傳: 整數，認不出時回傳 null
const px = (value) => {
  const text = String(value ?? '').trim().replace(/px$/i, '')
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  const n = Number(text)
  return Number.isFinite(n) ? Math.round(n) : null
}

// 還原網址裡常見的 HTML 實體
// value: 原始字串
// 回傳: 還原後的字串
const decodeText = (value) => {
  return String(value ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim()
}

// 收成 http(s) 絕對網址
// raw: 圖片或頁面網址
// base: 用來補相對路徑的頁面網址
// 回傳: 絕對網址，不合格時回傳空字串
const absoluteUrl = (raw, base) => {
  try {
    const url = new URL(decodeText(raw), base || undefined)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.toString()
  } catch {
    return ''
  }
}

// 取出標籤上的屬性。屬性順序不影響結果
// tag: 單一標籤
// name: 屬性名
// 回傳: 屬性值，沒有時回傳空字串
const attr = (tag, name) => {
  const matched = String(tag ?? '').match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i'))
  return decodeText(matched?.[1] ?? matched?.[2] ?? matched?.[3] ?? '')
}

// 節點上的 type 或 medium
// node: RSS 節點
// 回傳: 小寫類型，沒有時回傳空字串
const typeText = (node) => String(node?.['@_type'] ?? node?.['@_medium'] ?? '').toLowerCase()

// 取出節點上的網址
// node: RSS 節點
// base: 頁面網址
// 回傳: 絕對網址，沒有時回傳空字串
const nodeUrl = (node, base) => {
  if (typeof node === 'string') return absoluteUrl(node, base)
  const raw = node?.['@_url'] || node?.['@_href'] || node?.['#text'] || ''
  return absoluteUrl(raw, base)
}

// 路徑看起來像標誌、圖示、預設圖或追蹤圖
// url: 圖片網址
// 回傳: 是否應略過
const looksLikeMark = (url) => {
  let text = String(url ?? '').toLowerCase()
  try {
    text = decodeURIComponent(text)
  } catch {
    // 網址編碼不完整時，用原字串判斷
  }
  if (text.includes('.svg') || /\.ico(?:$|\?)/.test(text)) return true
  if (/(^|[^\d])1x1([^\d]|$)/.test(text)) return true
  if (/pixel\.(?:gif|png|jpe?g|webp)(?:$|\?)/.test(text)) return true
  if (/pic_fb\.|udn_baby|\/static\/img\//.test(text)) return true
  if (/logo|icon|default|placeholder/i.test(text)) return true
  return /(^|[^\p{L}\p{N}])(favicon|sprite|avatar|badge|spacer|tracking|tracker)([^\p{L}\p{N}]|$)/u.test(text)
}

// 查詢參數裡的 resize=寬,高
// url: 圖片網址
// 回傳: { width, height }
const resizeSize = (url) => {
  try {
    const raw = new URL(url).searchParams.get('resize') || ''
    const matched = raw.match(/^(\d+)\s*,\s*(\d+)$/)
    if (!matched) return { width: null, height: null }
    return { width: px(matched[1]), height: px(matched[2]) }
  } catch {
    return { width: null, height: null }
  }
}

// 查詢參數裡的寬度。沒有屬性寬度時用來擋小圖
// url: 圖片網址
// 回傳: 寬度，沒有時回傳 null
const queryWidth = (url) => {
  try {
    const params = new URL(url).searchParams
    return px(params.get('width') || params.get('w') || params.get('imwidth') || params.get('sw')) ?? resizeSize(url).width
  } catch {
    return null
  }
}

// 查詢參數裡的高度。沒有屬性高度時用來檢查寬高比
// url: 圖片網址
// 回傳: 高度，沒有時回傳 null
const queryHeight = (url) => {
  try {
    const params = new URL(url).searchParams
    return px(params.get('height') || params.get('h') || params.get('imheight') || params.get('sh')) ?? resizeSize(url).height
  } catch {
    return null
  }
}

// 留下可用的封面。擋掉標誌與預設圖、寬度小於 400、寬高比超出 0.8 到 2.4 的圖
// image: { url, width, height }
// base: 相對網址的頁面
// 回傳: { url, width?, height? }，不合格時回傳 null
export const usableImage = (image, base = '') => {
  const url = absoluteUrl(image?.url, base)
  if (!url || looksLikeMark(url)) return null
  const width = px(image?.width) ?? queryWidth(url)
  const height = px(image?.height) ?? queryHeight(url)
  if (width === 1 || height === 1 || width === 0 || height === 0) return null
  if (width != null && width < MIN_WIDTH) return null
  if (width != null && height != null) {
    const ratio = width / height
    if (ratio > MAX_RATIO || ratio < MIN_RATIO) return null
  }
  const next = { url }
  if (width != null) next.width = width
  if (height != null && height > 1) next.height = height
  return next
}

// 取出同名節點，含 media: 前綴與沒有前綴兩種寫法
// node: 父節點
// name: 標籤名
// 回傳: 節點陣列
const nodesNamed = (node, name) => {
  if (!node || typeof node !== 'object') return []
  const named = node[`media:${name}`] ?? node[name]
  return asList(named)
}

// enclosure，以及 Atom 的 enclosure 連結
// node: item 或 entry
// 回傳: 節點陣列
const enclosureNodes = (node) => {
  const links = asList(node?.link).filter((link) => link?.['@_rel'] === 'enclosure')
  return [...asList(node?.enclosure), ...links]
}

// media:thumbnail，含 media:group 裡的
// node: item 或 entry
// 回傳: 節點陣列
const thumbnailNodes = (node) => {
  const grouped = nodesNamed(node, 'group').flatMap((group) => nodesNamed(group, 'thumbnail'))
  return [...nodesNamed(node, 'thumbnail'), ...grouped]
}

// media:content，含 media:group 裡的
// node: item 或 entry
// 回傳: 節點陣列
const contentNodes = (node) => {
  const grouped = nodesNamed(node, 'group').flatMap((group) => nodesNamed(group, 'content'))
  return [...nodesNamed(node, 'content'), ...grouped]
}

// media:content 是圖片才採用。沒寫類型時，只收常見圖片副檔名
// node: media:content
// url: 已轉成絕對網址
// 回傳: 是否為圖片
const isContentImage = (node, url) => {
  const type = typeText(node)
  if (type.includes('video') || type.includes('audio')) return false
  if (type.includes('image')) return true
  return /\.(avif|bmp|gif|jpe?g|png|webp)(?:$|\?)/i.test(url)
}

// 描述的 HTML。Atom 沒有 description 時改看 summary、content
// node: item 或 entry
// 回傳: HTML 字串
const descriptionHtml = (node) => {
  const raw = node?.description ?? node?.summary ?? node?.content
  if (typeof raw === 'string') return raw
  if (typeof raw?.['#text'] === 'string') return raw['#text']
  if (typeof raw?.__cdata === 'string') return raw.__cdata
  return ''
}

// 描述裡的 img，依出現順序
// html: 描述 HTML
// base: 頁面網址
// 回傳: { url, width, height } 陣列
const imagesInHtml = (html, base) => {
  const images = []
  for (const tag of String(html ?? '').match(/<img\b[^>]*>/gi) ?? []) {
    const url = absoluteUrl(attr(tag, 'src') || attr(tag, 'data-src'), base)
    if (!url) continue
    images.push({ url, width: px(attr(tag, 'width')), height: px(attr(tag, 'height')) })
  }
  return images
}

// Google News Sitemap 的 image:image 節點
// node: url 節點
// 回傳: 圖片網址陣列
const sitemapImageUrls = (node, pageUrl) => {
  const images = asList(node?.['image:image'])
  return images
    .map((entry) => {
      const loc = entry?.['image:loc'] ?? entry?.loc
      if (typeof loc === 'string') return absoluteUrl(loc, pageUrl)
      return absoluteUrl(loc?.['#text'] || loc?.__cdata || '', pageUrl)
    })
    .filter(Boolean)
}

// 依 enclosure、media:thumbnail、media:content、image:image、描述第一張圖的順序挑一張
// node: RSS item、Atom entry 或 Sitemap url
// pageUrl: 文章網址，用來補相對路徑
// 回傳: 可用圖片，沒有時回傳 null
export const imageFromNode = (node, pageUrl) => {
  const candidates = []
  for (const enc of enclosureNodes(node)) {
    if (!typeText(enc).includes('image')) continue
    candidates.push({ url: nodeUrl(enc, pageUrl), width: enc?.['@_width'], height: enc?.['@_height'] })
  }
  for (const thumb of thumbnailNodes(node)) {
    candidates.push({ url: nodeUrl(thumb, pageUrl), width: thumb?.['@_width'], height: thumb?.['@_height'] })
  }
  for (const content of contentNodes(node)) {
    const url = nodeUrl(content, pageUrl)
    if (!isContentImage(content, url)) continue
    candidates.push({ url, width: content?.['@_width'], height: content?.['@_height'] })
  }
  for (const url of sitemapImageUrls(node, pageUrl)) {
    candidates.push({ url, width: null, height: null })
  }
  candidates.push(...imagesInHtml(descriptionHtml(node), pageUrl))
  for (const candidate of candidates) {
    const image = usableImage(candidate, pageUrl)
    if (image) return image
  }
  return null
}

// 從文章 HTML 取出 og:image，並套用同一套過濾
// html: 文章頁 HTML
// pageUrl: 文章網址
// 回傳: 可用圖片，沒有時回傳 null
export const ogImageFromHtml = (html, pageUrl) => {
  let url = ''
  let width = null
  let height = null
  for (const tag of String(html ?? '').match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, 'property') || attr(tag, 'name')).toLowerCase()
    const content = attr(tag, 'content')
    if (!content) continue
    if ((key === 'og:image' || key === 'og:image:url') && !url) url = content
    else if (key === 'og:image:width') width = px(content)
    else if (key === 'og:image:height') height = px(content)
  }
  if (!url) return null
  return usableImage({ url, width, height }, pageUrl)
}

// 抓文章頁的 og:image。逾時、非 HTML 或失敗都回傳 null，不丟出錯誤
// pageUrl: 文章網址
// timeout: 毫秒
// fetchImpl: 可替換的 fetch，測試用
// 回傳: 可用圖片，沒有時回傳 null
export const fetchOgImage = async (pageUrl, { timeout = 5000, fetchImpl = fetch } = {}) => {
  try {
    const res = await fetchImpl(pageUrl, {
      headers: { 'user-agent': 'daily-briefing/1.0', accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || ''
    if (type && !type.includes('html') && !type.includes('xml')) return null
    return ogImageFromHtml(await res.text(), pageUrl)
  } catch {
    return null
  }
}

// 來源所屬分層。台灣媒體最前、其他居次、國外媒體最後
// name: 媒體名稱
// 回傳: 2 台灣、1 其他、0 國外
const tierOf = (name) => {
  if (FOREIGN_OUTLETS.has(name)) return 0
  if (WEIGHTS.has(name)) return 2
  return 1
}

// 媒體權重。名單以外為 0
// name: 媒體名稱
// 回傳: 權重
const weightOf = (name) => WEIGHTS.get(name) ?? 0

// 這個事件裡每家媒體有幾篇
// members: 組內草稿，沒有時各家都視為 0，改用權重排序
// 回傳: 媒體名稱對應篇數
const memberCounts = (members) => {
  const counts = new Map()
  for (const member of members ?? []) {
    counts.set(member.source, (counts.get(member.source) ?? 0) + 1)
  }
  return counts
}

// 台灣媒體優先、國外媒體排最後；同分層依篇數、媒體權重與發布時間排序
// sources: 事件的來源
// counts: memberCounts 的結果
// 回傳: 排序後的新陣列
const rankSources = (sources, counts) => {
  return [...(sources ?? [])].sort((a, b) => {
    const byTier = tierOf(b.name) - tierOf(a.name)
    if (byTier) return byTier
    const byCount = (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0)
    if (byCount) return byCount
    const byWeight = weightOf(b.name) - weightOf(a.name)
    if (byWeight) return byWeight
    return String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? ''))
  })
}

// 組成事件封面。沒有網址或來源名稱時回傳 null
// image: 可用圖片
// sourceName: 媒體名稱
// 回傳: { url, sourceName, width?, height? } 或 null
const eventImage = (image, sourceName) => {
  if (!image?.url || !sourceName) return null
  const next = { url: image.url, sourceName }
  if (image.width) next.width = image.width
  if (image.height) next.height = image.height
  return next
}

// 草稿上已經過濾過的圖片
// draft: 抓 RSS 時留下的草稿
// 回傳: 可用圖片，沒有時回傳 null
const draftImage = (draft) => {
  if (!draft?.image) return null
  return usableImage({ url: draft.image, width: draft.imageWidth, height: draft.imageHeight })
}

// 計算指定矩形區域內的平均亮度與極暗像素比例
// pixels: 原始 RGB/RGBA 位元組
// width: 圖片寬度
// channels: 每像素通道數
// box: { x0, x1, y0, y1 }
// 回傳: { avg, darkRatio }
const regionLuma = (pixels, width, channels, { x0, x1, y0, y1 }) => {
  let sum = 0
  let dark = 0
  let count = 0
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const idx = (y * width + x) * channels
      const luma = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2]
      sum += luma
      if (luma <= BLACK_BAR_PIXEL_LUMA) dark += 1
      count += 1
    }
  }
  if (!count) return { avg: 255, darkRatio: 0 }
  return { avg: sum / count, darkRatio: dark / count }
}

// 偵測圖片左右兩側是否有明顯黑邊（例如直式畫面轉橫圖造成的兩側黑條）
// pixels: 原始 RGB/RGBA 位元組
// width: 圖片寬度
// height: 圖片高度
// channels: 每像素通道數
// 回傳: 是否有左右黑邊
export const hasDarkSideBars = (pixels, width, height, channels = 3) => {
  if (!pixels?.length || width < 20 || height < 20 || channels < 3) return false
  const sideWidth = Math.max(2, Math.floor(width * 0.08))
  const y0 = Math.floor(height * 0.05)
  const y1 = Math.max(y0 + 1, Math.ceil(height * 0.95))
  const left = regionLuma(pixels, width, channels, { x0: 0, x1: sideWidth, y0, y1 })
  const right = regionLuma(pixels, width, channels, { x0: width - sideWidth, x1: width, y0, y1 })
  if (left.avg > BLACK_BAR_MAX_LUMA || right.avg > BLACK_BAR_MAX_LUMA) return false
  if (left.darkRatio < BLACK_BAR_DARK_RATIO || right.darkRatio < BLACK_BAR_DARK_RATIO) return false
  const center = regionLuma(pixels, width, channels, {
    x0: Math.floor(width * 0.25),
    x1: Math.ceil(width * 0.75),
    y0,
    y1,
  })
  return center.avg - Math.max(left.avg, right.avg) >= BLACK_BAR_CENTER_GAP
}

// 下載並縮小圖片後檢查左右兩側是否有明顯黑邊。逾時、過大或解碼失敗時回傳 false
// imageUrl: 圖片網址
// options: timeout（毫秒）與測試用 fetchImpl
// 回傳: 是否有左右黑邊
export const detectBlackBars = async (imageUrl, { timeout = 5000, fetchImpl = fetch } = {}) => {
  try {
    const res = await fetchImpl(imageUrl, {
      headers: { 'user-agent': 'daily-briefing/1.0', accept: 'image/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    })
    if (!res.ok) return false
    const length = Number(res.headers.get('content-length') || 0)
    if (length > MAX_IMAGE_BYTES) return false
    const bytes = Buffer.from(await res.arrayBuffer())
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return false
    const { data, info } = await sharp(bytes)
      .resize({ width: 120, withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    return hasDarkSideBars(data, info.width, info.height, info.channels)
  } catch {
    return false
  }
}

// 幫每個來源補上 image，並為事件挑封面。台灣媒體優先，並略過左右有明顯黑邊的圖改用下一家
// events: 要寫入的事件，就地補上 image
// draftsByUrl: 文章網址對應草稿
// membersByEvent: 事件 id 對應組內草稿
// fetchPage: (url) => 圖片或 null
// checkBlackBars: (url) => Promise<boolean>，偵測圖片左右是否有明顯黑邊
// limit: 文章頁上限
// 回傳: { withImage, fetched, skippedDarkBars }
export const attachEventImages = async (
  events,
  {
    draftsByUrl = new Map(),
    membersByEvent = new Map(),
    fetchPage = fetchOgImage,
    checkBlackBars = detectBlackBars,
    limit = 40,
  } = {},
) => {
  const darkCache = new Map()
  let skippedDarkBars = 0
  // 快取同一網址的黑邊檢查結果，避免重複下載
  // url: 圖片網址
  // 回傳: 是否有左右黑邊
  const hasBars = async (url) => {
    if (!url || !checkBlackBars) return false
    if (!darkCache.has(url)) {
      let dark = false
      try {
        dark = Boolean(await checkBlackBars(url))
      } catch {
        dark = false
      }
      darkCache.set(url, dark)
    }
    return darkCache.get(url)
  }

  const jobs = []
  for (const event of events ?? []) {
    const counts = memberCounts(membersByEvent.get(event.id))
    for (const source of event.sources ?? []) {
      source.image = draftImage(draftsByUrl.get(source.url))?.url ?? null
    }
    const ranked = rankSources(event.sources, counts)
    let hit = null
    let hitIndex = -1
    const rejectedUrls = new Set()
    for (let index = 0; index < ranked.length; index += 1) {
      const source = ranked[index]
      const image = draftImage(draftsByUrl.get(source.url))
      if (!image) continue
      if (await hasBars(image.url)) {
        skippedDarkBars += 1
        rejectedUrls.add(image.url)
        continue
      }
      hit = { source, image }
      hitIndex = index
      break
    }
    const fallback = hit ? eventImage(hit.image, hit.source.name) : null
    const needsLocal = hit && tierOf(hit.source.name) === 0 && ranked.slice(0, hitIndex).some((source) => tierOf(source.name) > 0)
    if (hit && !needsLocal) {
      event.image = fallback
    } else {
      event.image = null
      const candidates = (needsLocal ? ranked.slice(0, hitIndex) : ranked).filter((source) => {
        const draftUrl = draftImage(draftsByUrl.get(source.url))?.url
        return !draftUrl || !rejectedUrls.has(draftUrl)
      })
      if (candidates.length) jobs.push({ event, ranked: candidates, fallback, rejectedUrls })
      else if (fallback) event.image = fallback
    }
  }
  jobs.sort((a, b) => {
    const byCount = (b.event.sourceCount ?? 1) - (a.event.sourceCount ?? 1)
    if (byCount) return byCount
    const byTier = tierOf(b.ranked[0]?.name) - tierOf(a.ranked[0]?.name)
    if (byTier) return byTier
    return weightOf(b.ranked[0]?.name) - weightOf(a.ranked[0]?.name)
  })
  let fetched = 0
  for (let wave = 0; fetched < limit; wave += 1) {
    let progressed = false
    for (const job of jobs) {
      if (fetched >= limit || job.event.image) continue
      const source = job.ranked[wave]
      if (!source?.url) continue
      progressed = true
      fetched += 1
      let found = null
      try {
        found = usableImage(await fetchPage(source.url))
      } catch {
        found = null
      }
      if (!found) continue
      if (job.rejectedUrls.has(found.url) || await hasBars(found.url)) {
        skippedDarkBars += 1
        job.rejectedUrls.add(found.url)
        continue
      }
      source.image = found.url
      job.event.image = eventImage(found, source.name)
    }
    if (!progressed) break
  }
  for (const job of jobs) {
    if (!job.event.image && job.fallback) job.event.image = job.fallback
  }
  const withImage = (events ?? []).filter((event) => event.image?.url).length
  return { withImage, fetched, skippedDarkBars }
}
