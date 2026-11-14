import { useEffect, useRef, useState } from 'react'
import { ControlButton, Controls } from '@xyflow/react'
import { Maximize, Minimize } from 'lucide-react'

export default function MapControls({ showInteractive }) {
  const button = useRef(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [error, setError] = useState('')
  const map = () => button.current?.closest('.health-map, .canvas-wrap')
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement && document.fullscreenElement === map()))
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const toggle = async () => {
    setError('')
    try {
      if (document.fullscreenElement === map()) await document.exitFullscreen()
      else await map().requestFullscreen()
    } catch {
      setError('Fullscreen is unavailable.')
    }
  }
  const label = fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
  const Icon = fullscreen ? Minimize : Maximize
  return <Controls showInteractive={showInteractive} className="map-controls">
    {document.fullscreenEnabled && <ControlButton onClick={toggle} aria-label={label} title={label}>
      <Icon ref={button} aria-hidden="true"/>
    </ControlButton>}
    {error && <span className="map-fullscreen-error" role="status">{error}</span>}
  </Controls>
}
