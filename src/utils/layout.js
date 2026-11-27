import { categories } from '../constants/categories.js'

const newsCategories = new Set(categories.filter((item) => item.id !== 'all').map((item) => item.id))

// 依排序模式挑頭條與最多四則次要。同一 topicId 只佔一格，子事件不另佔頭條或次要
// items: 目前要顯示的新聞，順序沿用清單排序
// mode: coverage（多家優先）或 time（依時間由新到舊）
// 回傳: { lead, sides, rest }
export const splitLead = (items, mode = 'coverage') => {
  const ranked = [...(items ?? [])].sort((a, b) => {
    if (mode !== 'time') {
      const byCount = (b.sourceCount ?? 1) - (a.sourceCount ?? 1)
      if (byCount) return byCount
    }
    return new Date(b.publishedAt) - new Date(a.publishedAt) || String(b.publishedAt).localeCompare(String(a.publishedAt))
  })
  const picked = []
  const seenTopics = new Set()
  for (const item of ranked) {
    if (item?.topicId && seenTopics.has(item.topicId)) continue
    if (item?.topicId) seenTopics.add(item.topicId)
    picked.push(item)
  }
  if (!picked.length) return { lead: null, sides: [], rest: [] }
  const lead = picked[0]
  const sides = picked.slice(1, 5)
  const shownTopics = new Set([lead, ...sides].map((item) => item?.topicId).filter(Boolean))
  const shownIds = new Set([lead, ...sides].map((item) => item.id))
  const rest = (items ?? []).filter((item) => {
    if (shownIds.has(item.id)) return false
    return !(item?.topicId && shownTopics.has(item.topicId))
  })
  return { lead, sides, rest }
}

// 其餘新聞每則一列。展開前只顯示分類、標題、家數與時間
// items: 頭條與次要以外的新聞
// 回傳: { type, item } 陣列
export const groupBlocks = (items) => {
  return (items ?? []).map((item) => ({ type: 'row', item }))
}

// 預設只取前幾則。已經展開的分頁回傳全部
// items: 這個分頁排序後的新聞
// open: 這個分頁是否已按過看更多
// size: 預設則數
// 回傳: 要畫出來的新聞
export const takePage = (items, open = false, size = 15) => {
  const list = items ?? []
  if (open) return list
  return list.slice(0, size)
}

// 限制每個分類最多顯示幾則，供「全部」分頁避免單一分類佔滿版面
// items: 已排序好的新聞陣列
// maxPerCategory: 每個分類上限，預設 6
// 回傳: 篩選後的新聞陣列
export const capByCategory = (items, maxPerCategory = 6) => {
  const counts = new Map()
  const picked = []
  for (const item of items ?? []) {
    const key = item?.category || ''
    const count = counts.get(key) ?? 0
    if (count >= maxPerCategory) continue
    counts.set(key, count + 1)
    picked.push(item)
  }
  return picked
}

// 兩段文字的二字組重疊比例
// a: 已去掉標點的文字
// b: 已去掉標點的文字
// 回傳: 0 到 1
const overlap = (a, b) => {
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

// 用標題重疊判斷這句重點屬於哪個分類
// text: 一句今日重點
// events: 新聞事件
// 回傳: 分類代碼，對不上時回傳空字串
const categoryForBrief = (text, events) => {
  const key = String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  let best = ''
  let bestScore = 0.2
  for (const event of events ?? []) {
    const title = String(event?.title ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
    const score = overlap(key, title)
    if (score > bestScore) {
      best = event.category || ''
      bestScore = score
    }
  }
  return newsCategories.has(best) ? best : ''
}

// 今日重點配上分類。已帶合法分類的沿用，否則依標題對應
// lines: 字串或 { text, category }
// events: 新聞事件
// 回傳: { text, category } 陣列，最多三則
export const briefCards = (lines, events) => {
  const cards = []
  for (const line of lines ?? []) {
    const text = typeof line === 'string' ? line.trim() : String(line?.text ?? '').trim()
    if (!text) continue
    const given = typeof line === 'object' && line ? String(line.category ?? '') : ''
    const category = newsCategories.has(given) ? given : categoryForBrief(text, events)
    cards.push({ text, category })
  }
  return cards.slice(0, 3)
}
