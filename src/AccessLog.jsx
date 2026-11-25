import { useEffect, useState } from 'react'
import { hostFetch } from './auth'
import useModal from './useModal'

const actions = {
  login_success: 'Signed in',
  login_failure: 'Sign-in failed',
  logout: 'Signed out',
  session_upgrade: 'Switched to admin',
  topology_applied: 'Applied map',
  discovery_scan: 'Requested a device scan',
  discovery_clear: 'Cleared discovered devices',
  discovery_add: 'Added discovered device',
  discovery_remove: 'Removed discovered device',
  viewer_write_blocked: 'Blocked viewer change',
  operator_write_blocked: 'Blocked operator change',
  write_token_rejected: 'Blocked an unverified change',
  rate_limit_lockout: 'Sign-in temporarily blocked',
  access_settings_changed: 'Changed access settings',
}

export default function AccessLog({ onClose }) {
  const modal = useModal(onClose)
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void hostFetch('/api/v1/audit?limit=50', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error()
        return response.json()
      })
      .then((value) => setEntries(value.entries))
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [])
  return (
    <dialog {...modal} className="modal device-dialog access-log-dialog" aria-labelledby="access-log-title">
      <h2 id="access-log-title">Access log</h2>
      {error ? (
        <p role="alert">Unable to load the access log.</p>
      ) : entries === null ? (
        <p role="status">Loading…</p>
      ) : entries.length === 0 ? (
        <p>No access events recorded yet.</p>
      ) : (
        <ol className="access-log">
          {entries.map((entry) => (
            <li key={entry.id}>
              <strong>{actions[entry.action] || 'Access event'}</strong>
              <span>
                {new Date(entry.at).toLocaleString()} · {entry.source === 'local' ? 'NetWatch PC' : entry.ip}
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="modal-actions">
        <a className="button secondary" href="/api/v1/audit/export" download="netwatch-access-log.json">
          Download redacted log
        </a>
        <button className="button secondary" data-initial-focus onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  )
}
