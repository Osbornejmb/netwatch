import { useState } from 'react'
import { uniqueConnections } from './connections'
import { createId } from './id'
import { validateTopology, validateUplink } from './topology'

export default function UplinkControls({ nodes, edges, groups, onGroups, onUplink }) {
  const [linkId, setLinkId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const devices = new Map(nodes.map((node) => [node.id, node]))
  const links = uniqueConnections(edges)
  const routerLinks = links.filter((edge) =>
    [edge.source, edge.target].some((id) => devices.get(id)?.type === 'router'),
  )
  const link = links.find((edge) => edge.id === linkId)
  const group = groups.find((item) => item.id === groupId)
  const name = (edge) => `${devices.get(edge.source)?.data.label} ↔ ${devices.get(edge.target)?.data.label}`
  const submit = (event, save) => {
    event.preventDefault()
    try {
      setNotice(save(new FormData(event.currentTarget)))
      setError('')
    } catch (error) {
      setNotice('')
      setError(error.message)
    }
  }
  return (
    <section className="inventory-controls" aria-label="Uplinks and redundancy">
      <label htmlFor="uplink-link">Connection</label>
      <select id="uplink-link" value={linkId} onChange={(event) => setLinkId(event.target.value)}>
        <option value="">Choose a connection</option>
        {links.map((edge) => (
          <option key={edge.id} value={edge.id}>
            {name(edge)}
          </option>
        ))}
      </select>
      {link && (
        <form
          className="neighbor-review-form"
          key={JSON.stringify([link.id, link.uplink])}
          onSubmit={(event) =>
            submit(event, (data) => {
              const port = (side) => ({
                label: data.get(`${side}Label`),
                index: data.get(`${side}Index`) === '' ? null : Number(data.get(`${side}Index`)),
              })
              onUplink(
                link.id,
                validateUplink({ label: data.get('label'), source: port('source'), target: port('target') }),
              )
              return 'Uplink saved to draft.'
            })
          }
        >
          <p>Find the interface index under Ports in the saved device’s details.</p>
          <label>
            Uplink label <input name="label" maxLength={80} defaultValue={link.uplink?.label} />
          </label>
          {['source', 'target'].map((side) => (
            <fieldset key={side}>
              <legend>{devices.get(link[side])?.data.label}</legend>
              <label>
                Port label <input name={`${side}Label`} maxLength={80} defaultValue={link.uplink?.[side].label} />
              </label>
              <label>
                Interface index{' '}
                <input
                  name={`${side}Index`}
                  type="number"
                  min="1"
                  max="2147483647"
                  defaultValue={link.uplink?.[side].index ?? ''}
                />
              </label>
            </fieldset>
          ))}
          <button className="button secondary" type="submit">
            Save uplink
          </button>
        </form>
      )}
      <h2>Redundancy groups</h2>
      <label htmlFor="uplink-group">Group</label>
      <select id="uplink-group" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
        <option value="">New group</option>
        {groups.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <form
        className="neighbor-review-form"
        key={JSON.stringify([groupId, group])}
        onSubmit={(event) =>
          submit(event, (data) => {
            const id = group?.id ?? createId()
            const next = { id, name: data.get('name'), links: data.getAll('links') }
            const proposed = group ? groups.map((item) => (item.id === id ? next : item)) : [...groups, next]
            onGroups(validateTopology({ nodes, edges, groups: proposed }).groups)
            setGroupId(id)
            return 'Group saved to draft.'
          })
        }
      >
        <label>
          Group name <input name="name" maxLength={80} required defaultValue={group?.name} />
        </label>
        <label>
          Router links{' '}
          <select name="links" multiple size={5} required defaultValue={group?.links ?? []}>
            {routerLinks.map((edge) => (
              <option key={edge.id} value={edge.id}>
                {edge.uplink?.label || name(edge)}
              </option>
            ))}
          </select>
        </label>
        <p>Select at least two links involving different routers.</p>
        <button className="button secondary" type="submit" disabled={routerLinks.length < 2}>
          Save group
        </button>
        {group && (
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              onGroups(groups.filter((item) => item.id !== groupId))
              setGroupId('')
              setError('')
              setNotice('Group removed from draft.')
            }}
          >
            Remove group
          </button>
        )}
      </form>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  )
}
