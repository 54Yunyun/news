import assert from 'node:assert/strict'
import test from 'node:test'
import { redact } from './env.mjs'

test('錯誤訊息不會留下金鑰', () => {
  const message = redact('失敗 Bearer sk-abc CWA-1234-ABCD 以及 sk-abc', ['sk-abc'])
  assert.equal(message.includes('sk-abc'), false)
  assert.equal(message.includes('CWA-1234-ABCD'), false)
  assert.match(message, /\[redacted\]/)
})
