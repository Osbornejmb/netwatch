import { useId } from 'react'
import useModal from './useModal'

export default function ConfirmDialog({
  title,
  message,
  label,
  onClose,
  onConfirm,
  children,
  busy = false,
  dismissOnConfirm = true,
}) {
  const titleId = useId(),
    messageId = useId()
  const modal = useModal(onClose)
  return (
    <dialog
      {...modal}
      className="modal device-dialog confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={messageId}>{message}</p>
      {children}
      <div className="modal-actions">
        <button type="button" data-initial-focus className="button secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={dismissOnConfirm ? 'button danger' : 'button primary'}
          disabled={busy}
          onClick={() => {
            if (dismissOnConfirm) onClose()
            onConfirm()
          }}
        >
          {label}
        </button>
      </div>
    </dialog>
  )
}
