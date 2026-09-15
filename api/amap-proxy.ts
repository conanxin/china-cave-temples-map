const REST_API_ORIGIN = 'https://restapi.amap.com'
const WEB_API_ORIGIN = 'https://webapi.amap.com'

type FetchLike = typeof fetch

export interface AmapProxyOptions {
  securityCode?: string
  fetchImpl?: FetchLike
}

export function isAllowedAmapMethod(method: string) {
  return method === 'GET' || method === 'POST'
}

function normalizeAmapPath(rawPath: string | null) {
  if (!rawPath) throw new Error('AMAP_PROXY_PATH_INVALID')

  const raw = rawPath.trim()
  if (
    !raw ||
    raw.includes('://') ||
    raw.startsWith('//') ||
    raw.includes('\\') ||
    raw.includes('?') ||
    raw.includes('#')
  ) {
    throw new Error('AMAP_PROXY_PATH_INVALID')
  }

  const path = raw.replace(/^\/+/, '')
  if (!path || path.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error('AMAP_PROXY_PATH_INVALID')
  }

  return path
}

export function buildAmapUpstreamUrl(requestUrl: string, securityCode: string) {
  const request = new URL(requestUrl)
  const path = normalizeAmapPath(request.searchParams.get('path'))
  const origin = path === 'v4/map/styles' || path.startsWith('v4/map/styles/')
    ? WEB_API_ORIGIN
    : REST_API_ORIGIN

  const upstream = new URL(`/${path}`, `${origin}/`)
  request.searchParams.forEach((value, key) => {
    if (key === 'path' || key === 'jscode') return
    upstream.searchParams.append(key, value)
  })
  upstream.searchParams.set('jscode', securityCode)
  return upstream
}

function jsonError(status: number, error: string, message: string) {
  return Response.json(
    { error, message },
    { status, headers: { 'cache-control': 'no-store' } },
  )
}

export async function handleAmapProxyRequest(
  request: Request,
  options: AmapProxyOptions,
): Promise<Response> {
  if (!isAllowedAmapMethod(request.method)) {
    const response = jsonError(
      405,
      'AMAP_PROXY_METHOD_NOT_ALLOWED',
      'Only GET and POST are supported by the AMap proxy.',
    )
    response.headers.set('allow', 'GET, POST')
    return response
  }

  const securityCode = options.securityCode?.trim()
  if (!securityCode) {
    return jsonError(
      503,
      'AMAP_SECURITY_CODE_MISSING',
      'AMap server security code is not configured.',
    )
  }

  let upstreamUrl: URL
  try {
    upstreamUrl = buildAmapUpstreamUrl(request.url, securityCode)
  } catch {
    return jsonError(
      400,
      'AMAP_PROXY_PATH_INVALID',
      'The AMap proxy path is missing or invalid.',
    )
  }

  const headers = new Headers()
  let body: ArrayBuffer | undefined
  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type')
    if (contentType) headers.set('content-type', contentType)
    body = await request.arrayBuffer()
  }

  const fetchImpl = options.fetchImpl ?? fetch
  let upstreamResponse: Response
  try {
    upstreamResponse = await fetchImpl(upstreamUrl, {
      method: request.method,
      headers,
      body,
      redirect: 'follow',
    })
  } catch {
    return jsonError(
      502,
      'AMAP_UPSTREAM_FAILED',
      'The AMap upstream request failed.',
    )
  }

  const responseHeaders = new Headers()
  const contentType = upstreamResponse.headers.get('content-type')
  if (contentType) responseHeaders.set('content-type', contentType)

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  })
}

export default {
  fetch(request: Request) {
    return handleAmapProxyRequest(request, {
      securityCode: process.env.AMAP_SECURITY_CODE,
    })
  },
}
