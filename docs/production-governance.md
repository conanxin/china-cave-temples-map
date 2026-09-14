# Production governance

`main` is the production branch for the China Cave Temples Map.

## Required path to production

1. Work on a non-`main` branch.
2. Open a pull request into `main`.
3. The GitHub Actions check `test-build` must pass.
4. The pull request must be up to date with `main`.
5. Merge the pull request.
6. Vercel Git Integration automatically deploys the resulting `main` revision to Production.

Direct pushes and force-pushes to `main` are intentionally blocked.

The CI gate includes Node tests, UI tests, the TypeScript/Vite production build, and Python tests.

Secrets and AMap credentials must not be committed to the repository or sent through Telegram.
