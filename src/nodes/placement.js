import { NODE_WIDTH, NODE_HEIGHT } from './dimensions.js'

const GAP = 40
export function gridPosition(index) {
  return { x: (index % 5) * (NODE_WIDTH + GAP), y: Math.floor(index / 5) * (NODE_HEIGHT + GAP) }
}

export function nextFreePosition(nodes) {
  for (let index = 0; ; index++) {
    const position = gridPosition(index)
    if (nodes.every(node => Math.abs(node.position.x - position.x) >= NODE_WIDTH + GAP || Math.abs(node.position.y - position.y) >= NODE_HEIGHT + GAP)) return position
  }
}
