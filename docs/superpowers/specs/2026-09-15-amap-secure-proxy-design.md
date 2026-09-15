# AMap Secure Proxy Design

**Date:** 2026-09-15

**Status:** Approved architecture, implementation pending

**Branch:** `feat/amap-secure-proxy`

## Goal

Move the AMap security code out of the Vite client bundle and into a Vercel Function while preserving the existing map UI, AMap JS API loading flow, verified markers, research extents, group relations, candidate POI lookup, and browser-local research sessions.

The public browser may receive the Web JS API key (`VITE_AMAP_KEY`), but the AMap security code must remain server-side as `AMAP_SECURITY_CODE` and must never be emitted in client JavaScript, response bodies, logs, repository files, Telegram messages, or GitHub Actions output.

## Current state

The current client reads both:

- `VITE_AMAP_KEY`
- `VITE_AMAP_SECURITY_CODE`

`src/map/amapLoader.ts` assigns the second value to `window._AMapSecurityConfig.securityJsCode`. Because Vite exposes `VITE_*` values to browser code, this is acceptable for development but not the desired public-production architecture.

The application is otherwise a static Vite/React site deployed on Vercel. A small Vercel Function can be added under `/api` without introducing a separate backend service or database.

## Chosen architecture

Use a same-origin Vercel Function as the AMap security proxy.

