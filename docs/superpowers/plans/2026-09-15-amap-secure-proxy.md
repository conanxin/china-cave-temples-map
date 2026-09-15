# AMap Secure Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the AMap security code out of the Vite client bundle into a same-origin Vercel Function proxy while preserving all existing map/research behavior.

**Architecture:** The browser keeps only `VITE_AMAP_KEY` and configures AMap with `window._AMapSecurityConfig.serviceHost = <origin>/_AMapService`. Vercel rewrites `/_AMapService/:path*` to `api/amap-proxy.ts`, which forwards only GET/POST requests to fixed AMap upstream hosts and overwrites any inbound `jscode` with server-only `AMAP_SECURITY_CODE`.

**Tech Stack:** React, Vite, TypeScript, Vitest/jsdom, Node 22 built-in test runner, Vercel Functions, Vercel rewrites, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-amap-secure-proxy-design.md`

## Global Constraints

- Work only on `feat/amap-secure-proxy`; never push directly to protected `main`.
- `VITE_AMAP_KEY` is client-visible; `AMAP_SECURITY_CODE` is server-only.
- `VITE_AMAP_SECURITY_CODE` must disappear from frontend source, `.env.example`, and production guidance.
- The proxy upstream host must be fixed in source code and never selected by request input.
- Client-supplied `jscode` must be overwritten by the server-side value.
- Missing `AMAP_SECURITY_CODE` fails closed with HTTP 503.
- Do not change site data, GIS/georeference logic, canonical review semantics, or browser-local research sessions.
- No real AMap credentials may be committed, logged, placed in GitHub Actions output, or transmitted through chat/Telegram.
- Final delivery must pass the protected `test-build` check before squash merge.

---

### Task 1: Add RED tests for the client loader and secure proxy

**Files:**
- Modify: `src/map/amapLoader.test.ts`
- Create: `src/map/amapProxy.node.test.ts`

**Interfaces:**
- Consumes existing `loadAmap()` from `src/map/amapLoader.ts`.
- Defines expected proxy exports before implementation:
  - `buildAmapUpstreamUrl(requestUrl: string, securityCode: string): URL`
  - `isAllowedAmapMethod(method: string): boolean`
  - `handleAmapProxyRequest(request: Request, options: { securityCode?: string; fetchImpl?: typeof fetch }): Promise<Response>`
- Later tasks must implement exactly these names.

- [ ] **Step 1: Replace the loader test with the new security expectations**

Use Vitest module reset so the module-level loader promise is isolated between tests. The test must verify the missing-key regression and a successful browser setup:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

async function freshLoader() {
  vi.resetModules()
  return import('./amapLoader')
}

afterEach(() => {
  document.querySelectorAll('script[src*="webapi.amap.com/maps"]').forEach((node) => node.remove())
  delete window.AMap
  delete window._AMapSecurityConfig
  vi.restoreAllMocks()
})

describe('AMap loader', () => {
  it('refuses to load without a configured key', async () => {
    const { loadAmap } = await freshLoader()
    await expect(loadAmap('')).rejects.toThrow('AMAP_KEY_MISSING')
  })

  it('configures a same-origin serviceHost without exposing a securityJsCode', async () => {
    const { loadAmap } = await freshLoader()
    const pending = loadAmap('public-web-key')
    const script = document.querySelector<HTMLScriptElement>('script[src*="webapi.amap.com/maps"]')

    expect(script).not.toBeNull()
    expect(window._AMapSecurityConfig).toEqual({
      serviceHost: `${window.location.origin}/_AMapService`,
    })
    expect('securityJsCode' in (window._AMapSecurityConfig ?? {})).toBe(false)
    expect(script!.src).toContain('key=public-web-key')
    expect(script!.src).toContain('plugin=AMap.PlaceSearch')

    window.AMap = { Map: class {} }
    script!.onload?.(new Event('load'))
    await expect(pending).resolves.toBe(window.AMap)
  })
})
```

- [ ] **Step 2: Add proxy Node tests that cannot pass before the proxy exists**

Create `src/map/amapProxy.node.test.ts` with coverage for fixed upstreams, query preservation, `jscode` replacement, invalid paths, method filtering, missing secret, and upstream failure secret redaction:

```ts
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
```

- [ ] **Step 3: Run the two focused test suites and verify RED**

Run:

```bash
npm run test:ui -- src/map/amapLoader.test.ts
node --experimental-strip-types --test src/map/amapProxy.node.test.ts
```

