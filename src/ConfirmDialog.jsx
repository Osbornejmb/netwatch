import { useId } from 'react'
import useModal from './useModal'

export default function ConfirmDialog({ title, message, label, onClose, onConfirm }) {
  const titleId = useId(), messageId = useId()
  const modal = useModal(onClose)
  return <dialog {...modal} className="modal device-dialog" aria-labelledby={titleId} aria-describedby={messageId}>
    <h2 id={titleId}>{title}</h2>
    <p id={messageId}>{message}</p>
    <div className="modal-actions">
      <button type="button" data-initial-focus className="button secondary" onClick={onClose}>Cancel</button>
      <button type="button" className="button danger" onClick={() => { onClose(); onConfirm() }}>{label}</button>
    </div>
  </dialog>
}
