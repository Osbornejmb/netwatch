import { useState } from 'react'
import { uniqueConnections, physicalConnectionKey } from './connections'
import { createId } from './id'
import { validateTopology, validateUplink } from './topology'

export default function UplinkControls({ nodes, edges, groups, roots, onRoots, onGroups, onUplink }) {
  const [linkId, setLinkId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const devices = new Map(nodes.map((node) => [node.id, node]))
  const links = uniqueConnections(edges)
  const link = links.find((edge) => edge.id === linkId)
  const group = groups.find((item) => item.id === groupId)
  const name = (edge) =>
    ['source', 'target']
      .map((side) => {
        const port = edge.uplink?.[side]
        return [devices.get(edge[side])?.data.label, port?.label || port?.index].filter(Boolean).join(' · ')
      })
      .join(' ↔ ')
  const submit = (event, save) => {
    event.preventDefault()
    try {
      setNotice(save(new FormData(event.currentTarget, event.nativeEvent.submitter)))
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
              const uplink = validateUplink({
                label: data.get('label'),
                source: port('source'),
                target: port('target'),
              })
              const parallel = data.get('action') === 'parallel'
              const connection = { ...link, id: parallel ? createId() : link.id, uplink, role: data.get('role') }
              delete connection.discoveryMapped
              if (parallel && (!uplink?.source.index || !uplink?.target.index))
                throw new Error('Enter both interface indexes for a parallel link.')
              if (
                uplink?.source.index &&
                uplink?.target.index &&
                edges.some(
                  (edge) =>
                    edge.id !== connection.id && physicalConnectionKey(edge) === physicalConnectionKey(connection),
                )
              )
                throw new Error('This pair of ports is already connected.')
              onUplink(connection, parallel)
              setLinkId(connection.id)
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
          <label>
            Link role
            <select name="role" defaultValue={link.role ?? 'unknown'}>
              <option value="unknown">Unknown</option>
              <option value="uplink">Uplink</option>
              <option value="downlink">Downlink</option>
              <option value="peer">Peer link</option>
            </select>
          </label>
          <button className="button secondary" type="submit" name="action" value="save">
            Save uplink
          </button>
          <button className="button secondary" type="submit" name="action" value="parallel">
            Add parallel link
          </button>
        </form>
      )}
      <h2>Redundancy groups</h2>
      <form
        onSubmit={(event) =>
          submit(event, (data) => {
            onRoots(data.getAll('roots'))
            return 'Root routers saved to draft.'
          })
        }
      >
        <label>
          Root routers
          <select name="roots" multiple defaultValue={roots} key={JSON.stringify(roots)}>
            {nodes
              .filter((node) => node.type === 'router')
              .map((node) => (
                <option key={node.id} value={node.id}>
                  {node.data.label}
                </option>
              ))}
          </select>
        </label>
        <button className="button secondary" type="submit">
          Save roots
        </button>
      </form>
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
            const protectedDevice = data.get('protectedDevice')
            const next = {
              id,
              name: data.get('name'),
              links: data.getAll('links'),
              ...(protectedDevice && { protectedDevice }),
            }
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
          Protected device
          <select name="protectedDevice" defaultValue={group?.protectedDevice ?? ''}>
            <option value="">Use router group</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.data.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Connections{' '}
          <select name="links" multiple size={5} required defaultValue={group?.links ?? []}>
            {links.map((edge) => (
              <option key={edge.id} value={edge.id}>
                {edge.uplink?.label || name(edge)}
              </option>
            ))}
          </select>
        </label>
        <p>
          Select at least two connections. Choosing a protected device saves the selected mapped connections as its
          baseline.
        </p>
        <button className="button secondary" type="submit" disabled={links.length < 2}>
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
