import { useCallback, useEffect, useMemo, useState } from 'react'
import { pushNodes, withinLinkReach } from './nodes/placement'
import { connectionKey } from './connections'

const EMPTY = Object.create(null)
export default function useLayoutDrag(nodes, edges, context, sizes) {
  const [move, setMove] = useState(null)
  const signature = useMemo(() => JSON.stringify([nodes.map(node => [node.id, node.position.x, node.position.y]), edges.map(connectionKey).sort()]), [nodes, edges])
  const saved = move?.context === context ? move : null
  const positions = saved?.signature === signature ? saved.positions : EMPTY
  const onPositionChanges = changes => {
    const moved = changes.filter(change => change.type === 'position' && change.position)
    if (!moved.length) return
    setMove(previous => {
      const current = previous?.context === context && previous.signature === signature ? previous : null
      let positions = current?.positions || EMPTY
      for (const change of moved) positions = pushNodes(change.id, change.position, nodes, positions, sizes)
      return { context, signature, positions, committed: current?.committed || EMPTY }
    })
  }
  const moveByKey = (event, node) => {
    const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key]
    if (!delta) return false
    event.preventDefault(); event.stopPropagation()
    onPositionChanges([{ type: 'position', id: node.id, position: { x: node.position.x + delta[0], y: node.position.y + delta[1] } }])
    return true
  }
  const finish = useCallback(() => setMove(current => {
    if (current?.context !== context || current.signature !== signature || current.positions === current.committed) return current
    const positions = withinLinkReach(nodes, edges, current.positions) ? current.positions : current.committed
    return { ...current, positions, committed: positions }
  }), [nodes, edges, context, signature])
  useEffect(() => { setMove(null) }, [context, signature])
  useEffect(() => {
    const hide = () => { if (document.hidden) setMove(null) }
    window.addEventListener('blur', finish)
    document.addEventListener('visibilitychange', hide)
    return () => { window.removeEventListener('blur', finish); document.removeEventListener('visibilitychange', hide) }
  }, [finish])
  return { positions, onPositionChanges, moveByKey, finish }
}
