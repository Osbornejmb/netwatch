import test from 'node:test'
import assert from 'node:assert/strict'
import { connectionKey, uniqueConnections } from '../src/connections.js'

test('reciprocal and parallel connections collapse to one stable undirected edge without mutating input', () => {
  const edges = [
    { id: 'z', source: 'router', target: 'pc', sourceHandle: 'left' },
    { id: 'a', source: 'pc', target: 'router', targetHandle: 'right' },
    { id: 'm', source: 'router', target: 'pc' },
    { id: 'b', source: 'router', target: 'other' },
  ]
  const before = structuredClone(edges)
  assert.deepEqual(uniqueConnections(edges).map(e => e.id), ['a', 'b'])
  assert.deepEqual(uniqueConnections([...edges].reverse()), uniqueConnections(edges))
  assert.equal(connectionKey(edges[0]), connectionKey(edges[1]))
  assert.deepEqual(edges, before)
  assert.equal(uniqueConnections(edges)[0], edges[1])
  assert.deepEqual(uniqueConnections([]), [])
})

test('endpoint punctuation and reversed orientation cannot merge unrelated pairs', () => {
  const edges = [{ id: 'a', source: 'a-b', target: 'c' }, { id: 'b', source: 'a', target: 'b-c' }, { id: 'c', source: 'c', target: 'a-b' }]
  assert.equal(uniqueConnections(edges).length, 2)
  assert.notEqual(connectionKey(edges[0]), connectionKey(edges[1]))
})
