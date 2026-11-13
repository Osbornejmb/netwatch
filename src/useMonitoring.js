import { useEffect, useState } from 'react'
import { pollSnapshot } from './monitoring'

export default function useMonitoring(enabled) {
  const [value, setValue] = useState({ snapshot: null, state: 'loading', error: '', hasConnected: false })
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    if (!enabled) return
    return pollSnapshot(next => setValue(previous => {
      if (next.snapshot && previous.snapshot?.inventory.revision === next.snapshot.inventory.revision) {
        next.snapshot.inventory = previous.snapshot.inventory
      }
      return { ...previous, ...next, hasConnected: previous.hasConnected || Boolean(next.snapshot) }
    }))
  }, [enabled, generation])
  return { ...value, refresh: () => setGeneration(value => value + 1) }
}
