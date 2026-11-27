import { readFile } from 'node:fs/promises'
import { prepareItems } from './lib/attribute.mjs'
import { briefCategories } from './lib/categories.mjs'
import { attachEventImages } from './lib/image.mjs'
import { loadEnv, redact, readEnv } from './lib/env.mjs'
import {
  applyMerges,
  chunkWithOverlap,
  eventId,
  hintCategory,
  parseGroups,
  representSources,
  selectEvents,
  singletonGroups,
  unionGroups,
} from './lib/group.mjs'
import { carryAfterLimit } from './lib/carry.mjs'
import { editionTooSmall, indexPrevious, inheritFirstSeen, reusedEvent } from './lib/incremental.mjs'
import { completeJson, configureLlmCalls, llmCallCount, llmCallLimitValue, llmCallsRemaining, llmLimitReached } from './lib/llm.mjs'
import { fetchMetaDescription, limitPerFeed, parseFeed, withinAge } from './lib/rss.mjs'
import {
  applyBrief,
  applyCluster,
  applySummary,
  applyTopics,
  briefSystem,
  buildBriefPrompt,
  buildClusterPrompt,
  buildGroupPrompt,
  buildMergePrompt,
  buildNewsFile,
  buildTopicPrompt,
  buildUserPrompt,
  clusterSystem,
  groupSystem,
  mergeSystem,
  systemPrompt,
  topicSystem,
  toFallbackEvent,
  toSingleEvent,
} from './lib/summary.mjs'
import { writeJson } from './lib/write-json.mjs'

const newsFile = new URL('../public/data/news.json', import.meta.url)

// 讀正整數設定，不合法則用預設
// value: 設定值
// fallback: 預設
// 回傳: 正整數
const positive = (value, fallback) => (Number.isInteger(value) && value > 0 ? value : fallback)

