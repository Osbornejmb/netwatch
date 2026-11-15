import { useEffect, useRef, useState } from 'react'
import { pollSnapshot } from './monitoring'

export default function useMonitoring(enabled) {
  const [value, setValue] = useState({ snapshot: null, state: 'loading', error: '', hasConnected: false })
  const [generation, setGeneration] = useState(0)
  const cache = useRef({})
  useEffect(() => {
    if (!enabled) return
    return pollSnapshot(
      (next) =>
        setValue((previous) => {
          return { ...previous, ...next, hasConnected: previous.hasConnected || Boolean(next.snapshot) }
        }),
      { cache: cache.current },
    )
  }, [enabled, generation])
  return { ...value, refresh: () => setGeneration((value) => value + 1) }
}
