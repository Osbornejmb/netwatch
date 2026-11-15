export function readPort(value = process.env.NETWATCH_PORT) {
  if (value === undefined) return 4317
  const port = Number(value)
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('NETWATCH_PORT must be an integer from 1024 through 65535.')
  return port
}

export function loopbackUrl(port = readPort()) {
  return `http://127.0.0.1:${port}`
}
