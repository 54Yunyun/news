import { itemId } from './rss.mjs'

// 把清單切成重疊的批次，避免同一事件被切在兩批
// items: 要分組的草稿
// size: 每批幾則
// overlap: 與下一批重疊幾則
// 回傳: 二維陣列
export const chunkWithOverlap = (items, size, overlap) => {
  if (!items.length) return []
  if (items.length <= size) return [items]
  const step = Math.max(1, size - overlap)
  const chunks = []
  for (let index = 0; index < items.length; index += step) {
    chunks.push(items.slice(index, index + size))
    if (index + size >= items.length) break
  }
  return chunks
}

// 每篇各自一組
// ids: 新聞 id
// 回傳: 單篇組別
export const singletonGroups = (ids) => ids.map((id) => [id])

// 從一組的各種寫法取出 id。模型有時回陣列，有時回 { ids }
// group: 一組
// 回傳: id 清單，認不出時回傳 null
const idsInGroup = (group) => {
  if (Array.isArray(group)) return group
  if (typeof group === 'string') return group.split(/[,|\s]+/).filter(Boolean)
  if (!group || typeof group !== 'object') return null
  const nested = group.ids ?? group.id ?? group.members ?? group.memberIds
  if (Array.isArray(nested)) return nested
  if (typeof nested === 'string') return [nested]
  return null
}

// 取出單筆 id。物件只認 id 欄位
// value: 字串或 { id }
// 回傳: 去空白的 id，沒有時回傳空字串
const idText = (value) => {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object' && typeof value.id === 'string') return value.id.trim()
  return ''
}

// 檢查分組 JSON。不認識或重複的 id 略過，其餘組合保留；整批不是陣列才改成每篇一組
// ids: 這一批送出的 id
// payload: 模型回傳的物件
// 回傳: { ok, groups, dropped }
export const parseGroups = (ids, payload) => {
  const alone = singletonGroups(ids)
  const raw = payload?.groups ?? payload?.group
  if (!Array.isArray(raw)) return { ok: false, groups: alone, dropped: ids.length }
  const allowed = new Set(ids)
  const seen = new Set()
  const groups = []
  let dropped = 0
  for (const group of raw) {
    const list = idsInGroup(group)
    if (!list) {
      dropped += 1
      continue
    }
    const next = []
    for (const value of list) {
      const id = idText(value)
      if (!id || !allowed.has(id) || seen.has(id)) {
        dropped += 1
        continue
      }
      seen.add(id)
      next.push(id)
    }
    if (next.length) groups.push(next)
  }
  for (const id of ids) {
    if (!seen.has(id)) groups.push([id])
  }
  return { ok: dropped === 0, groups, dropped }
}

// 把各批有交集的組併在一起
// batches: 每一批的 id 組別
// 回傳: 合併後的 id 組別
export const unionGroups = (batches) => {
  const parent = new Map()
  const find = (id) => {
    if (!parent.has(id)) parent.set(id, id)
    if (parent.get(id) !== id) parent.set(id, find(parent.get(id)))
    return parent.get(id)
  }
  const unite = (left, right) => {
    const a = find(left)
    const b = find(right)
    if (a !== b) parent.set(b, a)
  }
  for (const groups of batches) {
    for (const group of groups) {
      if (!group.length) continue
      group.forEach((id) => find(id))
      for (let index = 1; index < group.length; index += 1) unite(group[0], group[index])
    }
  }
  const buckets = new Map()
  for (const id of parent.keys()) {
    const root = find(id)
    const list = buckets.get(root) ?? []
    list.push(id)
    buckets.set(root, list)
  }
  return [...buckets.values()]
}

// 同一家只留最新的一篇，作為這個事件的來源
// members: 組內草稿
// 回傳: 每家一筆的來源陣列，新的在前
export const representSources = (members) => {
  const sorted = [...members].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  const byName = new Map()
  for (const item of members.length ? sorted : []) {
    if (!byName.has(item.source)) byName.set(item.source, item)
  }
  return [...byName.values()].map((item) => ({
    name: item.source,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    memberId: item.id,
  }))
}

