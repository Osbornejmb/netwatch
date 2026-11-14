import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, useState } from 'react'
import { Info } from 'lucide-react'

export default function InfoTooltip({ label, children }) {
  const id = useId()
  const button = useRef(null)
  const tooltip = useRef(null)
  const hover = useRef(false)
  const focused = useRef(false)
  const closeTimer = useRef()
  const [open, setOpen] = useState(false)

  const show = () => {
    clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const hide = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      if (!hover.current && !focused.current) setOpen(false)
    }, 100)
  }
  useEffect(() => () => clearTimeout(closeTimer.current), [])
  useEffect(() => {
    if (!open) return
    const position = () => {
      const anchor = button.current.getBoundingClientRect(), popup = tooltip.current
      const gap = 8, width = popup.offsetWidth, height = popup.offsetHeight
      popup.style.left = `${Math.max(gap, Math.min(innerWidth - width - gap, anchor.left + (anchor.width - width) / 2))}px`
      popup.style.top = `${Math.max(gap, Math.min(innerHeight - height - gap, anchor.bottom + gap + height <= innerHeight ? anchor.bottom + gap : anchor.top - height - gap))}px`
    }
    position()
    const dismiss = event => {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !button.current.contains(event.target))) setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('mapviewportchange', close)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', close, true)
    document.addEventListener('keydown', dismiss, true)
    document.addEventListener('pointerdown', dismiss, true)
    return () => {
      document.removeEventListener('mapviewportchange', close)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', close, true)
      document.removeEventListener('keydown', dismiss, true)
      document.removeEventListener('pointerdown', dismiss, true)
    }
  }, [open])

  return <><button ref={button} type="button" className="info-trigger nodrag nopan" aria-label={label}
    aria-describedby={open ? id : undefined}
    onPointerEnter={event => { if (event.pointerType !== 'touch') { hover.current = true; show() } }}
    onPointerLeave={() => { hover.current = false; hide() }}
    onFocus={() => { focused.current = true; show() }}
    onBlur={() => { focused.current = false; hide() }}
    onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}
    onClick={event => { event.stopPropagation(); show() }}><Info size={15} aria-hidden="true"/></button>
    {open && createPortal(<div id={id} ref={tooltip} role="tooltip" className="info-tooltip"
      onPointerEnter={() => { hover.current = true; show() }}
      onPointerLeave={() => { hover.current = false; hide() }}>{children}</div>, document.fullscreenElement || document.body)}</>
}
