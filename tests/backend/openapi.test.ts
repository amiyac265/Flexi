import assert from 'node:assert/strict'
import { test } from 'node:test'
import SwaggerParser from '@apidevtools/swagger-parser'
import { openapi } from '../../src/backend/openapi.ts'
import { apiOperations } from '../../src/backend/endpoints.ts'

test('the public document is valid OpenAPI, with no external reference resolution', async () => {
  await SwaggerParser.validate(JSON.parse(JSON.stringify(openapi)), { resolve: { external: false } })
})
test('OpenAPI documents every registered operation exactly once', () => {
  const documented = Object.entries(openapi.paths).flatMap(([path, operations]) => Object.keys(operations).map(method => `${method.toUpperCase()} ${path}`)).sort()
  const implemented = apiOperations.map(({ path, method }) => `${method} /${path.replace(':id', '{id}')}`).sort()
  assert.deepEqual(documented, implemented)
  const ids = Object.values(openapi.paths).flatMap(operations => Object.values(operations).map(operation => operation.operationId))
  assert.equal(new Set(ids).size, ids.length)
})
test('all operations use the app origin and authenticated scheme', () => {
  assert.deepEqual(openapi.servers, [{ url: '/api/flexi', description: 'This application' }])
  assert.deepEqual(openapi.security, [{ bearerAuth: [] }])
  for (const operations of Object.values(openapi.paths)) for (const operation of Object.values(operations)) {
    assert(!('security' in operation), 'No operation should disable authentication')
    assert(operation.responses['401'])
  }
  assert.equal(openapi.components.securitySchemes.bearerAuth.scheme, 'bearer')
})
