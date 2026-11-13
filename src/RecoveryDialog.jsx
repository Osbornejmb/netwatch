import useModal from './useModal'

export default function RecoveryDialog({ action, paused, onClose, onConfirm, onDownloadOriginal, hasOriginal, unavailable }) {
  const modal = useModal(onClose)
  const importing = action.kind === 'import'
  return <dialog {...modal} className="modal device-dialog" aria-labelledby="recovery-dialog-title">
    <h2 id="recovery-dialog-title">{importing ? 'Import this map?' : 'Replace saved map?'}</h2>
    <p>{importing ? `Replace the visible map with ${action.topology.nodes.length} devices and ${action.topology.edges.length} links? Export your current map first if you need a backup.` : 'Replace the saved draft with the map you see now and resume automatic saving?'}</p>
    {paused && <p>{importing ? 'Autosave will stay paused. The original saved content will remain untouched until you explicitly replace the saved map.' : hasOriginal ? 'Download the original saved content before replacing it if you need to recover it later.' : unavailable ? 'Storage could not be read, so its existing contents cannot be backed up here. Allow storage access and reload before replacing it if you need to recover that data.' : 'Export the current map before retrying if you need a backup.'}</p>}
    {hasOriginal && <button className="button secondary" onClick={onDownloadOriginal}>Download original</button>}
    <div className="modal-actions"><button data-initial-focus className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" onClick={onConfirm}>{importing ? 'Import map' : 'Replace saved map'}</button></div>
  </dialog>
}
