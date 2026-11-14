const rules=[
  ['Router',/\b(router|gateway|modem|access[- ]?point|wireless[- ]?ap)\b/i,'High'],
  ['Switch',/\bswitch(?:\d+)?\b/i,'High'],
  ['Phone',/\b(iphone|android[- ]?phone|pixel[- ]?\d*|galaxy[- ]?(s|a|z)\d+)\b/i,'Low'],
  ['PC',/\b(desktop|laptop|workstation|macbook|imac|thinkpad|windows[- ]?pc)\b/i,'Low'],
]
export function guessDeviceType(hostname) {
  if(typeof hostname!=='string'||hostname.length>253)return {type:'Unknown',confidence:'Low',evidence:'No name hint'}
  for(const [type,pattern,confidence] of rules)if(pattern.test(hostname))return {type,confidence,evidence:`Name hint: ${hostname}`}
  return {type:'Unknown',confidence:'Low',evidence:hostname?`Name hint: ${hostname}`:'No name hint'}
}
