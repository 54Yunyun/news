import { briefCategories } from './categories.mjs'
import { sourceLinkKey } from './group.mjs'

const CATEGORIES = briefCategories

// 新的事件數少於上一份的一半時視為異常，不覆寫
// nextCount: 這次準備寫入的則數
// previousCount: 上一份的則數
// 回傳: 是否應保留上一份
export const editionTooSmall = (nextCount, previousCount) => {
  return previousCount > 0 && nextCount * 2 < previousCount
}

// 用上一份新聞做成「來源連結組合 → 事件」對照
// items: 上一份 news.json 的 items
// 回傳: Map
export const indexPrevious = (items) => {
  const map = new Map()
  for (const item of items ?? []) {
    if (!Array.isArray(item?.sources)) continue
    const key = sourceLinkKey(item.sources.map((source) => source?.url))
    if (key) map.set(key, item)
  }
  return map
}

// 來源連結組合沒變就沿用舊摘要。標題、重點、角度與 firstSeenAt 留著，時間改用這次抓到的
// cluster: 這次的事件，含 id、sources、publishedAt
// previous: indexPrevious 的結果
// previousGeneratedAt: 上一份檔案的產生時間
// 回傳: 可寫入的事件，不能沿用時回傳 null
export const reusedEvent = (cluster, previous, previousGeneratedAt = '') => {
  const key = sourceLinkKey((cluster?.sources ?? []).map((source) => source?.url))
  const old = key ? previous.get(key) : null
  const highlights = Array.isArray(old?.highlights) ? old.highlights.filter(Boolean) : []
  if (!old?.title || highlights.length < 3 || !CATEGORIES.has(old.category)) return null
  const angles = new Map(
    (old.sources ?? [])
      .filter((source) => source?.url && source.angle)
      .map((source) => [source.url, source.angle]),
  )
  const sources = cluster.sources.map((source) => {
    const next = {
      name: source.name,
      title: source.title,
      url: source.url,
      publishedAt: source.publishedAt,
    }
    const angle = angles.get(source.url)
    if (angle) next.angle = angle
    return next
  })
  const event = {
    id: cluster.id,
    category: old.category,
    publishedAt: cluster.publishedAt,
    firstSeenAt: old.firstSeenAt || previousGeneratedAt || '',
    sourceCount: sources.length,
    title: old.title,
    highlights,
    sources,
  }
  if (Array.isArray(old.commonFacts) && old.commonFacts.length) event.commonFacts = old.commonFacts.filter(Boolean)
  if (old.topicId) {
    event.topicId = old.topicId
    if (old.topicName) event.topicName = old.topicName
  }
  return event
}

// 把時間字串轉成毫秒數，無效時回傳 null
// iso: ISO 8601 時間字串
// 回傳: 毫秒數或 null
const toMs = (iso) => {
  if (!iso) return null
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? null : ms
}

// 替重新摘要的事件補回原本的 firstSeenAt，避免舊事件因來源增減又全部被標成新
// events: 本次要寫入的事件
// previousItems: 上一份 news.json 的 items
// previousGeneratedAt: 上一份的產生時間
// 回傳: 補好 firstSeenAt 的新事件陣列
export const inheritFirstSeen = (events, previousItems, previousGeneratedAt = '') => {
  const seenByUrl = new Map()
  for (const old of previousItems ?? []) {
    const seen = old?.firstSeenAt || previousGeneratedAt || ''
    if (!seen) continue
    for (const source of old?.sources ?? []) {
      if (!source?.url) continue
      const current = seenByUrl.get(source.url)
      const seenMs = toMs(seen)
      const currentMs = toMs(current)
      if (!current || (seenMs != null && currentMs != null && seenMs < currentMs)) {
        seenByUrl.set(source.url, seen)
      }
    }
  }
  const prevMs = toMs(previousGeneratedAt)
  return (events ?? []).map((event) => {
    if (event?.firstSeenAt) return event
    let inherited = ''
    let inheritedMs = null
    for (const source of event?.sources ?? []) {
      const seen = source?.url ? seenByUrl.get(source.url) : ''
      if (!seen) continue
      const seenMs = toMs(seen)
      if (!inherited || (seenMs != null && inheritedMs != null && seenMs < inheritedMs)) {
        inherited = seen
        inheritedMs = seenMs
      }
    }
    if (inherited) return { ...event, firstSeenAt: inherited }
    const pubMs = toMs(event?.publishedAt)
    if (prevMs != null && pubMs != null && pubMs <= prevMs) {
      return { ...event, firstSeenAt: previousGeneratedAt }
    }
    return event
  })
}
