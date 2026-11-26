import { sourceLinkKey } from './group.mjs'
import { indexPrevious, reusedEvent } from './incremental.mjs'

// 舊檔沒有 firstSeenAt 時，用上一份的產生時間，避免整批被當成這次才出現
// item: 上一份或沿用後的事件
// previousGeneratedAt: 上一份 news.json 的 generatedAt
// 回傳: 帶 firstSeenAt 的事件
export const withFirstSeen = (item, previousGeneratedAt) => ({
  ...item,
  firstSeenAt: item?.firstSeenAt || previousGeneratedAt || '',
})

// 兩個事件有沒有任何一條相同的來源連結
// left: 事件
// right: 事件
// 回傳: 是否重疊
const sharesUrl = (left, right) => {
  const urls = new Set((left?.sources ?? []).map((source) => source?.url).filter(Boolean))
  return (right?.sources ?? []).some((source) => urls.has(source?.url))
}

// 來源連結鍵。空的不採用
// item: 事件
// 回傳: 排序後的連結鍵，沒有連結時回傳空字串
const keyOf = (item) => sourceLinkKey((item?.sources ?? []).map((source) => source?.url))

// 在還沒用過的舊事件裡，找來源連結重疊最多的一則
// cluster: 這次沒摘要完的事件
// items: 上一份的事件
// used: 已經用過的連結鍵
// 回傳: 舊事件，沒有重疊時回傳 null
const bestOverlap = (cluster, items, used) => {
  const urls = new Set((cluster?.sources ?? []).map((source) => source?.url).filter(Boolean))
  let best = null
  let bestScore = 0
  for (const item of items) {
    const key = keyOf(item)
    if (!key || used.has(key)) continue
    const shared = (item.sources ?? []).filter((source) => urls.has(source?.url)).length
    if (shared > bestScore) {
      best = item
      bestScore = shared
    }
  }
  return best
}

// 事件標題，供日誌使用
// cluster: 這次的事件
// 回傳: 標題或 id
const clusterTitle = (cluster) => cluster?.sources?.[0]?.title || cluster?.id || ''

// 呼叫上限擋住的事件改留舊摘要。已寫進 doneEvents 的維持新結果
// doneEvents: 這次已經摘要或沿用完成的事件
// pending: 原本要重新摘要的事件
// limitedIds: 因為上限沒呼叫到模型的事件 id
// previousItems: 上一份 news.json 的 items
// previousGeneratedAt: 上一份的產生時間
// keepRemainingPrevious: 分組本身被上限打斷時，把上一份還沒被取代的事件也留著
// 回傳: { events, titles, skipped }
export const carryAfterLimit = ({
  doneEvents,
  pending,
  limitedIds,
  previousItems,
  previousGeneratedAt,
  keepRemainingPrevious,
}) => {
  const items = previousItems ?? []
  const used = new Set()
  const mark = (event) => {
    const key = keyOf(event)
    if (key) used.add(key)
    for (const old of items) {
      if (!sharesUrl(event, old)) continue
      const oldKey = keyOf(old)
      if (oldKey) used.add(oldKey)
    }
  }
  for (const event of doneEvents ?? []) mark(event)

  const kept = []
  const titles = []
  const skipped = []
  const indexed = indexPrevious(items)
  const take = (item) => {
    const event = withFirstSeen(item, previousGeneratedAt)
    const key = keyOf(event)
    if (!event?.title || !key || used.has(key)) return false
    used.add(key)
    kept.push(event)
    titles.push(event.title)
    return true
  }

  for (const cluster of pending ?? []) {
    if (!limitedIds?.has(cluster.id)) continue
    if ((doneEvents ?? []).some((event) => event.id === cluster.id)) continue
    const exact = reusedEvent(cluster, indexed, previousGeneratedAt)
    if (exact && take(exact)) continue
    const old = bestOverlap(cluster, items, used)
    if (old && take(withFirstSeen(old, previousGeneratedAt))) continue
    const alreadyKept = (doneEvents ?? []).some((event) => sharesUrl(event, cluster))
      || items.some((item) => used.has(keyOf(item)) && sharesUrl(item, cluster))
    if (alreadyKept) continue
    const title = clusterTitle(cluster)
    if (title) skipped.push(title)
  }
  if (keepRemainingPrevious) {
    for (const item of items) take(withFirstSeen(item, previousGeneratedAt))
  }
  return { events: [...(doneEvents ?? []), ...kept], titles, skipped }
}
