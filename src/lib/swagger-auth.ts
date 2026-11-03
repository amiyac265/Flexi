export type SwaggerSystem = {
  preauthorizeApiKey: (name: string, token: string) => void
  authActions: { logout: (names: string[]) => void }
}
export type SwaggerRequest = { url: string; headers?: Record<string, string> }

/** Keep the docs session independent from Swagger's asynchronous definition loading. */
export function createSwaggerAuthBridge() {
  let system: SwaggerSystem | null = null
  let accessToken: string | null = null
  let ready = false
  return {
    attach(instance: SwaggerSystem) { system = instance },
    // SwaggerUIBundle calls onComplete with NO arguments; retain the returned instance.
    onComplete() {
      ready = true
      if (accessToken) system?.preauthorizeApiKey('bearerAuth', accessToken)
    },
    setToken(token: string | null) {
      accessToken = token
      if (!ready) return
      if (token) system?.preauthorizeApiKey('bearerAuth', token)
      else system?.authActions.logout(['bearerAuth'])
    },
    intercept<T extends SwaggerRequest>(request: T, origin: string): T {
      const url = new URL(request.url, origin)
      const isAPIRequest = url.origin === origin && url.pathname.startsWith('/api/flexi/')
      if (!isAPIRequest) return request
      // Read the current token at execution time, including refreshes. If the docs
      // login is unused, preserve a token entered manually in Swagger's Authorize dialog.
      if (accessToken) {
        request.headers ??= {}
        for (const name of Object.keys(request.headers)) {
          if (name.toLowerCase() === 'authorization') delete request.headers[name]
        }
        request.headers.Authorization = `Bearer ${accessToken}`
      }
      return request
    },
  }
}
