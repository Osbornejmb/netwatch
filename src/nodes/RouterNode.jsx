import { Handle, Position } from '@xyflow/react'
import { Router } from 'lucide-react'

export default function RouterNode({ data, selected }) {
  return (
    <div className={`device-node router-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="device-icon router-icon"><Router size={21} /></div>
      <div className="device-copy">
        <strong>{data.label}</strong>
        <span>{data.ip || 'No IP address'}</span>
        <small className="state state-unknown">Draft device</small>
      </div>
      <Handle type="source" position={Position.Bottom} />
      <Handle type="source" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
    </div>
  )
}