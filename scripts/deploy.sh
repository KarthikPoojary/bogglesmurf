#!/usr/bin/env bash
# Manual deploy fallback. CI handles auto-deploy on push to main.
set -e
echo "Building for production..."
pnpm build
echo "Deploying to Cloudflare Pages..."
echo "Note: ensure wrangler is installed and authenticated (wrangler login)"
npx wrangler pages deploy dist --project-name bogglesmurf
