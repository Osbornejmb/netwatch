import { Handle, Position } from '@xyflow/react'
import { CircleHelp, Router, Network } from 'lucide-react'
import { Fragment } from 'react'
import { nodeDimensions } from './dimensions'

export function NodeHandles() {
  return Object.entries({ top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left }).map(([side, position]) => <Fragment key={side}><Handle type="source" position={position} id={`radial-source-${side}`}/><Handle type="target" position={position} id={`radial-target-${side}`}/></Fragment>)
}

export default function DeviceNode({ data, selected, kind }) {
  const Icon = kind === 'router' ? Router : Network
  return <div style={nodeDimensions} className={`device-node ${kind}-node${selected ? ' selected' : ''}`}>
    <NodeHandles/>
    <div className="device-icon"><Icon size={20} aria-hidden="true"/></div>
    <div className="device-copy"><strong title={data.label}>{data.label}</strong><span title={data.ip}>{data.ip || 'No address'}</span></div>
    <CircleHelp size={14} role="img" aria-label="Not monitored" className="node-status"/>
  </div>
}
