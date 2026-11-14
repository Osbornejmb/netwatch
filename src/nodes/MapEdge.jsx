import { BaseEdge } from '@xyflow/react'
import { NODE_HEIGHT, NODE_WIDTH } from './dimensions'
import { edgeRoute } from './edgeRoute'

export const mapEdgeTypes = { mapLink: MapEdge }

export function mapCard(node) {
  return { ...node.position, width: node.measured?.width ?? NODE_WIDTH, height: node.measured?.height ?? NODE_HEIGHT }
}

function MapEdge({ id, data, style, label, labelStyle, markerEnd }) {
  const { source, target, cards } = data
  const points = edgeRoute(source, target, cards)
  const path = points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
  let a = points[0], b = points[1]
  for (let i = 2; i < points.length; i++) {
    const next = points[i], previous = points[i - 1]
    if (Math.hypot(next.x - previous.x, next.y - previous.y) > Math.hypot(b.x - a.x, b.y - a.y)) {
      a = previous
      b = next
    }
  }
  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} label={label} labelStyle={labelStyle} labelX={(a.x + b.x) / 2} labelY={(a.y + b.y) / 2}/>
}
