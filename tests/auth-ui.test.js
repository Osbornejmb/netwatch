import assert from 'node:assert/strict'
import test from 'node:test'
import { allowedHash } from '../src/auth.js'

test('viewer navigation always resolves to Dashboard', () => {
  for (const hash of ['', '#dashboard', '#inventory', '#topology', '#discovered', '#unknown']) {
    assert.equal(allowedHash(hash, 'viewer'), '#dashboard')
    assert.equal(allowedHash(hash, 'admin'), hash)
  }
})
