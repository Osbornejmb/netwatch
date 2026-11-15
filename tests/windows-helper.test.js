import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import test from 'node:test'
import { prepareWindowsHelper } from '../host/windows-helper.js'

test('helper preparation rebuilds missing or modified cached executables and verifies checksums', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'nw-helper-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const files = new Map()
  const fixtureSource = Buffer.from('fixture source')
  const checksum = (bytes) => createHash('sha256').update(bytes).digest('hex')
  const fs = {
    existsSync: (file) => files.has(file),
    mkdirSync() {},
    readFileSync(file, encoding) {
      const bytes = extname(file) === '.cs' ? fixtureSource : files.get(file)
      assert.ok(bytes)
      return encoding ? bytes.toString(encoding) : bytes
    },
    rmSync: (file) => files.delete(file),
    writeFileSync: (file, contents) => files.set(file, Buffer.from(contents)),
    renameSync(src, dst) {
      assert.ok(files.has(src))
      files.set(dst, files.get(src))
      files.delete(src)
    },
  }
  let builds = 0
  const prepare = () => prepareWindowsHelper({
    directory,
    fs,
    execute(_compiler, args, options, done) {
      assert.equal(options.shell, false)
      const out = args.find((arg) => arg.startsWith('/out:')).slice(5)
      files.set(out, Buffer.from('built binary ' + ++builds))
      queueMicrotask(() => done(null))
    },
  })
  const file = await prepare()
  const sidecar = file + '.sha256'
  assert.equal(basename(file), 'ping-' + checksum(fixtureSource).slice(0, 24) + '.exe')
  assert.equal(files.get(sidecar).toString().trim(), checksum(files.get(file)))
  assert.equal(await prepare(), file)
  assert.equal(builds, 1)
  files.delete(sidecar)
  assert.equal(await prepare(), file)
  assert.equal(builds, 2)
  files.set(file, Buffer.from('unexpected bytes'))
  assert.equal(await prepare(), file)
  assert.equal(builds, 3)
  assert.equal(files.get(sidecar).toString().trim(), checksum(files.get(file)))
  assert.equal(files.size, 2)
})
