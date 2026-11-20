export const deviceTypes = Object.freeze({
  endpoint: 'Endpoint',
  computer: 'Computer',
  printer: 'Printer',
  switch: 'Switch',
  router: 'Router',
})

export const isInfrastructure = (type) => type === 'switch' || type === 'router'
