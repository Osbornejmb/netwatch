import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const fixtureIndex = '<!doctype html><html><head></head><body></body></html>'

export function writeTokenFixture(directory) {
  writeFileSync(join(directory, 'index.html'), fixtureIndex)
  return directory
}

export async function fetchWriteToken(base) {
  const response = await fetch(new URL('/', base))
  assert.equal(response.status, 200)
  const token = (await response.text()).match(/<meta name="netwatch-write-token" content="([0-9a-f]{64})">/)?.[1]
  assert.ok(token, 'host index must include a 32-byte token')
  return token
}
