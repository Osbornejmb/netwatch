import { useCallback, useEffect, useMemo } from 'react'
import { constrainDrag, withinLinkReach } from './nodes/placement'
import { connectionKey } from './connections'

const EMPTY = {}
// shortcut: view adjustments reset on reload; add a saved custom-layout mode when reload persistence is requested.
export default function useLayoutDrag(nodes, edges, context, layouts, setLayouts) {
  const signature = useMemo(() => JSON.stringify([nodes.map(node => [node.id, node.position.x, node.position.y]), edges.map(connectionKey).sort()]), [nodes, edges])
  const saved = layouts[context]
  const positions = saved?.signature === signature ? saved.positions : EMPTY
  const onPositionChanges = changes => {
    const moved = changes.filter(change => change.type === 'position' && change.position)
    if (!moved.length) return
    setLayouts(previous => {
      const current = previous[context]?.signature === signature ? previous[context] : null
      const positions = { ...current?.positions }
      for (const change of moved) {
        const position = constrainDrag(change.id, change.position, nodes, positions)
        if (position) positions[change.id] = position
      }
      return { ...previous, [context]: { signature, positions, committed: current?.committed || EMPTY } }
    })
  }
  const moveByKey = (event, node) => {
    const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key]
    if (!delta) return false
    event.preventDefault(); event.stopPropagation()
    onPositionChanges([{ type: 'position', id: node.id, position: { x: node.position.x + delta[0], y: node.position.y + delta[1] } }])
    return true
  }
  const finish = useCallback(() => setLayouts(previous => {
    const current = previous[context]
    if (current?.signature !== signature || current.positions === current.committed) return previous
    const positions = withinLinkReach(nodes, edges, current.positions) ? current.positions : current.committed
    return { ...previous, [context]: { ...current, positions, committed: positions } }
  }), [nodes, edges, context, signature, setLayouts])
  useEffect(() => {
    const hide = () => { if (document.hidden) finish() }
    window.addEventListener('blur', finish)
    document.addEventListener('visibilitychange', hide)
    return () => { window.removeEventListener('blur', finish); document.removeEventListener('visibilitychange', hide) }
  }, [finish])
  return { positions, onPositionChanges, moveByKey, finish }
}
