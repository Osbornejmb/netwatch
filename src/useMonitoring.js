import { useEffect, useState } from 'react'
import { pollSnapshot } from './monitoring'

export default function useMonitoring(enabled) {
  const [value, setValue] = useState({ snapshot: null, state: 'loading', error: '' })
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    if (!enabled) return
    return pollSnapshot(next => setValue(previous => {
      if (next.snapshot && previous.snapshot?.inventory.revision === next.snapshot.inventory.revision) {
        next.snapshot.inventory = previous.snapshot.inventory
      }
      return { ...previous, ...next }
    }))
  }, [enabled, generation])
  return { ...value, refresh: () => setGeneration(value => value + 1) }
}
