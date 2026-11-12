import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAddress, deviceFields } from '../src/inventory.js'
import { validateTopology } from '../src/topology.js'

test('normalizes literal IPv4/IPv6, including equivalent and embedded IPv4 IPv6 forms', () => {
  for (const [input, expected] of [['',''],[' 192.0.2.1 ','192.0.2.1'],['0.0.0.0','0.0.0.0'],['255.255.255.255','255.255.255.255'],['2001:0DB8:0:0:0:0:0:1','2001:db8::1'],['::','::'],['::ffff:192.0.2.1','::ffff:c000:201']]) assert.equal(normalizeAddress(input),expected)
  for (const address of ['localhost','192.0.2.256','192.0.2','192.000.2.1','0xc0.0.2.1','1e2.0.2.1','[::1]','fe80::1%eth0','2001:::1','1:2:3:4:5:6:7:8:9','2001:db8::g','::1/64','::1:80/path','192.0.2.1;echo x','https://example.com']) assert.throws(()=>normalizeAddress(address),/IPv4 or IPv6/)
})

test('duplicate checks use canonical addresses, exclude current device, and permit empty entries', () => {
  const nodes=[{id:'a',data:{ip:'2001:0db8:0:0:0:0:0:1'}},{id:'b',data:{ip:''}}]
  const fields={label:' Router ',ip:'2001:db8::1',description:' Rack '}
  assert.throws(()=>deviceFields(fields,nodes),/already assigned/)
  assert.deepEqual(deviceFields(fields,nodes,'a'),{label:'Router',ip:'2001:db8::1',description:'Rack'})
  assert.equal(deviceFields({...fields,ip:''},nodes).ip,'')
  assert.throws(()=>deviceFields({...fields,label:' '},nodes),/name/)
})

test('imports normalize addresses and reject invalid or equivalent duplicates without mutating input', () => {
  const input={nodes:['a','b'].map((id,index)=>({id,type:'router',position:{x:0,y:0},data:{label:id,ip:index?'':'2001:0DB8::1'}})),edges:[]}
  const before=structuredClone(input)
  assert.equal(validateTopology(input).nodes[0].data.ip,'2001:db8::1')
  assert.deepEqual(input,before)
  input.nodes[1].data.ip='2001:db8:0:0::1'
  assert.throws(()=>validateTopology(input),/Duplicate/)
  input.nodes[1].data.ip='example.com'
  assert.throws(()=>validateTopology(input),/IPv4 or IPv6/)
})
