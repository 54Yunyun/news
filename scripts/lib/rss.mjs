import { XMLParser } from 'fast-xml-parser'
import { briefCategories } from './categories.mjs'
import { imageFromNode } from './image.mjs'
import { toTaipeiIso } from './time.mjs'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  isArray: (tagName) => tagName === 'item' || tagName === 'entry' || tagName === 'url',
})

const CATEGORIES = briefCategories

// 把值收成陣列。XML 只有一筆時解析器會給物件
// value: 單一值或陣列
// 回傳: 陣列
const asList = (value) => {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

// 取出標籤文字。屬性、CDATA 與純文字都收成字串
// node: 解析後的節點
// 回傳: 文字，沒有時回傳空字串
const textOf = (node) => {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim()
  if (typeof node === 'object') {
    if (typeof node['#text'] === 'string') return node['#text'].trim()
    if (typeof node.__cdata === 'string') return node.__cdata.trim()
  }
  return ''
}

// 去掉 HTML 與常見實體，只留下可摘要的短文
// value: RSS 裡的標題或描述
// 回傳: 純文字
export const stripHtml = (value) => {
  return String(value ?? '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// 正規化連結，拿掉追蹤參數，方便判斷是不是同一篇
// raw: 原始網址
// 回傳: 正規化後的網址，解析失敗時回傳空字串
export const canonicalUrl = (raw) => {
  try {
    const url = new URL(String(raw).trim())
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      const name = key.toLowerCase()
      if (name.startsWith('utm_') || name === 'fbclid' || name === 'igshid') url.searchParams.delete(key)
    }
    url.hostname = url.hostname.toLowerCase()
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString()
  } catch {
    return ''
  }
}

// 用網址做出穩定 id
// sourceId: 來源代碼
// url: 正規化後的網址
// 回傳: 如 bbc-world-k3f9
export const itemId = (sourceId, url) => {
  let hash = 2166136261
  for (const char of url) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `${sourceId}-${(hash >>> 0).toString(36)}`
}

// 標題拿來比對前先去掉空白與標點
// title: 標題
// 回傳: 只留文字與數字的小寫字串
export const normalizeTitle = (title) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

// 用二字組重疊比例判斷標題是否幾乎相同
// a: 已正規化的標題
// b: 已正規化的標題
// 回傳: 0 到 1
export const titleScore = (a, b) => {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const grams = new Map()
  for (let i = 0; i < a.length - 1; i += 1) {
    const gram = a.slice(i, i + 2)
    grams.set(gram, (grams.get(gram) ?? 0) + 1)
  }
  let hit = 0
  for (let i = 0; i < b.length - 1; i += 1) {
    const gram = b.slice(i, i + 2)
    const count = grams.get(gram) ?? 0
    if (count > 0) {
      grams.set(gram, count - 1)
      hit += 1
    }
  }
  return (2 * hit) / (a.length + b.length - 2)
}

// 把 RSS 日期收成 Date。ETtoday 的逗號後面有時沒有空格
// raw: pubDate 或 Atom updated
// 回傳: Date，無法解析時回傳 null
export const parseRssDate = (raw) => {
  const text = String(raw ?? '').trim().replace(/\s+/g, ' ').replace(/,(\d)/, ', $1')
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

// 聯合報總覽這類混合訂閱，把原分類收成五類提示
// label: RSS category 文字
// 回傳: 五類之一，對不上時回傳空字串
export const hintFromRssCategory = (label) => {
  const text = stripHtml(label)
  if (!text) return ''
  if (/全球|國際|兩岸/.test(text)) return 'international'
  if (/政治|選舉|國會|立法院|政黨/.test(text)) return 'politics'
  if (/股市|產經|財經|經濟/.test(text)) return 'finance'
  if (/科技|數位|3C|AI/.test(text)) return 'tech'
  return 'life'
}

// 依網址第一段路徑將新聞對應到五類提示。娛樂、體育等非日常範圍回傳空字串
// raw: 正規化後的文章網址
// 回傳: 五類之一，不屬五類時回傳空字串
export const hintFromUrlPath = (raw) => {
  try {
    const seg = new URL(raw).pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? ''
    if (seg === 'international') return 'international'
    if (seg === 'politics') return 'politics'
    if (seg === 'finance') return 'finance'
    if (seg === 'gadget' || seg === 'aitech' || seg === 'tech') return 'tech'
    if (seg === 'local' || seg === 'life' || seg === 'lifestyle' || seg === 'property' || seg === 'eattravel') return 'life'
    return ''
  } catch {
    return ''
  }
}

// 取出單一 HTML 標籤上的屬性值
// tag: HTML 標籤字串
// name: 屬性名稱
// 回傳: 屬性值，沒有時回傳空字串
const metaAttr = (tag, name) => {
  const matched = String(tag ?? '').match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i'))
  return matched?.[1] ?? matched?.[2] ?? matched?.[3] ?? ''
}

// 從文章頁 HTML 取出 description 或 og:description，作為缺乏摘要片段時的短述
// html: 文章頁 HTML
// 回傳: 最多 280 字的純文字，沒有時回傳空字串
export const metaDescriptionFromHtml = (html) => {
  let desc = ''
  let ogDesc = ''
  for (const tag of String(html ?? '').match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (metaAttr(tag, 'name') || metaAttr(tag, 'property')).toLowerCase()
    const content = stripHtml(metaAttr(tag, 'content'))
    if (!content) continue
    if (key === 'description' && !desc) desc = content
    else if (key === 'og:description' && !ogDesc) ogDesc = content
  }
  return (desc || ogDesc).slice(0, 280)
}

// 補讀文章頁的 meta description。逾時或非 HTML 時回傳空字串，不抓全文
// pageUrl: 文章網址
// options: timeout（毫秒）與測試用 fetchImpl
// 回傳: 短述文字，失敗時回傳空字串
export const fetchMetaDescription = async (pageUrl, { timeout = 5000, fetchImpl = fetch } = {}) => {
  try {
    const res = await fetchImpl(pageUrl, {
      headers: { 'user-agent': 'daily-briefing/1.0', accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    })
    if (!res.ok) return ''
    const type = res.headers.get('content-type') || ''
    if (type && !type.includes('html') && !type.includes('xml')) return ''
    return metaDescriptionFromHtml(await res.text())
  } catch {
    return ''
  }
}

// 解析 RSS 2.0、Atom 或 Google News Sitemap，取標題、描述片段、連結、時間與圖片網址
// xml: 訂閱源文字
// source: { id, name, category, splitByRssCategory, splitByUrlCategory }
// 回傳: 新聞草稿陣列
export const parseFeed = (xml, source) => {
  if (!CATEGORIES.has(source.category)) return []
  const doc = parser.parse(String(xml).slice(0, 1_500_000))
  const rssItems = asList(doc?.rss?.channel?.item)
  const atomItems = asList(doc?.feed?.entry)
  const sitemapItems = asList(doc?.urlset?.url)
  const isSitemap = !rssItems.length && !atomItems.length && sitemapItems.length > 0
  const nodes = rssItems.length ? rssItems : atomItems.length ? atomItems : sitemapItems
  const items = []
  for (const node of nodes) {
    const newsNode = isSitemap ? node['news:news'] : null
    const linkNode = asList(node.link).find((link) => !link?.['@_rel'] || link['@_rel'] === 'alternate') ?? node.link
    const link = isSitemap
      ? textOf(node.loc)
      : textOf(linkNode) || linkNode?.['@_href'] || textOf(node.guid) || ''
    const url = canonicalUrl(link)
    const title = stripHtml(textOf(isSitemap ? newsNode?.['news:title'] : node.title)).slice(0, 180)
    const published = isSitemap
      ? textOf(newsNode?.['news:publication_date']) || textOf(node.lastmod)
      : textOf(node.pubDate) || textOf(node.published) || textOf(node.updated) || textOf(node.dc?.date)
    const publishedAt = parseRssDate(published)
    if (!url || !title || !publishedAt) continue
    const snippet = isSitemap
      ? ''
      : stripHtml(textOf(node.description) || textOf(node.summary) || textOf(node['content'])).slice(0, 280)
    let hinted = ''
    if (source.splitByUrlCategory) {
      hinted = hintFromUrlPath(url)
      if (!hinted) continue
    } else if (source.splitByRssCategory) {
      hinted = hintFromRssCategory(stripHtml(textOf(node.category)))
    }
    const category = hinted || source.category
    const image = imageFromNode(node, url)
    items.push({
      id: itemId(source.id, url),
      feedId: hinted ? `${source.id}:${hinted}` : source.id,
      category,
      source: source.name,
      rssSource: stripHtml(textOf(node.source)),
      rssSourceUrl: typeof node.source === 'object' ? String(node.source['@_url'] ?? '') : '',
      publishedAt: toTaipeiIso(publishedAt),
      title,
      snippet,
      url,
      image: image?.url ?? null,
      ...(image?.width ? { imageWidth: image.width } : {}),
      ...(image?.height ? { imageHeight: image.height } : {}),
    })
  }
  return items
}

// 同一連結，或同一家媒體的相似標題，只留較新的一則。不同媒體先留著，交給後面分組
// items: 新聞草稿
// 回傳: 去重後的陣列，新的在前
export const dedupe = (items) => {
  const kept = []
  const urls = new Set()
  const titles = []
  const sorted = [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  for (const item of sorted) {
    if (urls.has(item.url)) continue
    const key = normalizeTitle(item.title)
    if (!key) continue
    const similar = titles.some((title) => title.source === item.source && titleScore(title.key, key) >= 0.9)
    if (similar) continue
    urls.add(item.url)
    titles.push({ key, source: item.source })
    kept.push(item)
  }
  return kept
}

// 每個訂閱源只留最新的幾則。feedId 含分類提示時，各提示分開計算
// items: 新聞草稿
// perSource: 每個來源的上限
// 回傳: 篩過的陣列
export const limitPerFeed = (items, perSource) => {
  const counts = new Map()
  const picked = []
  const sorted = [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  for (const item of sorted) {
    const feedId = item.feedId || item.source
    const count = counts.get(feedId) ?? 0
    if (count >= perSource) continue
    counts.set(feedId, count + 1)
    picked.push(item)
  }
  return picked
}

// 每個分類只留最新的幾則
// items: 已依時間由新到舊排好的草稿
// perCategory: 每個分類的上限
// 回傳: 篩過的陣列
export const selectByCategory = (items, perCategory) => {
  const counts = new Map()
  const picked = []
  for (const item of items) {
    const count = counts.get(item.category) ?? 0
    if (count >= perCategory) continue
    counts.set(item.category, count + 1)
    picked.push(item)
  }
  return picked
}

// 丟掉太舊的草稿
// items: 新聞草稿
// maxAgeHours: 保留的小時數
// now: 用來比較的時間
// 回傳: 還在時限內的草稿
export const withinAge = (items, maxAgeHours, now = new Date()) => {
  const cutoff = now.getTime() - maxAgeHours * 60 * 60 * 1000
  return items.filter((item) => new Date(item.publishedAt).getTime() >= cutoff)
}
