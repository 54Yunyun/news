// 依家數挑頭條。同一 topicId 只佔一格，子事件不另佔頭條或次頭條
// items: 目前要顯示的新聞，順序沿用清單排序
// 回傳: { lead, sides, rest }
export const splitLead = (items) => {
  const ranked = [...(items ?? [])].sort((a, b) => {
    const byCount = (b.sourceCount ?? 1) - (a.sourceCount ?? 1)
    if (byCount) return byCount
    return String(b.publishedAt).localeCompare(String(a.publishedAt))
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
  const available = picked.length - 1
  const sideCount = available >= 4 ? 4 : available >= 2 ? 2 : 0
  const sides = picked.slice(1, 1 + sideCount)
  const shownTopics = new Set([lead, ...sides].map((item) => item?.topicId).filter(Boolean))
  const shownIds = new Set([lead, ...sides].map((item) => item.id))
  const rest = (items ?? []).filter((item) => {
    if (shownIds.has(item.id)) return false
    return !(item?.topicId && shownTopics.has(item.topicId))
  })
  return { lead, sides, rest }
}

// 把其餘新聞排成話題區塊、完整卡片或緊湊列。同話題收成一區，3 家以上用卡片，1–2 家用緊湊列
// items: 頭條區以外的新聞
// 回傳: { type, item?, topicId?, topicName?, items? } 陣列
export const groupBlocks = (items) => {
  const counts = new Map()
  for (const item of items ?? []) {
    if (!item?.topicId) continue
    counts.set(item.topicId, (counts.get(item.topicId) ?? 0) + 1)
  }
  const seen = new Set()
  const blocks = []
  for (const item of items ?? []) {
    if (item?.topicId && counts.get(item.topicId) >= 2) {
      if (seen.has(item.topicId)) continue
      seen.add(item.topicId)
      const members = items.filter((other) => other.topicId === item.topicId)
      blocks.push({
        type: 'topic',
        topicId: item.topicId,
        topicName: item.topicName || '話題',
        items: members,
      })
      continue
    }
    blocks.push({
      type: (item.sourceCount ?? 1) >= 3 ? 'card' : 'compact',
      item,
    })
  }
  return blocks
}
