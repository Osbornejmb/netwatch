import { useCallback, useEffect, useState } from 'react'
import { constrainDrag } from './nodes/placement'

const EMPTY = {}
export default function useLayoutDrag(nodes, context) {
  const [drag, setDrag] = useState(null)
  const positions = drag?.nodes === nodes && drag.context === context ? drag.positions : EMPTY
  const reset = useCallback(() => setDrag(null), [])
  const onPositionChanges = changes => {
    const moved = changes.filter(change => change.type === 'position' && change.position)
    if (!moved.length) return
    setDrag(previous => {
      const positions = previous?.nodes === nodes && previous.context === context ? { ...previous.positions } : {}
      for (const change of moved) {
        const position = constrainDrag(change.id, change.position, nodes, positions)
        if (position) positions[change.id] = position
      }
      return { nodes, context, positions }
    })
  }
  useEffect(reset, [nodes, context, reset])
  useEffect(() => {
    const hide = () => { if (document.hidden) reset() }
    window.addEventListener('blur', reset)
    document.addEventListener('visibilitychange', hide)
    return () => { window.removeEventListener('blur', reset); document.removeEventListener('visibilitychange', hide) }
  }, [reset])
  return { positions, onPositionChanges, reset }
}
