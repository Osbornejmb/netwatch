import { Handle, Position } from '@xyflow/react'
import { Router, Network } from 'lucide-react'
import { Fragment } from 'react'
import InfoTooltip from '../InfoTooltip'
import { nodeDimensions } from './dimensions'

export function NodeHandles() {
  return Object.entries({ top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left }).map(([side, position]) => <Fragment key={side}><Handle type="source" position={position} id={`radial-source-${side}`}/><Handle type="target" position={position} id={`radial-target-${side}`}/></Fragment>)
}

export default function DeviceNode({ data, selected, kind }) {
  const Icon = kind === 'router' ? Router : Network
  return <div style={nodeDimensions} className={`device-node ${kind}-node${selected ? ' selected' : ''}`}>
    <NodeHandles/>
    <div className="device-icon"><Icon size={20} aria-hidden="true"/></div>
    <div className="device-copy"><strong className={data.ip && data.label === data.ip ? 'device-ip-label' : undefined}>{data.label}</strong></div>
    <InfoTooltip label={`Information for ${data.label}`}><strong>{data.label}</strong><span>{data.ip || 'No address'}</span>{data.description && <span>{data.description}</span>}</InfoTooltip>
  </div>
}
