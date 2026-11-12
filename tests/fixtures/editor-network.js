// Test-only inventory. Never imported by the application or passed to probes.
export function createEditorNetwork() {
const nodes = [
  { id: 'r1', type: 'router', position: { x: 360, y: 70 }, data: { label: 'CORE-ROUTER-01', ip: '192.168.1.1' } },
  { id: 'r2', type: 'router', position: { x: 690, y: 70 }, data: { label: 'CORE-ROUTER-02', ip: '192.168.1.2' } },
  { id: 's1', type: 'switch', position: { x: 525, y: 270 }, data: { label: 'CORE-SWITCH-01', ip: '192.168.1.10' } },
  { id: 's2', type: 'switch', position: { x: 270, y: 470 }, data: { label: 'ACCESS-SWITCH-01', ip: '192.168.1.11' } },
  { id: 's3', type: 'switch', position: { x: 780, y: 470 }, data: { label: 'ACCESS-SWITCH-02', ip: '192.168.1.12' } },
]
const edges = [
  { id: 'e-r1-s1', source: 'r1', target: 's1', label: 'Uplink', animated: false, style: { stroke: '#64748b', strokeWidth: 2 }, labelStyle: { fill: '#94a3b8', fontSize: 10 } },
  { id: 'e-r2-s1', source: 'r2', target: 's1', label: 'Uplink', style: { stroke: '#64748b', strokeWidth: 2 }, labelStyle: { fill: '#94a3b8', fontSize: 10 } },
  { id: 'e-s1-s2', source: 's1', target: 's2', label: 'Downlink', style: { stroke: '#64748b', strokeWidth: 2 }, labelStyle: { fill: '#94a3b8', fontSize: 10 } },
  { id: 'e-s1-s3', source: 's1', target: 's3', label: 'Downlink', style: { stroke: '#64748b', strokeWidth: 2 }, labelStyle: { fill: '#94a3b8', fontSize: 10 } },
]

return { schemaVersion: 1, nodes, edges }
}
