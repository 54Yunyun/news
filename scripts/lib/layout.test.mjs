import assert from 'node:assert/strict'
import test from 'node:test'
import { briefCards, capByCategory, groupBlocks, splitLead, takePage } from '../../src/utils/layout.js'

const item = (id, sourceCount, topicId = '') => ({
  id,
  sourceCount,
  publishedAt: `2026-11-24T0${id}:00:00+08:00`,
  title: id,
  topicId,
  topicName: topicId ? '同一政策' : '',
})

test('頭條是家數最高的一則，次要最多四則', () => {
  const items = [item('1', 1), item('2', 4), item('3', 3), item('4', 2), item('5', 2)]
  const { lead, sides, rest } = splitLead(items)
  assert.equal(lead.id, '2')
  assert.deepEqual(sides.map((entry) => entry.id), ['3', '5', '4', '1'])
  assert.deepEqual(rest, [])
})

test('次要滿四則後，其餘留給列表', () => {
  const items = ['1', '2', '3', '4', '5', '6'].map((id) => item(id, Number(id)))
  const { lead, sides, rest } = splitLead(items)
  assert.equal(lead.id, '6')
  assert.deepEqual(sides.map((entry) => entry.id), ['5', '4', '3', '2'])
  assert.deepEqual(rest.map((entry) => entry.id), ['1'])
})

test('三則以內旁邊少於三則', () => {
  const { lead, sides } = splitLead([item('1', 2), item('2', 5), item('3', 1)])
  assert.equal(lead.id, '2')
  assert.equal(sides.length, 2)
})

test('同一話題在頭條只佔一格，子事件不進其餘列表', () => {
  const items = [
    item('1', 6, 'topic-a'),
    item('2', 5, 'topic-a'),
    item('3', 4, 'topic-a'),
    item('4', 3),
    item('5', 2),
    item('6', 1),
  ]
  const { lead, sides, rest } = splitLead(items)
  assert.equal(lead.id, '1')
  assert.deepEqual(sides.map((entry) => entry.id), ['4', '5', '6'])
  assert.deepEqual(rest, [])
})

test('依時間排序時，頭條與次要改依發布時間由新到舊挑選', () => {
  const items = [
    item('1', 6),
    item('5', 1),
    item('3', 4),
    item('4', 2),
    item('2', 5),
  ]
  const { lead, sides, rest } = splitLead(items, 'time')
  assert.equal(lead.id, '5')
  assert.deepEqual(sides.map((entry) => entry.id), ['4', '3', '2', '1'])
  assert.deepEqual(rest, [])
})

test('其餘每則都是單行', () => {
  const blocks = groupBlocks([
    item('1', 1, 'topic-a'),
    item('2', 4),
    item('3', 1, 'topic-a'),
    item('4', 2),
  ])
  assert.deepEqual(blocks.map((block) => block.type), ['row', 'row', 'row', 'row'])
  assert.equal(blocks[1].item.id, '2')
})

test('每個分頁預設 15 則，展開後才是全部', () => {
  const items = Array.from({ length: 16 }, (_, index) => item(String(index + 1), 1))
  assert.equal(takePage(items, false).length, 15)
  assert.equal(takePage(items, true).length, 16)
})

test('全部頁每個分類最多保留指定則數，避免單一分類佔滿版面', () => {
  const items = [
    ...Array.from({ length: 8 }, (_, index) => ({ ...item(`s${index}`, 3), category: 'sports' })),
    ...Array.from({ length: 8 }, (_, index) => ({ ...item(`g${index}`, 2), category: 'gaming' })),
    ...Array.from({ length: 4 }, (_, index) => ({ ...item(`i${index}`, 5), category: 'international' })),
  ]
  const capped = capByCategory(items, 6)
  assert.equal(capped.filter((entry) => entry.category === 'sports').length, 6)
  assert.equal(capped.filter((entry) => entry.category === 'gaming').length, 6)
  assert.equal(capped.filter((entry) => entry.category === 'international').length, 4)
  assert.equal(capped.length, 16)
})

test('今日重點用最接近的事件標題配分類', () => {
  const events = [
    { title: '美國301調查對台關稅擬定15%利空淡化，台股大漲逾千點', category: 'finance' },
    { title: '國道1號彰化段清晨連環追撞', category: 'life' },
  ]
  const cards = briefCards([
    '美國301調查對台關稅擬定15%利空淡化，台股大漲逾千點重返三萬九千點。',
    { text: '另一句', category: 'tech' },
  ], events)
  assert.equal(cards[0].category, 'finance')
  assert.equal(cards[1].category, 'tech')
})
