# Deployment

## Recommended path: GitHub → Vercel

This repository is a Vite/React research application. The main UI is built as static assets, and the public AMap integration additionally uses one small Vercel Function (`api/amap-proxy.ts`) so the AMap security code can stay server-side.

Production changes should follow the protected repository flow documented in `docs/production-governance.md`: feature branch → pull request → required `test-build` check → merge to `main` → Vercel Git Integration automatic Production deployment.

## AMap production environment variables

Configure these in the deployment platform, never in the repository:

```text
VITE_AMAP_KEY=<your Web JS API key>
AMAP_SECURITY_CODE=<your server-side security code>
```

The two names have different exposure rules:

- `VITE_AMAP_KEY` is intentionally client-visible. Vite embeds `VITE_*` values in the browser bundle, and the AMap JS API script URL uses this key.
- `AMAP_SECURITY_CODE` is server-only. `api/amap-proxy.ts` reads it at request time and appends it to fixed AMap upstream requests as `jscode`.

Do **not** configure `VITE_AMAP_SECURITY_CODE` for public production. A `VITE_*` security-code variable would be exposed to browser JavaScript.

The browser config points AMap service traffic to the same-origin path:

```text
/_AMapService/*
```

`vercel.json` rewrites that path to the Vercel Function, which forwards only to fixed AMap upstream hosts. A missing server security code fails closed with HTTP 503 instead of falling back to a client-visible value.

Do not paste real AMap credentials into chat, Telegram, source files, GitHub Actions output, or issue/PR comments. Enter them directly in the Vercel dashboard.

## Vercel

1. Keep the project connected to the GitHub repository through Vercel Git Integration.
2. Framework preset: Vite.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Add `VITE_AMAP_KEY` to the Production environment.
6. Add `AMAP_SECURITY_CODE` to the Production environment and mark it sensitive/server-only where the Vercel UI permits.
7. After changing environment variables, trigger a new Production deployment from Vercel so the client-visible key is included in the new Vite build.
8. Verify the production root and `/_AMapService/*` route before considering AMap production activated.

The included `vercel.json` supplies the Vite build/output defaults and the AMap proxy rewrite.

## Local development

For the complete AMap path, including the Vercel Function and rewrite, use:

```bash
vercel dev
```

Provide local environment variables through a local environment file that is excluded from Git. Do not commit real values.

Plain Vite development still works for the non-map research UI:

```bash
npm run dev
```

However, `npm run dev` alone does not provide the Vercel `/_AMapService/*` rewrite/function, so it is not a complete local test of the production AMap security path.

## Self-hosted deployment

The static research UI can still be produced with:

```bash
npm ci
npm test
npm run build
```

and the `dist/` directory can be served by Nginx or another static web server.

Example static Nginx block:

```nginx
server {
    listen 80;
    server_name caves.example.com;

    root /var/www/china-cave-temples-map/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

A self-hosted deployment that needs the live AMap integration must also provide an equivalent secure `/_AMapService/*` server-side proxy. Serving only `dist/` is sufficient for the non-map UI but not for the hardened AMap security flow.

## Research-session persistence

Current georeference sessions are stored in browser localStorage and/or exported JSON. A deployment does not provide cross-device synchronization. Export important sessions before changing browsers/devices.
