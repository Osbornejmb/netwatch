export function authSession(context) {
  return (
    context.auth?.current(context) ?? {
      source: 'local',
      authenticated: true,
      role: 'admin',
      viewerMode: 'disabled',
      remoteEnabled: false,
    }
  )
}

export function authLogin(context) {
  return context.auth?.login(context) ?? { role: 'admin' }
}

export function authLogout(context) {
  return context.auth?.logout(context) ?? { authenticated: false }
}
