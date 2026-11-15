import test from 'node:test'
import assert from 'node:assert/strict'
import { radialLayout, tidyLayout, connectedDevices } from '../src/radial.js'
import { NODE_MAX_WIDTH, NODE_HEIGHT } from '../src/nodes/dimensions.js'
import { createScaleNetwork } from './fixtures/scale-network.js'
const node = (id, type='switch') => ({id,type,position:{x:15,y:25},data:{label:id,ip:''}})
const link = (source,target) => ({id:`${source}-${target}`,source,target})
const center = node => ({x:node.position.x+100,y:node.position.y+90})
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y)

test('automatically linked gateway clients pack closer than a single ring without overlap', () => {
 const nodes = [node('gateway','router'), ...Array.from({length:9},(_,i)=>node(String(i)))]
 const edges = nodes.slice(1).map(n=>link(n.id,'gateway'))
 const ring = radialLayout(nodes,edges)
 const compact = radialLayout(nodes,edges.map(edge=>({...edge,label:'Gateway route'})))
 const longest = layout => Math.max(...layout.slice(1).map(n=>distance(n.position,layout[0].position)))
 assert.ok(longest(compact) < longest(ring) * 0.85)
 for (const a of compact) for (const b of compact) if(a!==b)
  assert.ok(Math.abs(a.position.x-b.position.x)>=NODE_MAX_WIDTH+20 || Math.abs(a.position.y-b.position.y)>=NODE_HEIGHT+24)
})

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
  const sizes=Object.fromEntries(fixture.nodes.map(({id})=>[id,{width:160}]))
  const layout=radialLayout(fixture.nodes,edges,'',sizes)
  assert.equal(layout.length,100)
  assert.ok(layout.every(n=>Number.isFinite(n.position.x)&&Number.isFinite(n.position.y)))
  for (const axis of ['x','y']) {
   const coordinates=layout.map(({position})=>position[axis])
   assert.ok(Math.max(...coordinates)-Math.min(...coordinates)<2400,'The overview stays compact')
  }
  for(let a=0;a<layout.length;a++) for(let b=a+1;b<layout.length;b++) assert.ok(Math.abs(layout[a].position.x-layout[b].position.x)>=160-0.001||Math.abs(layout[a].position.y-layout[b].position.y)>=NODE_HEIGHT-0.001)
 }
})

test('connection highlight finds direct incoming/outgoing peers only, including cycles and parallel links', () => {
 const nodes=[node('a'),node('b'),node('c'),node('d'),node('isolated')]
 const edges=[link('a','b'),link('b','a'),link('c','a'),link('b','d'),link('a','a'),link('a','missing')]
 assert.deepEqual([...connectedDevices('a',nodes,edges)].sort(),['b','c'])
 assert.equal(connectedDevices('isolated',nodes,edges).size,0)
 assert.equal(connectedDevices('missing',nodes,edges).size,0)
})

test('circle uses close card-aware spacing on small chains and opposite peers', () => {
  const nodes = [node('hub','router'), node('a'), node('leaf')]
  const edges = [link('hub','a'), link('a','leaf')]
  const positions = Object.fromEntries(radialLayout(nodes,edges).map(n=>[n.id,n.position]))
  assert.ok(distance(positions.hub,positions.a) < 86)
  assert.ok(distance(positions.a,positions.leaf) < 86)
  const opposite = Object.fromEntries(radialLayout(nodes,[link('hub','a'),link('hub','leaf')]).map(n=>[n.id,n.position]))
  assert.ok(distance(opposite.hub,opposite.a)<86)
  assert.ok(distance(opposite.hub,opposite.leaf)<86)
  for (const count of [3,4,7,20]) {
    const peers = Array.from({length:count},(_,i)=>node(String(i)))
    const layout=radialLayout([node('hub','router'),...peers],peers.map(n=>link('hub',n.id)))
    for(const a of layout) for(const b of layout) if(a!==b) assert.ok(Math.abs(a.position.x-b.position.x)>=NODE_MAX_WIDTH+19.999||Math.abs(a.position.y-b.position.y)>=NODE_HEIGHT+23.999)
  }
})

test('four peers clear the hub using card height above and below it', () => {
  const peers = ['a', 'b', 'c', 'd'].map(id => node(id))
  const layout = radialLayout([node('hub','router'), ...peers], peers.map(peer => link(peer.id,'hub')))
  const [hub, above, right, below, left] = layout.map(node => node.position)
  for (const peer of [above, below]) {
    assert.ok(Math.abs(peer.x - hub.x) < 0.001)
    assert.ok(Math.abs(peer.y - hub.y) >= NODE_HEIGHT + 24 && Math.abs(peer.y - hub.y) < NODE_HEIGHT + 25)
  }
  for (const peer of [right, left]) {
    assert.ok(Math.abs(peer.y - hub.y) < 0.001)
    assert.ok(Math.abs(peer.x - hub.x) >= NODE_MAX_WIDTH + 20)
  }
})

test('devices behind a secondary router stay with its branch in both layouts', () => {
  const clients = Array.from({ length: 7 }, (_, index) => node('client-' + index))
  const nodes = [node('main', 'router'), node('secondary', 'router'), ...clients, node('leaf-a'), node('leaf-b')]
  const edges = [...clients.map((client) => link('main', client.id)), link('secondary', 'main'),
    link('leaf-a', 'secondary'), link('secondary', 'leaf-b')]
  const positions = (layout) => new Map(layout.map((item) => [item.id, item.position]))
  const circle = positions(radialLayout(nodes, edges))
  const root = circle.get('main')
  const parent = circle.get('secondary')
  for (const id of ['leaf-a', 'leaf-b']) {
    const child = circle.get(id)
    assert.ok(distance(child, parent) < distance(child, root))
    assert.ok((child.x - parent.x) * (parent.x - root.x) + (child.y - parent.y) * (parent.y - root.y) > 0)
  }
  const tidy = positions(tidyLayout(nodes, edges))
  const a = tidy.get('leaf-a'), b = tidy.get('leaf-b'), branch = tidy.get('secondary')
  assert.equal(a.y, b.y)
  assert.ok(a.y > branch.y)
  assert.equal((a.x + b.x) / 2, branch.x)
  assert.equal(Math.abs(a.x - b.x), NODE_MAX_WIDTH + 20)
  const x = [...tidy.values()].map((position) => position.x)
  assert.ok(Math.max(...x) - Math.min(...x) <= 4 * (NODE_MAX_WIDTH + 20))
  assert.deepEqual(positions(radialLayout([...nodes].reverse(), [...edges].reverse())), circle)
})

test('both layouts close excess horizontal gaps once all card widths are known', () => {
  const nodes = [node('router', 'router'), ...['a', 'b', 'c', 'd'].map((id) => node(id))]
  const edges = nodes.slice(1).map(({ id }) => link('router', id))
  const sizes = Object.fromEntries(nodes.map(({ id }) => [id, { width: 160 }]))
  const width = (layout) => {
    const x = layout.map(({ position }) => position.x)
    return Math.max(...x) - Math.min(...x)
  }
  for (const [original, compact] of [
    [radialLayout(nodes, edges), radialLayout(nodes, edges, '', sizes)],
    [tidyLayout(nodes, edges), tidyLayout(nodes, edges, sizes)],
  ]) {
    assert.ok(width(compact) < width(original))
    for (const [index, a] of compact.entries())
      for (const b of compact.slice(index + 1))
        assert.ok(Math.abs(a.position.x - b.position.x) >= 179.999 ||
          Math.abs(a.position.y - b.position.y) >= NODE_HEIGHT + 23.999)
  }
})
