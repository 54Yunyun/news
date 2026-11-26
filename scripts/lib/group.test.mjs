import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMerges, chunkWithOverlap, eventId, parseGroups, sourceLinkKey, unionGroups } from './group.mjs'
import { withRetry } from './llm.mjs'

test('分批會重疊，最後一批涵蓋結尾', () => {
  const chunks = chunkWithOverlap([1, 2, 3, 4, 5], 3, 1)
  assert.deepEqual(chunks, [[1, 2, 3], [3, 4, 5]])
})

test('不認識的 id 略過，同組其餘 id 仍合併', () => {
  const parsed = parseGroups(['a', 'b', 'c'], { groups: [['a', 'b', 'missing'], { ids: ['c', 'a'] }] })
  assert.equal(parsed.ok, false)
  assert.equal(parsed.dropped > 0, true)
  assert.deepEqual(parsed.groups, [['a', 'b'], ['c']])
})

test('整批不是陣列時才全部改成單篇', () => {
  const parsed = parseGroups(['a', 'b'], { note: '不是 groups' })
  assert.equal(parsed.ok, false)
  assert.deepEqual(parsed.groups, [['a'], ['b']])
})

test('漏掉的 id 各自成組，重疊的兩批會併在一起', () => {
  const parsed = parseGroups(['a', 'b', 'c'], { groups: [['a', 'b']] })
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.groups, [['a', 'b'], ['c']])
  const unioned = unionGroups([[['a', 'b'], ['c']], [['b', 'd']]])
  const sorted = unioned.map((group) => [...group].sort()).sort((a, b) => a[0].localeCompare(b[0]))
  assert.deepEqual(sorted, [['a', 'b', 'd'], ['c']])
})

test('合併後超過 8 家就退回，並保留原本的組', () => {
  const groups = [
    { id: 'g1', memberIds: ['a', 'b'] },
    { id: 'g2', memberIds: ['c'] },
  ]
  const logs = []
  const result = applyMerges(groups, { merges: [['g1', 'g2']] }, {
    maxOutlets: 8,
    outletCount: () => 9,
    log: (line) => logs.push(line),
  })
  assert.equal(result.rejected, 1)
  assert.equal(result.groups.length, 2)
  assert.equal(logs.length, 1)
})

test('事件 id 只看各來源代表連結，順序與同家舊稿不改變結果', () => {
  const item = (source, url, publishedAt) => ({ id: url, source, title: url, url, publishedAt })
  const first = item('甲', 'https://a.example/new', '2026-11-24T08:00:00+08:00')
  const second = item('乙', 'https://b.example/1', '2026-11-24T07:00:00+08:00')
  const older = item('甲', 'https://a.example/old', '2026-11-24T01:00:00+08:00')
  assert.equal(eventId([second, first]), eventId([first, second]))
  assert.equal(eventId([first, second, older]), eventId([first, second]))
  assert.notEqual(eventId([first]), eventId([first, second]))
  assert.equal(sourceLinkKey(['https://b.example/1', 'https://a.example/new']), 'https://a.example/new|https://b.example/1')
})

test('暫時性錯誤會等待後重試，超過次數就停下', async () => {
  const waits = []
  let calls = 0
  const value = await withRetry(() => {
    calls += 1
    if (calls < 3) {
      const error = new Error('429')
      error.transient = true
      throw error
    }
    return 'ok'
  }, { retries: 3, delays: [10, 20, 40], wait: async (ms) => waits.push(ms) })
  assert.equal(value, 'ok')
  assert.deepEqual(waits, [10, 20])
  await assert.rejects(() => withRetry(() => {
    const error = new Error('429')
    error.transient = true
    throw error
  }, { retries: 3, delays: [0, 0, 0], wait: async () => {} }))
})
