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
health_url="https://api.hindustan-hardware.in/api/v1/health/ready"
for attempt in $(seq 1 20); do
  if curl --fail --silent --show-error --max-time 10 "$health_url"; then
    echo
    pm2 save
    exit 0
  fi
  echo "Health check attempt $attempt failed; retrying in 3 seconds..."
  sleep 3
done

echo "Backend did not become ready at $health_url. Recent PM2 logs:"
pm2 logs hindustan-hardware-api --lines 50 --nostream || true
exit 1