Expected RED:
- loader test fails because current `loadAmap` still requires two arguments / writes `securityJsCode` rather than `serviceHost`;
- proxy test fails because `api/amap-proxy.ts` does not exist.

- [ ] **Step 4: Commit only the failing tests**

```bash
git add src/map/amapLoader.test.ts src/map/amapProxy.node.test.ts
git commit -m "test: define AMap secure proxy behavior"
```

---

### Task 2: Implement the client-side serviceHost loader

**Files:**
- Modify: `src/map/amapLoader.ts`
- Modify: `src/map/AmapMap.tsx`

**Interfaces:**
- Produces `loadAmap(key: string): Promise<any>`.
- Writes `window._AMapSecurityConfig = { serviceHost: <same-origin>/_AMapService }` before appending the AMap script.
- Removes all client reads of `VITE_AMAP_SECURITY_CODE`.

- [ ] **Step 1: Change `loadAmap` to one public argument and configure `serviceHost`**

The implementation must retain all existing failure/deduplication semantics while replacing the security config block with:

```ts
export function loadAmap(key: string) {
  if (!key || key === 'AMAP_KEY') return Promise.reject(new Error('AMAP_KEY_MISSING'))
  if (typeof window === 'undefined') return Promise.reject(new Error('AMAP_BROWSER_ONLY'))
  if (window.AMap) return Promise.resolve(window.AMap)
  if (promise) return promise

  window._AMapSecurityConfig = {
    serviceHost: `${window.location.origin}/_AMapService`,
  }

  // existing script loading behavior unchanged
}
```

Do not add `securityJsCode` anywhere.

- [ ] **Step 2: Remove the security-code environment read from `AmapMap`**

Replace:

```ts
const key = import.meta.env.VITE_AMAP_KEY ?? ''
const security = import.meta.env.VITE_AMAP_SECURITY_CODE ?? ''
```

with:

```ts
const key = import.meta.env.VITE_AMAP_KEY ?? ''
```

Call:

```ts
loadAmap(key)
```

and change the loader effect dependency from `[key, security]` to `[key]`.

Update the missing-key notice to say that the browser needs `VITE_AMAP_KEY` and the server proxy separately needs `AMAP_SECURITY_CODE`; do not instruct users to create a client-visible security-code variable.

- [ ] **Step 3: Run the focused loader test and verify GREEN**

```bash
npm run test:ui -- src/map/amapLoader.test.ts
```

Expected: both loader tests pass.

- [ ] **Step 4: Scan frontend source for the removed client secret name**

```bash
grep -R "VITE_AMAP_SECURITY_CODE" src || true
```

Expected: no output.

- [ ] **Step 5: Commit the client loader implementation**

```bash
git add src/map/amapLoader.ts src/map/AmapMap.tsx
git commit -m "fix: route AMap security through same-origin proxy"
```

---

### Task 3: Implement the fixed-host Vercel proxy

**Files:**
- Create: `api/amap-proxy.ts`
- Test: `src/map/amapProxy.node.test.ts`

**Interfaces:**
- `isAllowedAmapMethod(method: string): boolean`
- `buildAmapUpstreamUrl(requestUrl: string, securityCode: string): URL`
- `handleAmapProxyRequest(request: Request, options: { securityCode?: string; fetchImpl?: typeof fetch }): Promise<Response>`
- Default Vercel export delegates to `handleAmapProxyRequest(request, { securityCode: process.env.AMAP_SECURITY_CODE })`.

- [ ] **Step 1: Implement strict path validation and fixed upstream routing**

Use constants:

```ts
const REST_API_ORIGIN = 'https://restapi.amap.com'
const WEB_API_ORIGIN = 'https://webapi.amap.com'
```

Normalize the `path` query parameter by trimming leading `/`, then reject it when any of these are true:

```ts
!path
path.includes('://')
path.startsWith('//')
path.includes('\\')
path.includes('?')
path.includes('#')
path.split('/').some((segment) => segment === '..' || segment === '.')
```

Throw:

```ts
new Error('AMAP_PROXY_PATH_INVALID')
```

Choose `WEB_API_ORIGIN` only when `path === 'v4/map/styles'` or `path.startsWith('v4/map/styles/')`; otherwise always use `REST_API_ORIGIN`.

Copy all query parameters except `path` and `jscode`, preserving repeated values, then append exactly one server-controlled `jscode`.

- [ ] **Step 2: Implement handler failure semantics and narrow header forwarding**

Use this JSON helper:

