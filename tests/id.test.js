import test from 'node:test'
import assert from 'node:assert/strict'
import { createId } from '../src/id.js'

test('uses native UUIDs when available and secure random values on HTTP LAN', () => {
  assert.equal(createId({ randomUUID: () => 'native-id' }), 'native-id')
  let calls = 0
  const lanCrypto = { getRandomValues(values) { calls++; return values.fill(calls) } }
  const first = createId(lanCrypto)
  assert.match(first, /^[a-f0-9]{32}$/)
  assert.notEqual(createId(lanCrypto), first)
})

test('fallback IDs stay distinct even without browser crypto and with frozen randomness/time', () => {
  const originalNow = Date.now
  const originalRandom = Math.random
  try {
    Date.now = () => 1000
    Math.random = () => 0.5
    const ids = Array.from({ length: 1000 }, () => createId(null))
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(ids.every(id => typeof id === 'string' && id.length > 0))
  } finally {
    Date.now = originalNow
    Math.random = originalRandom
  }
})
