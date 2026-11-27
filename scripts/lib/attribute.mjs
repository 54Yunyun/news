import { normalizeTitle, titleScore } from './rss.mjs'

const OUTLETS = [
  { name: '中央社', hosts: ['cna.com.tw'], marks: [/（中央社/, /中央社記者/, /中央通訊社/] },
  { name: '自由時報', hosts: ['ltn.com.tw'], marks: [/自由時報/, /自由電子報/] },
  { name: '遊戲角落', hosts: ['game.udn.com'], marks: [/遊戲角落/] },
  { name: '聯合報', hosts: ['udn.com'], marks: [/聯合報/, /聯合新聞網/] },
  { name: 'ETtoday', hosts: ['ettoday.net'], marks: [/ETtoday/] },
  { name: '壹蘋新聞網', hosts: ['nextapple.com'], marks: [/壹蘋新聞網/, /壹蘋新聞/] },
  { name: '巴哈姆特GNN', hosts: ['gnn.gamer.com.tw', 'gamer.com.tw'], marks: [/巴哈姆特/, /GNN\s*記者/] },
  { name: '4Gamers', hosts: ['4gamers.com.tw'], marks: [/4Gamers/] },
  { name: '公視', hosts: ['pts.org.tw'], marks: [/公視新聞/, /公共電視/] },
  { name: 'BBC News', hosts: ['bbc.co.uk', 'bbc.com', 'bbci.co.uk'], marks: [] },
  { name: 'NHK', hosts: ['nhk.or.jp', 'nhk.jp'], marks: [] },
  { name: 'TechCrunch', hosts: ['techcrunch.com'], marks: [] },
]

const AGGREGATOR = { name: 'Yahoo奇摩新聞', hosts: ['news.yahoo.com'] }

const ALIASES = new Map([
  ['中央社', '中央社'],
  ['中央通訊社', '中央社'],
  ['自由時報', '自由時報'],
  ['自由電子報', '自由時報'],
  ['遊戲角落', '遊戲角落'],
  ['udn遊戲角落', '遊戲角落'],
  ['聯合報', '聯合報'],
  ['聯合新聞網', '聯合報'],
  ['ettoday', 'ETtoday'],
  ['ettoday新聞雲', 'ETtoday'],
  ['壹蘋', '壹蘋新聞網'],
  ['壹蘋新聞', '壹蘋新聞網'],
  ['壹蘋新聞網', '壹蘋新聞網'],
  ['巴哈姆特', '巴哈姆特GNN'],
  ['巴哈姆特gnn', '巴哈姆特GNN'],
  ['巴哈姆特gnn新聞', '巴哈姆特GNN'],
  ['4gamers', '4Gamers'],
  ['公視', '公視'],
  ['公視新聞', '公視'],
  ['公視新聞網', '公視'],
  ['yahoo奇摩', 'Yahoo奇摩新聞'],
  ['yahoo奇摩新聞', 'Yahoo奇摩新聞'],
  ['bbc news', 'BBC News'],
  ['bbc', 'BBC News'],
  ['nhk', 'NHK'],
  ['techcrunch', 'TechCrunch'],
])

