import test from 'node:test'
import assert from 'node:assert/strict'
import { radialLayout, radialHandles, connectedDevices } from '../src/radial.js'
import { NODE_MAX_WIDTH, NODE_HEIGHT } from '../src/nodes/dimensions.js'
import { createScaleNetwork } from './fixtures/scale-network.js'
const node = (id, type='switch') => ({id,type,position:{x:15,y:25},data:{label:id,ip:''}})
const link = (source,target) => ({id:`${source}-${target}`,source,target})
const center = node => ({x:node.position.x+100,y:node.position.y+90})
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y)

test('radial layout uses router center and graph-distance rings without mutating topology', () => {
 const nodes=[node('hub','router'),node('a'),node('b'),node('leaf')]
 const edges=[link('hub','a'),link('b','hub'),link('a','leaf')]
 const before=structuredClone({nodes,edges})
 const result=radialLayout(nodes,edges)
 const c=id=>center(result.find(n=>n.id===id))
 assert.ok(Math.abs(distance(c('hub'),c('a'))-distance(c('hub'),c('b')))<0.001)
 assert.ok(distance(c('hub'),c('leaf'))>distance(c('hub'),c('a')))
 assert.deepEqual({nodes,edges},before)
 assert.deepEqual(result.map(n=>({id:n.id,type:n.type,data:n.data})),nodes.map(n=>({id:n.id,type:n.type,data:n.data})))
})

test('cycles, shuffled inputs, explicit centers and disconnected devices remain deterministic and separated', () => {
 const nodes=[node('a','router'),node('b'),node('c'),node('alone')]
 const edges=[link('a','b'),link('b','c'),link('c','a')]
 const positions=result=>Object.fromEntries(result.map(n=>[n.id,n.position]).sort(([a],[b])=>a.localeCompare(b)))
 assert.deepEqual(positions(radialLayout(nodes,edges)),positions(radialLayout([...nodes].reverse(),[...edges].reverse())))
 assert.notDeepEqual(positions(radialLayout(nodes,edges)),positions(radialLayout(nodes,edges,'b')))
 const result=radialLayout(nodes,edges)
 for(const a of result) for(const b of result) if(a!==b) assert.ok(Math.abs(a.position.x-b.position.x)>=NODE_MAX_WIDTH||Math.abs(a.position.y-b.position.y)>=NODE_HEIGHT)
 assert.deepEqual(radialLayout([],[]),[])
 assert.deepEqual(radialLayout([node('one')],[])[0].position,{x:0,y:0})
 assert.deepEqual(positions(radialLayout(nodes,edges,'missing')),positions(radialLayout(nodes,edges)))
})

test('100-device mesh and 100-spoke star produce finite non-overlapping positions', () => {
 const fixture=createScaleNetwork(Date.now())
 const star=fixture.nodes.slice(1).map(n=>link(fixture.nodes[0].id,n.id))
 for(const edges of [fixture.edges,star]) {
  const layout=radialLayout(fixture.nodes,edges)
  assert.equal(layout.length,100)
  assert.ok(layout.every(n=>Number.isFinite(n.position.x)&&Number.isFinite(n.position.y)))
  for(let a=0;a<layout.length;a++) for(let b=a+1;b<layout.length;b++) assert.ok(distance(center(layout[a]),center(layout[b]))>=269-0.001)
 }
 assert.deepEqual(radialHandles({x:0,y:0},{x:100,y:0}),{sourceHandle:'radial-source-right',targetHandle:'radial-target-left'})
 assert.deepEqual(radialHandles({x:0,y:100},{x:0,y:0}),{sourceHandle:'radial-source-top',targetHandle:'radial-target-bottom'})
})

test('connection highlight finds direct incoming/outgoing peers only, including cycles and parallel links', () => {
 const nodes=[node('a'),node('b'),node('c'),node('d'),node('isolated')]
 const edges=[link('a','b'),link('b','a'),link('c','a'),link('b','d'),link('a','a'),link('a','missing')]
 assert.deepEqual([...connectedDevices('a',nodes,edges)].sort(),['b','c'])
 assert.equal(connectedDevices('isolated',nodes,edges).size,0)
 assert.equal(connectedDevices('missing',nodes,edges).size,0)
})
