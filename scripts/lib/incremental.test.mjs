import assert from 'node:assert/strict'
import test from 'node:test'
import { editionTooSmall, indexPrevious, inheritFirstSeen, reusedEvent } from './incremental.mjs'
import { configureLlmCalls, llmCallCount, reserveLlmCall } from './llm.mjs'

const cluster = {
  id: 'evt-same',
  publishedAt: '2026-11-24T12:00:00+08:00',
  sources: [
    { name: '甲', title: '新甲', url: 'https://a.example/1', publishedAt: '2026-11-24T12:00:00+08:00' },
    { name: '乙', title: '新乙', url: 'https://b.example/2', publishedAt: '2026-11-24T11:00:00+08:00' },
  ],
}

const previousItem = {
  id: 'old-id',
  category: 'finance',
  title: '舊標題',
  highlights: ['一', '二', '三'],
  commonFacts: ['兩家都提到'],
  firstSeenAt: '2026-11-24T07:10:00+08:00',
  sources: [
    { name: '乙', title: '舊乙', url: 'https://b.example/2', angle: '乙的角度' },
    { name: '甲', title: '舊甲', url: 'https://a.example/1', angle: '甲的角度' },
  ],
}

test('來源連結組合相同就沿用摘要，並保留第一次出現的時間', () => {
  const found = reusedEvent(cluster, indexPrevious([previousItem]), '2026-11-24T07:10:00+08:00')
  assert.equal(found.id, 'evt-same')
  assert.equal(found.title, '舊標題')
  assert.deepEqual(found.highlights, ['一', '二', '三'])
  assert.deepEqual(found.commonFacts, ['兩家都提到'])
  assert.equal(found.firstSeenAt, '2026-11-24T07:10:00+08:00')
  assert.equal(found.publishedAt, '2026-11-24T12:00:00+08:00')
  assert.equal(found.sources[0].title, '新甲')
  assert.equal(found.sources[0].angle, '甲的角度')
  assert.equal(found.sources[1].angle, '乙的角度')
})

test('沒有 firstSeenAt 時，用上一份的產生時間，避免整批都被當成新事件', () => {
  const older = { ...previousItem, firstSeenAt: undefined }
  const found = reusedEvent(cluster, indexPrevious([older]), '2026-11-23T18:10:00+08:00')
  assert.equal(found.firstSeenAt, '2026-11-23T18:10:00+08:00')
})

test('多了一家來源就重新摘要', () => {
  const changed = {
    ...cluster,
    sources: [...cluster.sources, { name: '丙', title: '丙', url: 'https://c.example/3', publishedAt: '2026-11-24T12:30:00+08:00' }],
  }
  assert.equal(reusedEvent(changed, indexPrevious([previousItem]), '2026-11-24T07:10:00+08:00'), null)
})

test('摘要不完整或分類不合就不沿用', () => {
  const thin = { ...previousItem, highlights: ['只有一點'] }
  const wrong = { ...previousItem, category: 'entertainment' }
  const indexed = indexPrevious([thin])
  assert.equal(reusedEvent(cluster, indexed, '2026-11-24T07:10:00+08:00'), null)
  assert.equal(reusedEvent(cluster, indexPrevious([wrong]), '2026-11-24T07:10:00+08:00'), null)
})

test('新事件少於上一份一半時保留舊檔，剛好一半仍可寫入', () => {
  assert.equal(editionTooSmall(11, 30), true)
  assert.equal(editionTooSmall(15, 30), false)
  assert.equal(editionTooSmall(0, 0), false)
})

test('呼叫次數達到上限後不再增加', () => {
  configureLlmCalls(2)
  reserveLlmCall()
  reserveLlmCall()
  assert.equal(llmCallCount(), 2)
  assert.throws(() => reserveLlmCall(), (err) => err?.code === 'llm-limit' && llmCallCount() === 2)
})

test('重新摘要的事件若與上一份共用來源、標題重疊或含前版前的舊報導，不應當成新事件', () => {
  const prevAt = '2026-11-26T09:50:37+08:00'
  const previous = [{
    id: 'evt-old',
    title: '沈伯洋取消選前之夜引發爭議，蔣萬安願讓路權',
    firstSeenAt: '2026-11-26T07:00:00+08:00',
    sources: [{ url: 'https://a.example/1', title: '沈伯洋取消選前之夜引發爭議' }],
  }]
  const events = [
    {
      id: 'expanded',
      title: '不同寫法標題',
      publishedAt: '2026-11-26T11:20:00+08:00',
      sources: [{ url: 'https://a.example/1?utm_source=rss' }, { url: 'https://b.example/2' }],
    },
    {
      id: 'older-pub',
      title: '昨天早上的新聞',
      publishedAt: '2026-11-26T08:00:00+08:00',
      sources: [{ url: 'https://c.example/3', publishedAt: '2026-11-26T08:00:00+08:00' }],
    },
    {
      id: 'older-earliest-src',
      title: '有昨天舊來源的新組合',
      publishedAt: '2026-11-26T11:10:00+08:00',
      sources: [
        { url: 'https://e.example/5', publishedAt: '2026-11-26T08:44:00+08:00' },
        { url: 'https://f.example/6', publishedAt: '2026-11-26T11:10:00+08:00' },
      ],
    },
    {
      id: 'same-story-new-links',
      title: '沈伯洋取消選前之夜引發路權爭議，各界熱議',
      publishedAt: '2026-11-26T11:25:00+08:00',
      sources: [{ url: 'https://g.example/7', publishedAt: '2026-11-26T11:25:00+08:00' }],
    },
    {
      id: 'brand-new',
      title: '完全嶄新的突發新聞事件',
      publishedAt: '2026-11-26T11:30:00+08:00',
      sources: [{ url: 'https://d.example/4', publishedAt: '2026-11-26T11:30:00+08:00' }],
    },
  ]
  const next = inheritFirstSeen(events, previous, prevAt)
  assert.equal(next[0].firstSeenAt, '2026-11-26T07:00:00+08:00')
  assert.equal(next[1].firstSeenAt, prevAt)
  assert.equal(next[2].firstSeenAt, prevAt)
  assert.equal(next[3].firstSeenAt, '2026-11-26T07:00:00+08:00')
  assert.equal(next[4].firstSeenAt, undefined)
})
