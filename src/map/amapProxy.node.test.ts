import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAmapUpstreamUrl,
  handleAmapProxyRequest,
  isAllowedAmapMethod,
} from '../../api/amap-proxy.ts'

test('routes ordinary AMap services to restapi with preserved query and server jscode', () => {
  const url = buildAmapUpstreamUrl(
    'https://example.test/api/amap-proxy?path=v3/place/text&keywords=%E4%BA%91%E5%86%88&jscode=attacker',
    'server-secret',
  )
  assert.equal(url.origin, 'https://restapi.amap.com')
  assert.equal(url.pathname, '/v3/place/text')
  assert.equal(url.searchParams.get('keywords'), '云冈')
  assert.equal(url.searchParams.getAll('jscode').length, 1)
  assert.equal(url.searchParams.get('jscode'), 'server-secret')
  assert.equal(url.searchParams.has('path'), false)
})

test('routes v4 map styles to webapi only', () => {
  const url = buildAmapUpstreamUrl(
    'https://example.test/api/amap-proxy?path=v4/map/styles/abc&style=normal',
    'server-secret',
  )
  assert.equal(url.origin, 'https://webapi.amap.com')
  assert.equal(url.pathname, '/v4/map/styles/abc')
})

test('path input cannot replace the fixed AMap origin', () => {
  assert.throws(
    () => buildAmapUpstreamUrl('https://example.test/api/amap-proxy?path=https%3A%2F%2Fevil.example%2Fpwn', 'server-secret'),
    /AMAP_PROXY_PATH_INVALID/,
  )
  assert.throws(
    () => buildAmapUpstreamUrl('https://example.test/api/amap-proxy?path=%2F%2Fevil.example%2Fpwn', 'server-secret'),
    /AMAP_PROXY_PATH_INVALID/,
  )
})

test('allows only GET and POST', () => {
  assert.equal(isAllowedAmapMethod('GET'), true)
  assert.equal(isAllowedAmapMethod('POST'), true)
  assert.equal(isAllowedAmapMethod('PUT'), false)
  assert.equal(isAllowedAmapMethod('OPTIONS'), false)
})

test('missing server security code fails closed without contacting upstream', async () => {
  let called = false
  const response = await handleAmapProxyRequest(
    new Request('https://example.test/api/amap-proxy?path=v3/place/text'),
    {
      securityCode: '',
      fetchImpl: async () => {
        called = true
        return new Response('unexpected')
      },
    },
  )
  assert.equal(response.status, 503)
  assert.equal(called, false)
  assert.deepEqual(await response.json(), {
    error: 'AMAP_SECURITY_CODE_MISSING',
    message: 'AMap server security code is not configured.',
  })
})

test('upstream failure returns 502 without exposing the server secret', async () => {
  const response = await handleAmapProxyRequest(
    new Request('https://example.test/api/amap-proxy?path=v3/place/text&keywords=test'),
    {
      securityCode: 'never-leak-this',
      fetchImpl: async () => { throw new Error('network down') },
    },
  )
  assert.equal(response.status, 502)
  const body = await response.text()
  assert.match(body, /AMAP_UPSTREAM_FAILED/)
  assert.equal(body.includes('never-leak-this'), false)
})