// 抓一個訂閱源。失敗或沒有項目時回傳空陣列，讓其他來源繼續
// source: sources.json 裡的一筆
// 回傳: 草稿陣列
const fetchSource = async (source) => {
  try {
    const res = await fetch(source.url, {
      headers: {
        'user-agent': 'daily-briefing/1.0',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const items = parseFeed(await res.text(), source)
    if (!items.length) {
      console.error(`[news] 略過 ${source.name} ${source.id}：沒有可解析的項目`)
      return { ok: false, source, items: [] }
    }
    console.log(`[news] ${source.name} ${source.id} 取得 ${items.length} 則`)
    return { ok: true, source, items }
  } catch (err) {
    console.error(`[news] 略過 ${source.name} ${source.id}：${redact(err?.message)}`)
    return { ok: false, source, items: [] }
  }
}

// 組內最新的一篇
// members: 草稿
// 回傳: 最新的一篇
const newest = (members) => [...members].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0]

// 依家數與時間挑出要摘要的事件。分類只用來分配名額
// clusters: 事件
// perCategory: 每個分類的上限
// 回傳: 要送進模型的事件
const chooseClusters = (clusters, perCategory) => {
  const ranked = [...clusters].sort((a, b) => b.sourceCount - a.sourceCount || b.publishedAt.localeCompare(a.publishedAt))
  const counts = new Map()
  const chosen = []
  for (const cluster of ranked) {
    const count = counts.get(cluster.hint) ?? 0
    if (count >= perCategory) continue
    counts.set(cluster.hint, count + 1)
    chosen.push(cluster)
  }
  return chosen
}

// 分批請模型分組。不合法的 id 略過並保留其餘合併；額度不夠時不再分組
// items: 草稿
// size: 每批幾則
// overlap: 重疊幾則
// reserve: 要留給合併、摘要、今日重點與話題的呼叫次數
// 回傳: 各批的 id 組別
const groupInBatches = async (items, size, overlap, reserve) => {
  const batches = []
  let held = false
  for (const chunk of chunkWithOverlap(items, size, overlap)) {
    const ids = chunk.map((item) => item.id)
    if (held || llmCallsRemaining() <= reserve) {
      if (!held) console.error('[news] 保留後續摘要、今日重點與話題的呼叫額度，剩下的批次改為各篇一組')
      held = true
      batches.push(singletonGroups(ids))
      continue
    }
    try {
      const payload = await completeJson({
        user: buildGroupPrompt(chunk),
        system: groupSystem,
        maxTokens: Math.min(8000, 800 + chunk.length * 40),
      })
      const parsed = parseGroups(ids, payload)
      if (!parsed.ok) {
        const merged = parsed.groups.filter((group) => group.length > 1).length
        console.error(merged
          ? `[news] 分組略過 ${parsed.dropped} 個不合法 id，保留 ${merged} 組多家`
          : '[news] 分組批次不合法，改為各篇一組')
      }
      batches.push(parsed.groups)
    } catch (err) {
      if (err?.code !== 'llm-limit') console.error(`[news] 分組批次失敗，改為各篇一組：${redact(err?.message)}`)
      batches.push(singletonGroups(ids))
    }
  }
  return batches
}

// 請模型看代表標題，把其實是同一事件的組合併。超過家數就退回
// groups: { id, memberIds }
// byId: 草稿對照
// maxSources: 一家事件最多幾家媒體
// 回傳: { groups, rejected }
const mergeGroups = async (groups, byId, maxSources) => {
  if (groups.length < 2) return { groups, rejected: 0 }
  const titled = groups.map((group) => {
    const members = group.memberIds.map((id) => byId.get(id)).filter(Boolean)
    return { id: group.id, title: newest(members)?.title ?? group.id }
  })
  try {
    const payload = await completeJson({
      user: buildMergePrompt(titled),
      system: mergeSystem,
      maxTokens: Math.min(4000, 300 + titled.length * 20),
    })
    return applyMerges(groups, payload, {
      maxOutlets: maxSources,
      outletCount: (memberIds) => representSources(memberIds.map((id) => byId.get(id)).filter(Boolean)).length,
      log: (line) => console.error(line),
    })
  } catch (err) {
    if (err?.code !== 'llm-limit') console.error(`[news] 合併檢查未採用，維持分組結果：${redact(err?.message)}`)
    return { groups, rejected: 0 }
  }
}

// 多家事件整合成一則。失敗的組別稍後改走單篇摘要。達到呼叫上限的不改走單篇
// clusters: 兩家以上的事件
// batchSize: 一批幾個事件
// 回傳: { events, fallbacks, fallbackCount, limitedIds }
const summarizeClusters = async (clusters, batchSize) => {
  const events = []
  const fallbacks = []
  const limitedIds = []
  let fallbackCount = 0
  for (let index = 0; index < clusters.length; index += batchSize) {
    const batch = clusters.slice(index, index + batchSize)
    try {
      const payload = await completeJson({
        user: buildClusterPrompt(batch),
        system: clusterSystem,
        maxTokens: Math.min(8000, 600 + batch.reduce((sum, group) => sum + group.sources.length, 0) * 240),
      })
      for (const group of batch) {
        const event = applyCluster(group, payload)
        if (event) events.push(event)
        else {
          fallbackCount += 1
          fallbacks.push(group)
        }
      }
    } catch (err) {
      fallbackCount += batch.length
      if (err?.code === 'llm-limit') {
        limitedIds.push(...batch.map((group) => group.id))
        continue
      }
      console.error(`[news] 整合摘要失敗，改走單篇：${redact(err?.message)}`)
      fallbacks.push(...batch)
    }
  }
  return { events, fallbacks, fallbackCount, limitedIds }
}

// 單篇摘要。多家整合失敗時沿用各家連結，不寫角度
// jobs: { draft, group, clusterId }
// batchSize: 一批幾則
// 回傳: { events, limitedIds }
const summarizeSingles = async (jobs, batchSize) => {
  const events = []
  const limitedIds = []
  for (let index = 0; index < jobs.length; index += batchSize) {
    const batch = jobs.slice(index, index + batchSize)
    try {
      const payload = await completeJson({
        user: buildUserPrompt(batch.map((job) => job.draft)),
        system: systemPrompt,
        maxTokens: Math.min(8000, 400 + batch.length * 280),
      })
      const summaries = new Map(applySummary(batch.map((job) => job.draft), payload).map((item) => [item.id, item]))
      for (const job of batch) {
        const summary = summaries.get(job.draft.id)
        if (!summary) {
          console.error(`[news] 略過單篇摘要：${job.draft.id}`)
          continue
        }
        events.push(job.group ? toFallbackEvent(job.group, summary) : toSingleEvent(job.draft, summary))
      }
    } catch (err) {
      if (err?.code === 'llm-limit') {
        limitedIds.push(...batch.map((job) => job.clusterId))
        continue
      }
      console.error(`[news] 單篇摘要失敗，略過這一批：${redact(err?.message)}`)
    }
  }
  return { events, limitedIds }
}

// 上一份的三句重點。不足三句就當成沒有
// value: todayBrief
// 回傳: 三句話，或 null
const usableBrief = (value) => {
  const lines = Array.isArray(value) ? value.filter((line) => typeof line === 'string' && line.trim()) : []
  return lines.length >= 3 ? lines.slice(0, 3) : null
}

// 請模型整理三句今日重點。失敗或達到上限時沿用上一份
// events: 這次要寫入的事件
// previousBrief: 上一份的 todayBrief
// 回傳: 三句話，或 null
const loadBrief = async (events, previousBrief) => {
  const fallback = usableBrief(previousBrief)
  if (!events.length) return fallback
  try {
    const payload = await completeJson({
      user: buildBriefPrompt(events),
      system: briefSystem,
      maxTokens: 400,
    })
    const brief = applyBrief(payload)
    if (brief) return brief
    console.error('[news] 今日重點格式不合，沿用上一份')
  } catch (err) {
    if (err?.code === 'llm-limit') console.error(fallback ? '[news] 因呼叫上限沿用舊的今日重點' : '[news] 因呼叫上限略過今日重點')
    else console.error(`[news] 今日重點未更新：${redact(err?.message)}`)
  }
  return fallback
}

// 讀上一份 news.json。沒有檔案或格式不對就當成沒有可沿用的摘要
// 回傳: 解析後的物件，讀不到時回傳 null
const readPrevious = async () => {
  try {
    const data = JSON.parse(await readFile(newsFile, 'utf8'))
    if (!Array.isArray(data?.items)) return null
    return data
  } catch (err) {
    if (err?.code !== 'ENOENT') console.error(`[news] 讀不到上一份 news.json，這次全部重新摘要：${redact(err?.message)}`)
    return null
  }
}

// 抓 RSS、分組、摘要，成功才覆寫 news.json
// 回傳: 無
const main = async () => {
  try {
    await run()
  } finally {
    console.log(`[news] LLM 呼叫 ${llmCallCount()} 次，上限 ${llmCallLimitValue()}`)
  }
}

// 為即將送進摘要但缺少描述片段的代表文章補讀 meta description（不抓全文）
// clusters: 待重新摘要的事件
// limit: 最多補讀篇數
// 回傳: 成功補上片段的篇數
const fillMissingSnippets = async (clusters, limit = 25) => {
  const targets = []
  const seen = new Set()
  for (const group of clusters) {
    const picked = group.sourceCount >= 2
      ? group.sources.map((source) => group.members.find((item) => item.id === source.memberId)).filter(Boolean)
      : [newest(group.members)].filter(Boolean)
    for (const draft of picked) {
      if (draft.snippet || seen.has(draft.url)) continue
      seen.add(draft.url)
      targets.push(draft)
      if (targets.length >= limit) break
    }
    if (targets.length >= limit) break
  }
  if (!targets.length) return 0
  const results = await Promise.all(targets.map((draft) => fetchMetaDescription(draft.url)))
  let filled = 0
  targets.forEach((draft, index) => {
    if (!results[index]) return
    draft.snippet = results[index]
    filled += 1
  })
  return filled
}

// 執行一次抓取。呼叫次數達到上限後，剩下的批次沿用原本的退回
// 回傳: 無
const run = async () => {
  await loadEnv()
  const config = JSON.parse(await readFile(new URL('./sources.json', import.meta.url), 'utf8'))
  const perCategory = positive(config.perCategory, 8)
  const perSource = positive(config.perSource, 12)
  const batchSize = positive(config.batchSize, 4)
  const groupBatchSize = positive(config.groupBatchSize, 40)
  const groupOverlap = positive(config.groupOverlap, 8)
  const maxSources = positive(config.maxSources, 8)
  const maxLlmCalls = positive(config.maxLlmCalls, 30)
  const maxAgeHours = Number.isFinite(config.maxAgeHours) && config.maxAgeHours > 0 ? config.maxAgeHours : 36
  configureLlmCalls(maxLlmCalls)
  const sources = Array.isArray(config.sources) ? config.sources : []
  if (!readEnv('LLM_API_KEY') || !readEnv('LLM_MODEL')) throw new Error('缺少 LLM_API_KEY 或 LLM_MODEL')

  const fetched = await Promise.all(sources.map((source) => fetchSource(source)))
  const failedSources = fetched.filter((entry) => !entry.ok).map((entry) => `${entry.source.name} ${entry.source.id}`)
  console.log(`[news] 來源 ${fetched.length} 個，失敗 ${failedSources.length} 個${failedSources.length ? `：${failedSources.join('、')}` : ''}`)
  const batches = fetched.flatMap((entry) => entry.items)
  const fresh = withinAge(batches, maxAgeHours)
  const picked = limitPerFeed(prepareItems(fresh), perSource)
  if (!picked.length) throw new Error('沒有可摘要的新聞')
  console.log(`[news] 素材 ${picked.length} 則，分組每批 ${groupBatchSize} 則`)

  const byId = new Map(picked.map((item) => [item.id, item]))
  const reserve = Math.ceil((perCategory * briefCategories.size) / batchSize) + 3
  const grouped = unionGroups(await groupInBatches(picked, groupBatchSize, Math.min(groupOverlap, groupBatchSize - 1), reserve))
  const prelim = grouped.map((memberIds, index) => ({ id: `g${index + 1}`, memberIds }))
  const merged = await mergeGroups(prelim, byId, maxSources)
  const clusters = merged.groups.map((group) => {
    const members = group.memberIds.map((id) => byId.get(id)).filter(Boolean)
    const represented = representSources(members)
    return {
      id: eventId(members),
      members,
      sources: represented,
      sourceCount: represented.length,
      publishedAt: members.map((item) => item.publishedAt).sort().at(-1) ?? '',
      hint: hintCategory(members),
    }
  }).filter((group) => group.members.length && group.publishedAt)

  const chosen = chooseClusters(clusters, perCategory)
  const previous = await readPrevious()
  const previousItems = indexPrevious(previous?.items)
  const previousGeneratedAt = previous?.generatedAt || ''
  const carried = []
  const pending = []
  for (const cluster of chosen) {
    const kept = reusedEvent(cluster, previousItems, previousGeneratedAt)
    if (kept) carried.push(kept)
    else pending.push(cluster)
  }
  console.log(`[news] 分組 ${clusters.length} 個事件，送出 ${chosen.length} 個，沿用摘要 ${carried.length} 則，重新摘要 ${pending.length} 則`)
  const filledSnippets = await fillMissingSnippets(pending)
  if (filledSnippets) console.log(`[news] 補讀文章頁短述 ${filledSnippets} 則`)
  const multi = pending.filter((group) => group.sourceCount >= 2)
  const single = pending.filter((group) => group.sourceCount < 2)
  const clustered = await summarizeClusters(multi, batchSize)
  const jobs = [
    ...single.map((group) => ({ draft: newest(group.members), group: null, clusterId: group.id })),
    ...clustered.fallbacks.map((group) => ({ draft: newest(group.members), group, clusterId: group.id })),
  ]
  const singles = await summarizeSingles(jobs, batchSize)
  const doneEvents = [...carried, ...clustered.events, ...singles.events]
  let events = doneEvents
  if (llmLimitReached()) {
    const recovered = carryAfterLimit({
      doneEvents,
      pending,
      limitedIds: new Set([...clustered.limitedIds, ...singles.limitedIds]),
      previousItems: previous?.items ?? [],
      previousGeneratedAt,
      keepRemainingPrevious: true,
    })
    events = recovered.events
    for (const title of recovered.titles) console.error(`[news] 因呼叫上限沿用舊摘要：${title}`)
    for (const title of recovered.skipped) console.error(`[news] 因呼叫上限略過尚無舊摘要的事件：${title}`)
  }
  const capped = llmLimitReached()
  const selected = capped ? events : selectEvents(events, perCategory)
  if (!selected.length) throw new Error('沒有可寫入的事件')
  let todayBrief = null
  if (llmLimitReached()) {
    todayBrief = usableBrief(previous?.todayBrief)
    console.error(todayBrief ? '[news] 因呼叫上限沿用舊的今日重點' : '[news] 因呼叫上限略過今日重點')
  } else {
    todayBrief = await loadBrief(selected, previous?.todayBrief)
  }
  let written = selected
  if (!llmLimitReached() && selected.length >= 2) {
    try {
      const payload = await completeJson({
        user: buildTopicPrompt(selected),
        system: topicSystem,
        maxTokens: Math.min(4000, 400 + selected.length * 40),
      })
      written = applyTopics(selected, payload)
    } catch (err) {
      if (err?.code === 'llm-limit') console.error('[news] 因呼叫上限略過話題串連')
      else console.error(`[news] 話題串連未採用：${redact(err?.message)}`)
    }
  } else if (llmLimitReached() && selected.length >= 2) {
    console.error('[news] 因呼叫上限略過話題串連')
  }
  const previousCount = Array.isArray(previous?.items) ? previous.items.length : 0
  if (editionTooSmall(written.length, previousCount)) {
    console.error(`[news] 新事件 ${written.length} 則，少於上一份 ${previousCount} 則的一半，保留上一份 news.json`)
    return
  }
  written = inheritFirstSeen(written, previous?.items, previousGeneratedAt)
  const draftsByUrl = new Map(picked.map((item) => [item.url, item]))
  const membersByEvent = new Map(chosen.map((cluster) => [cluster.id, cluster.members]))
  const images = await attachEventImages(written, { draftsByUrl, membersByEvent })
  console.log(`[news] 封面 ${images.withImage} 則，文章頁 ${images.fetched} 次${images.skippedDarkBars ? `，略過黑邊 ${images.skippedDarkBars} 張` : ''}`)
  await writeJson(newsFile, buildNewsFile(written, new Date(), { previousGeneratedAt, todayBrief }))
  const multiCount = written.filter((item) => item.sourceCount >= 2).length
  const returned = merged.rejected + clustered.fallbackCount
  console.log(`[news] 已寫入 ${written.length} 則事件，多家 ${multiCount} 則，分組 ${clusters.length} 個，退回 ${returned} 組`)
}

main().catch((err) => {
  console.error(`[news] 保留原本的 news.json：${redact(err?.message, [readEnv('LLM_API_KEY')])}`)
  process.exitCode = 1
})
