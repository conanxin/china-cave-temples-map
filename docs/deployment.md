# Deployment

## Recommended path: GitHub → Vercel

This repository is a Vite static React application. No application backend is required for the current research UI.

### Required environment variables

Set these in the deployment platform, never in the repository:

```text
VITE_AMAP_KEY=<your Web JS API key>
VITE_AMAP_SECURITY_CODE=<your security code>
```

For a quick private/preview deployment this matches the current application implementation. For a hardened public deployment, move the AMap security code behind a server-side proxy before treating it as a secret.

### Vercel

1. Import the GitHub repository.
2. Framework preset: Vite.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Add the two AMap environment variables.
6. Deploy.

The included `vercel.json` supplies the build/output defaults.

## Self-hosted static deployment

After a successful build:

```bash
npm install
npm test
npm run build
```

Publish the `dist/` directory with Nginx or another static web server.

Example Nginx block:

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

## Research-session persistence

Current georeference sessions are stored in browser localStorage and/or exported JSON. A deployment does not provide cross-device synchronization. Export important sessions before changing browsers/devices.
