import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { admitRequest, createLanListeners, requestSource } from '../host/lan.js'

test('socket addresses determine source, including mapped IPv4', () => {
  for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(requestSource(ip), 'local')
  for (const ip of ['10.0.0.2', '172.31.0.2', '192.168.0.2', '::ffff:c0a8:2', 'fc00::1', 'febf::1%7'])
    assert.equal(requestSource(ip), 'remote')
  for (const ip of ['8.8.8.8', '172.32.0.1', '::ffff:8.8.8.8', '169.254.0.2', '2001:db8::1', '::', undefined])
    assert.equal(requestSource(ip), undefined)
})

test('LAN admission rejects public socket addresses, foreign authorities, and cross-site requests', () => {
  const origin = 'http://127.0.0.1:4317'
  const host = '192.168.1.10:4317'
  const authorities = new Set(['127.0.0.1:4317', host, 'netwatch:4317'])
  const admit = (ip, headers) => admitRequest({ headers: { host, ...headers } }, origin, authorities, ip)
  assert.equal(admit('192.168.1.11', { origin: 'http://' + host, 'x-forwarded-for': '127.0.0.1' }), 'remote')
  for (const [ip, headers] of [
    ['8.8.8.8', { 'x-forwarded-for': '192.168.1.11' }],
    ['192.168.1.11', { host: 'attacker.test:4317' }],
    ['192.168.1.11', { host: host + '@attacker.test' }],
    ['192.168.1.11', { origin: 'http://attacker.test:4317' }],
    ['192.168.1.11', { 'sec-fetch-site': 'cross-site' }],
  ]) assert.throws(() => admit(ip, headers), { status: 403 })
})

test('LAN listeners bind only private external IPv4 interfaces and remove stale listeners', async () => {
  let entries = [
    { address: '127.0.0.1', internal: true },
    { address: '192.168.1.2', internal: false },
    { address: '192.168.1.3', internal: true },
    { address: '8.8.8.8', internal: false },
    { address: 'fc00::1', internal: false },
  ]
  const bound = []
  const added = new EventEmitter()
  const createServer = () => Object.assign(new EventEmitter(), {
    listen(port, address, callback) {
      bound.push(address)
      this.listening = true
      callback()
      added.emit('address', address)
    },
    close(callback) { this.listening = false; callback() },
    closeAllConnections() {},
  })
  const lan = createLanListeners({ port: 4317, names: 'NetWatch,8.8.8.8', interfaces: () => ({ eth: entries }), interval: 10, log() {}, createServer })
  try {
    lan.start()
    assert.deepEqual(lan.urls(), ['http://192.168.1.2:4317', 'http://netwatch:4317'])
    entries = [{ address: '10.0.0.2', internal: false }]
    await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(), 250)
      added.once('address', () => { clearTimeout(timer); resolve() })
    })
    assert.deepEqual(bound, ['192.168.1.2', '10.0.0.2'])
    assert.deepEqual(lan.urls(), ['http://10.0.0.2:4317', 'http://netwatch:4317'])
  } finally {
    await lan.stop()
  }
  assert.deepEqual(lan.urls(), [])
})
