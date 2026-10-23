#!/usr/bin/env bash
set -euo pipefail

release_dir="/opt/hindustan-hardware/backend/current"
artifact_dir="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}/backend-release"

test -f "$artifact_dir/dist/server.js"
test -f "$artifact_dir/package-lock.json"
test -f "$release_dir/.env" || {
  echo "Production .env is missing from $release_dir; refusing to deploy."
  exit 1
}

cp -a "$artifact_dir/dist" "$release_dir/dist.new"
rm -rf "$release_dir/dist.previous"
if [ -d "$release_dir/dist" ]; then
  mv "$release_dir/dist" "$release_dir/dist.previous"
fi
mv "$release_dir/dist.new" "$release_dir/dist"
cp "$artifact_dir/package.json" "$artifact_dir/package-lock.json" "$release_dir/"
cd "$release_dir"
npm ci --omit=dev --no-audit --no-fund
NODE_ENV=production pm2 restart hindustan-hardware-api --update-env
curl --fail --silent --show-error --max-time 10 \
  https://api.hindustan-hardware.in/health
pm2 save
