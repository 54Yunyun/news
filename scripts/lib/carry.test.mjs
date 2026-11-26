import assert from 'node:assert/strict'
import test from 'node:test'
import { carryAfterLimit } from './carry.mjs'

const done = {
  id: 'evt-new',
  title: '新摘要',
  category: 'finance',
  publishedAt: '2026-11-24T12:00:00+08:00',
  sourceCount: 1,
  highlights: ['一', '二', '三'],
  sources: [{ name: '甲', title: '新', url: 'https://a.example/new', publishedAt: '2026-11-24T12:00:00+08:00' }],
}

const oldUntouched = {
  id: 'evt-old',
  title: '舊摘要',
  category: 'life',
  publishedAt: '2026-11-24T08:00:00+08:00',
  sourceCount: 1,
  highlights: ['一', '二', '三'],
  sources: [{ name: '乙', title: '舊', url: 'https://b.example/1', publishedAt: '2026-11-24T08:00:00+08:00' }],
}

test('上限擋住的事件沿用舊摘要，並用上一份的產生時間補 firstSeenAt', () => {
  const pending = [{
    id: 'evt-pending',
    sources: [{ name: '乙', title: '新標題', url: 'https://b.example/1', publishedAt: '2026-11-24T09:00:00+08:00' }],
  }]
  const result = carryAfterLimit({
    doneEvents: [done],
    pending,
    limitedIds: new Set(['evt-pending']),
    previousItems: [oldUntouched],
    previousGeneratedAt: '2026-11-24T07:10:00+08:00',
    keepRemainingPrevious: false,
  })
  assert.deepEqual(result.titles, ['舊摘要'])
  assert.equal(result.events[0].title, '新摘要')
  const kept = result.events.find((item) => item.title === '舊摘要')
  assert.equal(kept.firstSeenAt, '2026-11-24T07:10:00+08:00')
  assert.deepEqual(result.skipped, [])
})

test('分組被上限打斷時，上一份還沒被取代的事件也留著', () => {
  const result = carryAfterLimit({
    doneEvents: [done],
    pending: [],
    limitedIds: new Set(),
    previousItems: [oldUntouched, {
      ...oldUntouched,
      id: 'evt-same',
      title: '不該重複',
      sources: done.sources,
    }],
    previousGeneratedAt: '2026-11-24T07:10:00+08:00',
    keepRemainingPrevious: true,
  })
  assert.deepEqual(result.titles, ['舊摘要'])
  assert.equal(result.events.filter((item) => item.sources[0].url === done.sources[0].url).length, 1)
})