// 取出網址的主機名稱
// url: 連結
// 回傳: 小寫主機名稱，解析失敗時回傳空字串
const hostname = (url) => {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

// 主機名稱是否屬於名單
// host: 主機名稱
// names: 主機名稱清單
// 回傳: 是否相符
const hostMatches = (host, names) => names.some((name) => host === name || host.endsWith(`.${name}`))

// 把媒體名稱收成固定寫法
// name: RSS 或標題裡的媒體名
// 回傳: 固定名稱，認不出時回傳空字串
export const canonicalOutlet = (name) => {
  const text = String(name ?? '').trim()
  if (!text) return ''
  return ALIASES.get(text.toLowerCase()) || ALIASES.get(text) || ''
}

// 由連結判斷媒體。入口網站另標 aggregator
// url: 新聞連結
// 回傳: { name, aggregator }，認不出時回傳 null
export const outletFromUrl = (url) => {
  const host = hostname(url)
  if (!host) return null
  const outlet = OUTLETS.find((item) => hostMatches(host, item.hosts))
  if (outlet) return { name: outlet.name, aggregator: false }
  if (hostMatches(host, AGGREGATOR.hosts)) return { name: AGGREGATOR.name, aggregator: true }
  return null
}

// 標題結尾若寫著媒體名，拆出來
// title: 標題
// 回傳: { name, title }，沒有結尾時 name 為空字串
const outletFromTitle = (title) => {
  const matched = String(title ?? '').match(/(?:[-|｜－—–／]\s*)([^\s|｜－—–／-]{2,12})$/u)
  const name = canonicalOutlet(matched?.[1] ?? '')
  if (!name) return { name: '', title }
  return { name, title: title.slice(0, matched.index).trim() }
}

// 從電頭或 source 標籤找出原媒體
// item: 新聞草稿
// 回傳: 媒體名稱，沒有時回傳空字串
const outletFromCredit = (item) => {
  const named = canonicalOutlet(item.rssSource)
  if (named && named !== AGGREGATOR.name) return named
  const creditUrl = outletFromUrl(item.rssSourceUrl)
  if (creditUrl && !creditUrl.aggregator) return creditUrl.name
  const text = `${item.title ?? ''}\n${item.snippet ?? ''}`
  const found = OUTLETS.find((outlet) => outlet.marks.some((mark) => mark.test(text)))
  return found?.name ?? ''
}

// 標記轉載。入口網站只在認得出原媒體時改名，並留下 via
// item: 新聞草稿
// 回傳: 補上 source、via 的草稿
export const attributeItem = (item) => {
  const fromHost = outletFromUrl(item.url)
  const fromCredit = outletFromCredit(item)
  const fromTitle = outletFromTitle(item.title)
  const aggregator = fromHost?.aggregator || item.source === AGGREGATOR.name
  let name = item.source
  if (fromCredit) name = fromCredit
  else if (fromTitle.name) name = fromTitle.name
  else if (fromHost && !fromHost.aggregator) name = fromHost.name
  const via = aggregator && name !== AGGREGATOR.name ? (item.source || AGGREGATOR.name) : ''
  return {
    ...item,
    source: name,
    via,
    title: fromTitle.name ? fromTitle.title : item.title,
  }
}

// 入口稿的標題若與某家原文幾乎相同，改記那一家
// items: 已做過 attributeItem 的草稿
// 回傳: 可能改寫 source 的新陣列
export const matchAggregatorTitles = (items) => {
  const directs = items.filter((item) => !item.via && outletFromUrl(item.url)?.aggregator !== true)
  return items.map((item) => {
    const aggregator = item.via || outletFromUrl(item.url)?.aggregator || item.source === AGGREGATOR.name
    if (!aggregator || item.source !== AGGREGATOR.name) return item
    const key = normalizeTitle(item.title)
    const scored = directs
      .map((other) => ({ other, score: titleScore(key, normalizeTitle(other.title)) }))
      .filter((row) => row.score >= 0.9)
    const names = new Set(scored.map((row) => row.other.source))
    if (names.size !== 1) return item
    return { ...item, source: [...names][0], via: item.via || AGGREGATOR.name }
  })
}

// 這篇是不是該媒體自己的連結，而不是入口轉載
// item: 新聞草稿
// 回傳: 是否為自家連結
const isDirect = (item) => {
  const host = outletFromUrl(item.url)
  return Boolean(host && !host.aggregator && host.name === item.source)
}

// 同一家只留一篇。有自家連結時優先留自家連結，時間留較晚的那篇
// items: 已標記媒體的草稿
// 回傳: 去重後的陣列
export const collapseOutletCopies = (items) => {
  const sorted = [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  const kept = []
  for (const item of sorted) {
    const key = normalizeTitle(item.title)
    if (!key) continue
    const index = kept.findIndex((other) => {
      if (other.url === item.url) return true
      if (other.source !== item.source) return false
      return titleScore(normalizeTitle(other.title), key) >= 0.9
    })
    if (index < 0) {
      kept.push(item)
      continue
    }
    const current = kept[index]
    if (isDirect(item) && !isDirect(current)) {
      const publishedAt = current.publishedAt > item.publishedAt ? current.publishedAt : item.publishedAt
      kept[index] = { ...item, publishedAt }
    }
  }
  return kept
}

// 轉載標記後，把同一家的重複稿收成一篇
// items: 新聞草稿
// 回傳: 可送去分組的草稿
export const prepareItems = (items) => collapseOutletCopies(matchAggregatorTitles(items.map(attributeItem)))
