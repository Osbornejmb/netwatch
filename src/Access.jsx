import { useEffect, useState } from 'react'
import App from './App'
import { authRequest, getSession, loadSession, sessionEvent, setSession } from './auth'

export default function Access() {
  const [session, update] = useState(getSession)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const change = () => {
      update(getSession())
      setForm(null)
    }
    window.addEventListener(sessionEvent, change)
    void loadSession(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setSession(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true)
      })
    return () => {
      controller.abort()
      window.removeEventListener(sessionEvent, change)
    }
  }, [])

  async function signIn(event, role) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const password = new FormData(event.currentTarget).get('password')
    try {
      const result = await authRequest('login', { body: { role, ...(password === null ? {} : { password }) } })
      setSession({ ...session, ...result, authenticated: true, message: '' })
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function signOut(viewOnly = false) {
    setBusy(true)
    setError('')
    try {
      await authRequest('logout')
      setSession({ ...session, authenticated: false, role: null, csrfToken: undefined, message: '' })
      if (viewOnly && session.viewerMode === 'open') setSession(await authRequest('session'))
      else if (viewOnly && session.viewerMode === 'password') setForm('viewer')
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (!session)
    return (
      <main className="access-screen">
        <p role="status">{loadError ? 'NetWatch access is unavailable.' : 'Connecting to NetWatch…'}</p>
      </main>
    )
  if (session.authenticated && !form) {
    const remote = session.source === 'remote'
    const viewer = session.role === 'viewer'
    return (
      <App
        key={session.role}
        viewer={viewer}
        remote={remote}
        accessControls={
          remote && (
            <div className="access-controls">
              <span>{viewer ? 'Viewing remotely' : 'Admin (remote)'}</span>
              {viewer && (
                <button
                  className="health-button"
                  onClick={() => {
                    setError('')
                    setForm('admin')
                  }}
                >
                  Admin sign in
                </button>
              )}
              {!viewer && session.viewerMode !== 'disabled' && (
                <button className="health-button" disabled={busy} onClick={() => void signOut(true)}>
                  Switch to view only
                </button>
              )}
              <button className="health-button" disabled={busy} onClick={() => void signOut()}>
                Sign out
              </button>
              {error && <span role="alert">{error}</span>}
            </div>
          )
        }
      />
    )
  }

  const role = form || (session.viewerMode === 'disabled' ? 'admin' : 'viewer')
  const needsPassword = role !== 'viewer' || session.viewerMode !== 'open'
  return (
    <main className="access-screen">
      <form className="access-form" onSubmit={(event) => void signIn(event, role)} key={role}>
        <h1>NetWatch</h1>
        {session.message && <p role="status">{session.message}</p>}
        {needsPassword && (
          <label>
            {role === 'admin' ? 'Admin password' : 'Viewer password'}
            <input name="password" type="password" autoComplete="current-password" required maxLength={128} />
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        <button className="button primary" disabled={busy}>
          {busy ? 'Signing in…' : role === 'viewer' ? 'View dashboard' : 'Sign in'}
        </button>
        {session.authenticated || session.viewerMode !== 'disabled' ? (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setError('')
              setForm(role === 'viewer' ? 'admin' : session.authenticated ? null : 'viewer')
            }}
          >
            {role === 'viewer' ? 'Admin sign in' : session.authenticated ? 'Back to dashboard' : 'View dashboard'}
          </button>
        ) : null}
      </form>
    </main>
  )
}