```text
Browser
  |
  |-- loads AMap JS API with VITE_AMAP_KEY
  |
  `-- AMap service requests
       -> /_AMapService/*
            -> Vercel rewrite
                 -> /api/amap-proxy?path=...
                      -> append server-only AMAP_SECURITY_CODE as jscode
                      -> fixed AMap upstream host
```

The browser config becomes:

```ts
window._AMapSecurityConfig = {
  serviceHost: `${window.location.origin}/_AMapService`,
}
```

The browser no longer receives or reads `VITE_AMAP_SECURITY_CODE`.

## Environment variables

### Client-visible

```text
VITE_AMAP_KEY
```

This is the AMap Web JS API key used in the script URL.

### Server-only

```text
AMAP_SECURITY_CODE
```

This value is read only by the Vercel Function. It must not use the `VITE_` prefix.

### Removed

```text
VITE_AMAP_SECURITY_CODE
```

This variable is removed from `.env.example`, frontend source, deployment documentation, and production configuration guidance.

## Components and responsibilities

### `src/map/amapLoader.ts`

Change the public loader interface from:

```ts
loadAmap(key: string, securityCode: string)
```

to:

```ts
loadAmap(key: string)
```

Before creating the AMap `<script>` element, set:

```ts
window._AMapSecurityConfig = {
  serviceHost: `${window.location.origin}/_AMapService`,
}
```

The loader must continue to:

- reject missing keys with `AMAP_KEY_MISSING`;
- reject non-browser execution with `AMAP_BROWSER_ONLY`;
- reuse an already-loaded `window.AMap`;
- deduplicate concurrent loads with the existing module-level promise;
- load `AMap.PlaceSearch` together with the JS API;
- report script/global load failures with the existing error semantics.

### `src/map/AmapMap.tsx`

Remove all reads of `import.meta.env.VITE_AMAP_SECURITY_CODE`.

Keep:

```ts
const key = import.meta.env.VITE_AMAP_KEY ?? ''
```

Call:

```ts
loadAmap(key)
```

The existing `missing-key`, `loading`, `ready`, and `error` states remain unchanged.

The missing-key copy must mention only `VITE_AMAP_KEY` for the client and explain that the server-side security code is configured in deployment infrastructure.

No map rendering, candidate scoring, cache, marker, extent, relation-line, or selection behavior changes are allowed in this phase.

### `api/amap-proxy.ts`

Create one Vercel Function using the Web Standard handler form:

```ts
export default {
  async fetch(request: Request) {
    // ...
  },
}
```

The function has one responsibility: forward an allowed AMap service request to a fixed AMap upstream after appending the server-side `jscode`.

#### Accepted route input

The Vercel rewrite supplies the requested suffix as a query parameter named `path`.

Examples:

```text
/_AMapService/v3/place/text?keywords=云冈石窟
```

becomes internally:

```text
/api/amap-proxy?path=v3/place/text&keywords=云冈石窟
```

The proxy must reject an empty path.

#### Allowed upstreams

Default upstream:

```text
https://restapi.amap.com
```

Special map-style upstream for paths beginning with:

```text
v4/map/styles
```

uses:

```text
https://webapi.amap.com
```

No request parameter may choose or override the upstream host.

#### Method handling

Support only:

```text
GET
POST
```

Other methods return HTTP `405`.

For `POST`, forward the request body and its `content-type` header. Do not forward cookies, authorization headers, Vercel headers, client IP headers, or arbitrary hop-by-hop headers.

#### Query handling

Copy all query parameters except the internal `path` parameter to the upstream URL, then set/replace:

```text
jscode=<AMAP_SECURITY_CODE>
```

A client-supplied `jscode` must never win over the server-side value.

#### Response handling

Return the upstream body and upstream HTTP status.

Forward only response headers required for payload interpretation:

- `content-type`
- `content-encoding` only when the runtime returns the encoded body unchanged

Do not forward upstream cookies or security-sensitive headers.

#### Failure behavior

Return JSON errors without including secret values:

- missing `AMAP_SECURITY_CODE` -> `503` with code `AMAP_SECURITY_CODE_MISSING`;
- missing/invalid path -> `400` with code `AMAP_PROXY_PATH_INVALID`;
- unsupported method -> `405` with code `AMAP_PROXY_METHOD_NOT_ALLOWED`;
- upstream fetch failure -> `502` with code `AMAP_UPSTREAM_FAILED`.

The error response may include a short non-secret message, but never a URL containing `jscode`.

### `vercel.json`

Keep the existing Vite build/output settings and add a rewrite:

```json
{
  "source": "/_AMapService/:path*",
  "destination": "/api/amap-proxy?path=:path*"
}
```

The public path remains stable across:

- Vercel Preview URLs;
- `https://china-cave-temples-map.vercel.app`;
- a later custom domain such as `https://caves.conanxin.com`.

### `.env.example`

Use:

```text
VITE_AMAP_KEY=AMAP_KEY
AMAP_SECURITY_CODE=AMAP_SECURITY_CODE
```

The file documents names only; it must never contain real credentials.

### `docs/deployment.md`

Update deployment guidance so production configuration uses:

```text
VITE_AMAP_KEY
AMAP_SECURITY_CODE
```

Document that the first value is client-visible and the second is server-only.

Remove any recommendation to configure `VITE_AMAP_SECURITY_CODE` in a public production build.

## Security invariants

The implementation is acceptable only if all of these remain true:

1. `AMAP_SECURITY_CODE` is never referenced through `import.meta.env`.
2. No source file contains a real AMap credential.
3. No browser bundle can read the security code.
4. The proxy upstream hostname is chosen by source code, never user input.
5. The proxy replaces any client-supplied `jscode` with the server value.
6. The proxy does not log the upstream URL after `jscode` has been attached.
7. The proxy does not forward arbitrary inbound request headers.
8. Missing server configuration fails closed with `503` rather than falling back to client-side security code.
9. Existing research data, georeferencing logic, canonical-review semantics, and browser-local sessions remain untouched.

## Testing strategy

Implementation uses test-first changes.

### Client loader tests

Extend `src/map/amapLoader.test.ts` to verify:

- missing key still rejects with `AMAP_KEY_MISSING`;
- successful browser setup writes `serviceHost` under the current origin;
- successful setup does not write a `securityJsCode` property;
- generated AMap script URL still includes the Web JS API key and `AMap.PlaceSearch`.

The test must restore global/window mutations after each case.

### Proxy unit tests

Create a focused Node test file for proxy URL construction and validation. The proxy implementation should expose pure helpers for testability, for example:

```ts
buildAmapUpstreamUrl(requestUrl: string, securityCode: string): URL
isAllowedAmapMethod(method: string): boolean
```

Tests must cover:

- default `restapi.amap.com` routing;
- `v4/map/styles` routing to `webapi.amap.com`;
- query preservation;
- internal `path` removal;
- server-side `jscode` overwrite;
- invalid/missing path rejection;
- no arbitrary-host input path can change the upstream origin.

A handler-level test must cover missing `AMAP_SECURITY_CODE` returning `503` without the secret in the body.

### Regression gates

The PR must pass the protected required check `test-build`, which currently includes:

- Node tests;
- Vitest UI tests;
- `tsc -b && vite build`;
- Python tests.

## Deployment flow

All implementation work occurs on `feat/amap-secure-proxy`.

Production flow remains:

```text
feature branch
-> Pull Request
-> required `test-build` GREEN
-> squash merge to protected `main`
-> Vercel Git Integration automatic Production deployment
```

No direct push to `main` and no `vercel --prod` are used for the code change.

## Credential activation flow

The code PR can merge before real AMap credentials are configured. Without credentials, the existing non-map research UI must continue to work and the map must remain in a clear configuration-error state.

After code deployment:

1. Configure `VITE_AMAP_KEY` in Vercel for Production.
2. Configure server-only `AMAP_SECURITY_CODE` in Vercel for Production.
3. Do not transmit either value through Telegram or chat.
4. Trigger a new Production deployment from Vercel after environment variables are saved.
5. Verify that the browser bundle contains no security code.
6. Verify AMap base map, PlaceSearch, verified markers, extents, relation lines, selection, and candidate caching in production.

Preview credentials are not required for the first implementation PR. If later added, use a separately authorized AMap key/security-code pair appropriate to Preview domains.

## Acceptance criteria

The phase is complete only when:

- frontend source no longer reads `VITE_AMAP_SECURITY_CODE`;
- `.env.example` and deployment docs use `AMAP_SECURITY_CODE` for the server-side value;
- `/_AMapService/*` is handled by a Vercel Function proxy with fixed AMap upstreams;
- the server value overwrites any inbound `jscode`;
- client loader uses `serviceHost` and never `securityJsCode`;
- no production application/data behavior outside AMap security transport changes;
- all repository CI gates pass on the PR;
- merged `main` is automatically deployed by Vercel Git Integration;
- before credentials are activated, non-map UI remains usable;
- after credentials are activated, production AMap functionality passes smoke QA.

## Rollback

If the proxy implementation causes a production regression before credentials are activated, revert the AMap security-proxy PR through a new protected PR.

Do not restore a real `VITE_AMAP_SECURITY_CODE` in the repository or client bundle as a rollback mechanism.
