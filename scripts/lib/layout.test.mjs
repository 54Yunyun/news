import assert from 'node:assert/strict'
import test from 'node:test'
import { groupBlocks, splitLead } from '../../src/utils/layout.js'

const item = (id, sourceCount, topicId = '') => ({
  id,
  sourceCount,
  publishedAt: `2026-11-24T0${id}:00:00+08:00`,
  title: id,
  topicId,
  topicName: topicId ? '同一政策' : '',
})

test('頭條是家數最高的一則，次頭條取偶數，避免落單', () => {
  const items = [item('1', 1), item('2', 4), item('3', 3), item('4', 2), item('5', 2)]
  const { lead, sides, rest } = splitLead(items)
  assert.equal(lead.id, '2')
  assert.deepEqual(sides.map((entry) => entry.id), ['3', '5', '4', '1'])
  assert.deepEqual(rest, [])
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
  assert.deepEqual(sides.map((entry) => entry.id), ['4', '5'])
  assert.deepEqual(rest.map((entry) => entry.id), ['6'])
})

test('同話題收成一區，1 到 2 家用緊湊列，3 家以上用卡片', () => {
  const blocks = groupBlocks([
    item('1', 1, 'topic-a'),
    item('2', 4),
    item('3', 1, 'topic-a'),
    item('4', 2),
  ])
  assert.equal(blocks[0].type, 'topic')
  assert.deepEqual(blocks[0].items.map((entry) => entry.id), ['1', '3'])
  assert.equal(blocks[1].type, 'card')
  assert.equal(blocks[2].type, 'compact')
})
