import assert from 'node:assert/strict'
import test from 'node:test'
import { formatEdition, isFreshItem } from '../../src/utils/format.js'

test('版次跟著台北時間的小時走', () => {
  assert.equal(formatEdition('2026-11-24T05:00:00+08:00'), '晨間版')
  assert.equal(formatEdition('2026-11-24T07:10:00+08:00'), '晨間版')
  assert.equal(formatEdition('2026-11-24T10:59:00+08:00'), '晨間版')
  assert.equal(formatEdition('2026-11-24T11:00:00+08:00'), '午間版')
  assert.equal(formatEdition('2026-11-24T12:10:00+08:00'), '午間版')
  assert.equal(formatEdition('2026-11-24T16:59:00+08:00'), '午間版')
  assert.equal(formatEdition('2026-11-24T17:00:00+08:00'), '晚間版')
  assert.equal(formatEdition('2026-11-24T18:10:00+08:00'), '晚間版')
  assert.equal(formatEdition('2026-11-24T04:59:00+08:00'), '晚間版')
})

test('只有比上一份更新還晚出現的事件算新', () => {
  const previous = '2026-11-24T07:10:00+08:00'
  assert.equal(isFreshItem('2026-11-24T12:10:00+08:00', previous), true)
  assert.equal(isFreshItem('2026-11-24T04:10:00Z', previous), true)
  assert.equal(isFreshItem('2026-11-23T23:10:00Z', previous), false)
  assert.equal(isFreshItem(previous, previous), false)
  assert.equal(isFreshItem('2026-11-24T12:10:00+08:00', ''), false)
  assert.equal(isFreshItem('', previous), false)
  assert.equal(isFreshItem(undefined, undefined), false)
})
