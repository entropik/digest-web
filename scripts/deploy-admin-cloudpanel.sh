#!/bin/sh

set -eu

base="/home/digest/apps/digest-admin"
repository="https://github.com/entropik/digest-web.git"
branch="main"

mkdir -p "$base/releases" "$base/shared"
test -s "$base/shared/.env"

remote_sha="$(
  git ls-remote "$repository" "refs/heads/$branch" |
    awk 'NR == 1 { print $1 }'
)"
test -n "$remote_sha"

current_target="$(readlink "$base/current" 2>/dev/null || true)"
if [ "$current_target" = "releases/$remote_sha/admin-service" ]; then
  exit 0
fi

release="$base/releases/$remote_sha"
temporary="$base/releases/.tmp-$remote_sha"

if [ ! -d "$release" ]; then
  rm -rf -- "$temporary"
  git clone --quiet --depth 1 --single-branch --branch "$branch" \
    "$repository" "$temporary"
  cd "$temporary/admin-service"
  ln -s "$base/shared/.env" .env
  npm ci
  npm run build
  npm run backup
  npm run migrate
  npm prune --omit=dev
  rm -rf -- "$temporary/.git"
  mv -- "$temporary" "$release"
fi

test -s "$release/admin-service/dist/src/server.js"

ln -sfn "releases/$remote_sha/admin-service" "$base/current.new"
mv -Tf "$base/current.new" "$base/current"

cd "$base/current"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

cd "$base/releases"
ls -1dt -- */ 2>/dev/null | tail -n +6 | xargs -r rm -rf --