```ts
function jsonError(status: number, error: string, message: string) {
  return Response.json(
    { error, message },
    { status, headers: { 'cache-control': 'no-store' } },
  )
}
```

Handler order:

1. Reject non-GET/POST with 405 `AMAP_PROXY_METHOD_NOT_ALLOWED` and `Allow: GET, POST`.
2. Reject missing/blank security code with 503 `AMAP_SECURITY_CODE_MISSING` without calling upstream.
3. Build URL; invalid path returns 400 `AMAP_PROXY_PATH_INVALID`.
4. Forward only the request `content-type` header for POST.
5. For POST, forward `await request.arrayBuffer()` as body; GET has no body.
6. Call `fetchImpl ?? fetch` with the fixed URL.
7. On fetch rejection, return 502 `AMAP_UPSTREAM_FAILED` without logging or returning the upstream URL or secret.
8. Return upstream body/status and only copy `content-type` from the upstream response. Do not forward cookies, auth, client IP, Vercel, or `content-encoding` headers.

- [ ] **Step 3: Add the Vercel Web Standard default export**

```ts
export default {
  fetch(request: Request) {
    return handleAmapProxyRequest(request, {
      securityCode: process.env.AMAP_SECURITY_CODE,
    })
  },
}
```

No real secret or fallback client secret is allowed.

- [ ] **Step 4: Run the focused proxy test and verify GREEN**

```bash
node --experimental-strip-types --test src/map/amapProxy.node.test.ts
```

Expected: all proxy tests pass.

- [ ] **Step 5: Commit the proxy implementation**

```bash
git add api/amap-proxy.ts
git commit -m "feat: add server-side AMap security proxy"
```

---

### Task 4: Wire Vercel routing and deployment configuration

**Files:**
- Modify: `vercel.json`
- Modify: `.env.example`
- Modify: `docs/deployment.md`

**Interfaces:**
- Public service endpoint: `/_AMapService/:path*`
- Internal function route: `/api/amap-proxy?path=:path*`
- Client variable: `VITE_AMAP_KEY`
- Server variable: `AMAP_SECURITY_CODE`

- [ ] **Step 1: Add the Vercel rewrite without changing build/output settings**

Final `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    {
      "source": "/_AMapService/:path*",
      "destination": "/api/amap-proxy?path=:path*"
    }
  ]
}
```

- [ ] **Step 2: Replace the client security-code example with the server variable**

Final `.env.example`:

```text
VITE_AMAP_KEY=AMAP_KEY
AMAP_SECURITY_CODE=AMAP_SECURITY_CODE
```

- [ ] **Step 3: Update deployment guidance**

`docs/deployment.md` must state:

- `VITE_AMAP_KEY` is embedded in the browser bundle and is not a server secret;
- `AMAP_SECURITY_CODE` is server-only and used by `api/amap-proxy.ts`;
- production must not configure `VITE_AMAP_SECURITY_CODE`;
- Vercel Production needs both names configured in the dashboard, but values must not be pasted into chat/Telegram;
- after saving variables, trigger/redeploy Production through Vercel;
- local AMap proxy testing should use `vercel dev`; plain `npm run dev` can still run the non-map UI but does not provide the Vercel Function rewrite.

- [ ] **Step 4: Repository-wide secret-name scan**

```bash
grep -R "VITE_AMAP_SECURITY_CODE" . \
  --exclude-dir=.git \
  --exclude-dir=node_modules \
  --exclude='2026-09-15-amap-secure-proxy-design.md' \
  --exclude='2026-09-15-amap-secure-proxy.md' || true
```

Expected: no production/config/documentation occurrence outside the historical spec/plan that explicitly describes its removal.

- [ ] **Step 5: Commit routing/docs configuration**

```bash
git add vercel.json .env.example docs/deployment.md
git commit -m "docs: configure server-only AMap security code"
```

---

### Task 5: Run the complete local/regression gates

**Files:**
- No new files unless a test failure reveals a defect in files already in scope.

**Interfaces:**
- Uses the repository's existing CI commands.

- [ ] **Step 1: Run all Node tests**

```bash
npm run test:node
```

Expected: previous 234 tests plus the new proxy tests, all passing.

- [ ] **Step 2: Run all UI tests**

```bash
npm run test:ui
```

Expected: previous 11 tests plus the expanded AMap loader coverage, all passing.

- [ ] **Step 3: Run production TypeScript/Vite build**

```bash
npm run build
```

Expected: `tsc -b && vite build` exits 0. Existing >500 kB chunk warning is non-blocking.

