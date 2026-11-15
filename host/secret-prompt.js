import { emitKeypressEvents } from 'node:readline'

export async function secret(question, accepted = /^[\x20-\x7e]+$/) {
  if (!process.stdin.isTTY) throw new Error('Use an interactive terminal for password entry.')
  process.stdout.write(question)
  emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  return new Promise((resolve, reject) => {
    let value = ''
    const finish = (error) => {
      process.stdin.removeListener('keypress', key)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdout.write('\n')
      if (error) reject(error)
      else resolve(value)
    }
    const key = (str, k) => {
      if (k?.ctrl && k.name === 'c') return finish(new Error('Cancelled'))
      if (k?.name === 'return') return finish()
      if (k?.name === 'backspace') value = value.slice(0, -1)
      else if (str && accepted.test(str) && value.length + str.length <= 128) value += str
    }
    process.stdin.on('keypress', key)
  })
}
