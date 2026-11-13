import { Handle, Position } from '@xyflow/react'
import { Network } from 'lucide-react'

export default function SwitchNode({ data, selected }) {
  return (
    <div className={`device-node switch-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <Handle type="target" position={Position.Left} id="left-target" />
      <div className="device-icon switch-icon"><Network size={20} /></div>
      <div className="device-copy">
        <strong>{data.label}</strong>
        <span>{data.ip || 'No IP address'}</span>
        <small className="state state-unknown">Draft device</small>
      </div>
      <Handle type="source" position={Position.Bottom} />
      <Handle type="source" position={Position.Right} id="right" />
    </div>
  )
}