- [ ] **Step 4: Run Python tests**

```bash
PYTHONPATH=scripts python3 -m unittest scripts/test_unesco_pdf_pipeline.py
PYTHONPATH=scripts python3 -m unittest scripts/test_apply_reviewed_extent_patch.py
```

Expected: 6 + 3 = 9 tests pass.

- [ ] **Step 5: Run diff and credential safety checks**

```bash
git diff main...HEAD --check
git diff --name-only main...HEAD
grep -R "securityJsCode" src api .env.example docs/deployment.md || true
grep -R "VITE_AMAP_SECURITY_CODE" src api .env.example docs/deployment.md || true
```

Expected:
- no whitespace errors;
- changed paths limited to the approved implementation/spec/plan files;
- no production occurrence of `securityJsCode`;
- no production occurrence of `VITE_AMAP_SECURITY_CODE`.

- [ ] **Step 6: If any gate fails, stop and fix only the demonstrated defect**

Do not weaken tests, branch protection, secret boundaries, or TypeScript strictness to make the gate pass.

---

### Task 6: Open PR, verify Preview behavior without credentials, and merge only on GREEN

**Files:**
- No additional source changes expected.

**Interfaces:**
- Protected required check: `test-build` from GitHub Actions app id 15368.
- Vercel Git Integration automatically creates a Preview for the feature branch and Production after merge.

- [ ] **Step 1: Push the feature branch and open a PR**

PR title:

```text
feat: secure AMap production proxy
```

PR body must summarize:

```text
- replaces client-side AMap securityJsCode with same-origin serviceHost
- adds fixed-host Vercel Function proxy using server-only AMAP_SECURITY_CODE
- removes VITE_AMAP_SECURITY_CODE from production configuration
- preserves existing map/research behavior
- no real credentials included
```

- [ ] **Step 2: Wait for required `test-build` and inspect changed files**

The PR must show the expected implementation files only. Required `test-build` must be GREEN before merge.

- [ ] **Step 3: Verify Vercel Preview reaches Ready**

Because Preview credentials are intentionally absent, verify routing rather than live AMap tiles:

```bash
curl -i "https://<preview-host>/_AMapService/v3/place/text?keywords=test"
```

Expected:

```text
HTTP 503
{"error":"AMAP_SECURITY_CODE_MISSING","message":"AMap server security code is not configured."}
```

This proves the public rewrite reaches the Vercel Function and fails closed without leaking a secret.

Also verify the Preview root returns HTTP 2xx and the non-map UI remains usable.

- [ ] **Step 4: Squash merge through protected `main`**

Do not bypass branch protection. Delete the feature branch after successful merge.

- [ ] **Step 5: Verify automatic Production deployment**

Identify the Vercel Production deployment by the merge SHA. It must reach Ready without running `vercel --prod` manually.

Before credentials are configured, verify:

```bash
curl -i "https://china-cave-temples-map.vercel.app/_AMapService/v3/place/text?keywords=test"
```

Expected: the same safe 503 missing-secret response.

Production root must remain HTTP 2xx.

---

### Task 7: Credential activation and production AMap QA (human-secret step)

**Files:**
- No repository files.

**Interfaces:**
- Vercel Production environment variables:
  - `VITE_AMAP_KEY`
  - `AMAP_SECURITY_CODE`

- [ ] **Step 1: User enters both values directly in the Vercel dashboard**

Do not request either value through chat or Telegram. `AMAP_SECURITY_CODE` should be marked sensitive/server-only where the Vercel UI permits.

- [ ] **Step 2: Trigger a new Production deployment after saving variables**

Use Vercel dashboard redeploy or another secure Vercel action. Do not change repository content merely to trigger deployment.

- [ ] **Step 3: Verify the browser bundle does not contain the security code**

Use browser/devtools or downloaded JS bundle search with the known secret value locally; the value must not occur.

- [ ] **Step 4: Run production map QA**

Verify:

- base map loads;
- 52 verified markers still render;
- 2 verified polygons remain available;
- group-relation lines toggle correctly;
- selected-site centering works;
- PlaceSearch candidate lookup works and remains hidden by default;
- candidate cache remains browser-local;
- no `AMAP_SECURITY_CODE_MISSING`, `INVALID_USER_SCODE`, or equivalent AMap security error remains in console/network;
- production root and AMap proxy requests are HTTP-successful.

- [ ] **Step 5: Record the production QA result in project documentation/Notion only after verification**

Do not mark AMap production complete until the real credential smoke succeeds.
