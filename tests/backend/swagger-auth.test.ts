import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSwaggerAuthBridge, type SwaggerRequest, type SwaggerSystem } from '../../src/lib/swagger-auth.ts'
function fixture() {
  const authorized: string[] = [], loggedOut: string[][] = []
  const instance: SwaggerSystem = {
    preauthorizeApiKey(name, token) { assert.equal(name, 'bearerAuth'); authorized.push(token) },
    authActions: { logout(names) { loggedOut.push(names) } },
  }
  const bridge = createSwaggerAuthBridge()
  bridge.attach(instance)
  return { bridge, authorized, loggedOut }
}
test('Swagger onComplete receives no argument and must preserve the instance for later login', () => {
  const { bridge, authorized } = fixture()
  bridge.onComplete()
  bridge.setToken('test-access-token')
  assert.deepEqual(authorized, ['test-access-token'])
})
test('login before the OpenAPI definition loads authorizes when it becomes ready', () => {
  const { bridge, authorized } = fixture()
  bridge.setToken('early-test-token')
  assert.deepEqual(authorized, [])
  bridge.onComplete()
  assert.deepEqual(authorized, ['early-test-token'])
})
test('Try it out attaches the current session token and updates it after refresh', () => {
  const { bridge } = fixture()
  bridge.onComplete()
  bridge.setToken('first-test-token')
  const first: SwaggerRequest = { url: '/api/flexi/workouts', headers: { 'Content-Type': 'application/json' } }
  bridge.intercept(first, 'http://localhost:3000')
  assert.equal(first.headers?.Authorization, 'Bearer first-test-token')
  assert.equal(first.headers?.['Content-Type'], 'application/json')
  bridge.setToken('refreshed-test-token')
  const next: SwaggerRequest = { url: 'http://localhost:3000/api/flexi/profile', headers: { authorization: 'Bearer stale-test-token' } }
  bridge.intercept(next, 'http://localhost:3000')
  assert.deepEqual(next.headers, { Authorization: 'Bearer refreshed-test-token' })
})
test('docs session is never attached to external URLs, assets, or the OpenAPI document', () => {
  const { bridge } = fixture()
  bridge.setToken('private-test-token')
  for (const url of ['https://example.com/api/flexi/profile', '/api/openapi', '/api-docs/assets/swagger-ui.css', '/api/flexi-lookalike/profile']) {
    const request: SwaggerRequest = { url }
    bridge.intercept(request, 'http://localhost:3000')
    assert.equal(request.headers, undefined)
  }
})
test('logout clears Swagger authorization and stops automatic header injection', () => {
  const { bridge, loggedOut } = fixture()
  bridge.onComplete(); bridge.setToken('test-token'); bridge.setToken(null)
  assert.deepEqual(loggedOut, [['bearerAuth']])
  const request: SwaggerRequest = { url: '/api/flexi/profile' }
  bridge.intercept(request, 'http://localhost:3000')
  assert.equal(request.headers, undefined)
})
test('manual Swagger Authorize remains available without a docs login session', () => {
  const { bridge } = fixture()
  bridge.onComplete()
  const request: SwaggerRequest = { url: '/api/flexi/profile', headers: { Authorization: 'Bearer manual-test-token' } }
  bridge.intercept(request, 'http://localhost:3000')
  assert.equal(request.headers?.Authorization, 'Bearer manual-test-token')
})