// 把來源連結排成穩定的比對鍵。順序不影響結果
// urls: 來源網址
// 回傳: 排序後以 | 接起的字串
export const sourceLinkKey = (urls) => {
  return [...(urls ?? [])].map((url) => String(url ?? '').trim()).filter(Boolean).sort().join('|')
}

// 用各來源連結排序後的雜湊做出事件 id。同一家只留代表連結，所以跨次更新不會因為多抓到舊稿而改變
// members: 組內草稿
// 回傳: evt- 開頭的 id
export const eventId = (members) => {
  const represented = representSources(members)
  const urls = represented.length ? represented.map((item) => item.url) : members.map((item) => item.url)
  return itemId('evt', sourceLinkKey(urls) || 'empty')
}

// 合併檢查。超過家數上限的合併整組退回，並計入 rejected
// groups: { id, memberIds } 陣列
// payload: 模型回傳的 { merges }
// outletCount: (memberIds) => 家數
// maxOutlets: 一家事件最多幾家媒體
// log: 記錄退回原因
// 回傳: { groups, rejected }
export const applyMerges = (groups, payload, { outletCount, maxOutlets = 8, log = () => {} } = {}) => {
  const keep = () => ({ groups, rejected: 0 })
  if (!payload || !Array.isArray(payload.merges)) {
    log('[news] 合併檢查未採用，維持分組結果')
    return keep()
  }
  const byId = new Map(groups.map((group) => [group.id, group]))
  const seen = new Set()
  const next = []
  let rejected = 0
  for (const merge of payload.merges) {
    if (!Array.isArray(merge) || merge.length === 0) {
      log('[news] 合併檢查未採用，維持分組結果')
      return keep()
    }
    for (const id of merge) {
      if (typeof id !== 'string' || !byId.has(id) || seen.has(id)) {
        log('[news] 合併檢查未採用，維持分組結果')
        return keep()
      }
      seen.add(id)
    }
    if (merge.length === 1) {
      next.push(byId.get(merge[0]))
      continue
    }
    const memberIds = merge.flatMap((id) => byId.get(id).memberIds)
    const count = outletCount(memberIds)
    if (count > maxOutlets) {
      rejected += 1
      log(`[news] 合併檢查略過：合併後 ${count} 家，超過 ${maxOutlets} 家`)
      merge.forEach((id) => next.push(byId.get(id)))
      continue
    }
    next.push({ id: merge[0], memberIds })
  }
  for (const group of groups) {
    if (!seen.has(group.id)) next.push(group)
  }
  return { groups: next, rejected }
}

// 名額用的暫時分類。只決定要送進模型的數量，不寫進 news.json
// members: 組內草稿
// 回傳: 五類之一
export const hintCategory = (members) => {
  const counts = new Map()
  for (const item of members) counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
  let best = members[0]?.category ?? 'life'
  let bestCount = -1
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category
      bestCount = count
    }
  }
  const tied = [...counts.values()].filter((count) => count === bestCount).length > 1
  if (!tied) return best
  const newest = [...members].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0]
  return newest?.category || best
}

// 每個分類只留來源較多、其次較新的事件
// events: 已摘要的事件
// perCategory: 每個分類的上限
// 回傳: 篩過的事件
export const selectEvents = (events, perCategory) => {
  const sorted = [...events].sort((a, b) => {
    const byCount = (b.sourceCount ?? 1) - (a.sourceCount ?? 1)
    if (byCount) return byCount
    return String(b.publishedAt).localeCompare(String(a.publishedAt))
  })
  const counts = new Map()
  const picked = []
  for (const event of sorted) {
    const count = counts.get(event.category) ?? 0
    if (count >= perCategory) continue
    counts.set(event.category, count + 1)
    picked.push(event)
  }
  return picked
}
