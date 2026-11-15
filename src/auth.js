const local = { source: 'local', authenticated: true, role: 'admin' }
export const sessionEvent = 'netwatch-session-change'
let session

export function setSession(value) {
  session = value
  globalThis.dispatchEvent?.(new Event(sessionEvent))
}

export const getSession = () => session
export const csrf = () => (session?.source === 'remote' ? session.csrfToken : undefined)
export const allowedHash = (hash, role) => {
  if (role === 'viewer') return '#dashboard'
  if (role === 'operator' && !['#dashboard', '#inventory', '#devices', '#discovered'].includes(hash))
    return '#dashboard'
  return hash
}

export async function hostFetch(path, options) {
  const active = session
  const response = await fetch(path, { credentials: 'same-origin', ...options })
  if (session === active && active?.source === 'remote' && active.authenticated && response.status === 401)
    setSession({
      ...active,
      authenticated: false,
      role: null,
      csrfToken: undefined,
      message: 'Your session expired. Sign in again.',
    })
  if (active?.role === 'viewer' && response.status === 403) throw new Error('This session is view-only.')
  return response
}

export async function authRequest(action, { signal, body } = {}) {
  const response = await fetch('/api/v1/auth/' + action, {
    credentials: 'same-origin',
    cache: 'no-store',
    method: action === 'session' ? 'GET' : 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  })
  if (response.status === 429)
    throw new Error('Try again in ' + (response.headers.get('Retry-After') ?? '1') + ' seconds.')
  if (!response.ok) throw new Error(response.status === 401 ? 'Invalid credentials' : 'NetWatch access is unavailable.')
  return response.json()
}

export async function loadSession(signal) {
  try {
    const status = await authRequest('session', { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) })
    if (status?.source !== 'local' && status?.source !== 'remote') throw new Error('Invalid access response.')
    return status
  } catch (error) {
    if (signal.aborted) throw error
    if (import.meta.env?.DEV || ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) return local
    throw error
  }
}
