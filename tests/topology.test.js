import test from 'node:test'
import assert from 'node:assert/strict'
import { validateTopology, readTopology, writeTopology, STORAGE_KEY } from '../src/topology.js'

const topology = () => ({ nodes: ['a', 'b'].map(id => ({ id, type: 'router', position: { x: 0, y: 1 }, data: { label: id } })), edges: [{ id: 'ab', source: 'a', target: 'b' }] })

test('round trips topology and removes untrusted display properties', () => {
  let raw
  const storage = { setItem(key, value) { assert.equal(key, STORAGE_KEY); raw = value }, getItem() { return raw } }
  const input = topology()
  input.nodes[0].hidden = true
  writeTopology(storage, input)
  assert.deepEqual(readTopology(storage, {}).topology, validateTopology(input))
  assert.equal(readTopology(storage, {}).topology.nodes[0].hidden, undefined)
})

test('rejects malformed devices and links', () => {
  for (const change of [t => t.nodes.push(t.nodes[0]), t => t.nodes[0].position.x = Infinity,
    t => t.nodes[0].data.label = '', t => t.edges[0].target = 'missing',
    t => t.edges[0].target = 'a', t => t.edges.push(t.edges[0]), t => t.edges[0].label = {}]) {
    const input = topology(); change(input)
    assert.throws(() => validateTopology(input))
  }
  assert.throws(() => validateTopology({ nodes: {}, edges: [] }))
})

test('missing storage loads defaults; corrupt and inaccessible storage preserve data', () => {
  const fallback = topology()
  assert.deepEqual(readTopology({ getItem: () => null }, fallback), { topology: fallback, error: '', recovery: null })
  for (const getItem of [() => '{', () => '{"nodes":{},"edges":[]}', () => { throw Error('denied') }]) {
    const result = readTopology({ getItem }, fallback)
    assert.equal(result.topology, fallback)
    assert.match(result.error, /paused/)
  }
  assert.throws(() => writeTopology({ setItem() { throw Error('quota') } }, topology()), /quota/)
})

test('accepts legacy exports and rejects future schemas and size limits', () => {
  assert.equal(validateTopology(topology()).schemaVersion, 1)
  assert.throws(() => validateTopology({ ...topology(), schemaVersion: 2 }), /schema/)
  assert.throws(() => validateTopology({ nodes: Array(2001).fill(null), edges: [] }), /2,000/)
})


test('recovery retains exact unreadable saved text and distinguishes denied access', () => {
  const fallback = topology()
  for (const raw of ['', ' {broken\ntext', JSON.stringify({ schemaVersion: 99, nodes: [], edges: [] })]) {
    const storage = { getItem: () => raw, setItem: () => assert.fail('must not overwrite') }
    const result = readTopology(storage, fallback)
    assert.equal(result.recovery.raw, raw)
    assert.equal(result.topology, fallback)
    assert.match(result.error, /fallback/)
  }
  const result = readTopology({ getItem() { throw Error('denied') } }, fallback)
  assert.equal(result.recovery.raw, null)
  assert.match(result.error, /storage.*read/)
  assert.equal(readTopology({ getItem: () => null }, fallback).recovery, null)
})
