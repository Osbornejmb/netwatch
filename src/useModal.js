import { useLayoutEffect, useRef } from 'react'

export default function useModal(onClose) {
  const dialog = useRef(null)
  useLayoutEffect(() => {
    const trigger = document.activeElement
    const element = dialog.current
    element.showModal()
    const initialFocus = element.querySelector('[data-initial-focus]') || element.querySelector('button, input, select')
    initialFocus?.focus()
    return () => { element.close(); trigger?.focus() }
  }, [])
  return {
    ref: dialog,
    onCancel: event => { event.preventDefault(); onClose() },
    onKeyDown: event => {
      if (event.key !== 'Tab') return
      const controls = [...dialog.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, textarea:not([disabled]), a[href]')].filter(element => element.checkVisibility())
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    },
    onClick: event => {
      if (event.target !== dialog.current) return
      const box = dialog.current.getBoundingClientRect()
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose()
    },
  }
}
