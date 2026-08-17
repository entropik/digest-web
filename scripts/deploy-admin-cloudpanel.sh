#!/bin/sh

set -eu

base="${DIGEST_ADMIN_BASE:-/home/digest/apps/digest-admin}"
repository="${DIGEST_ADMIN_REPOSITORY:-https://github.com/entropik/digest-web.git}"
branch="${DIGEST_ADMIN_BRANCH:-main}"
health_attempts="${DIGEST_ADMIN_HEALTH_ATTEMPTS:-20}"
health_sleep="${DIGEST_ADMIN_HEALTH_SLEEP:-1}"

mkdir -p "$base/releases" "$base/shared"
exec 9>"$base/shared/deploy.lock"
flock -n 9 || exit 0

start_admin() {
  cd "$base/current"
  pm2 delete digest-admin >/dev/null 2>&1 || true
  if ! pm2 start ecosystem.config.cjs --update-env; then
    return 1
  fi
  if ! pm2 save; then
    return 1
  fi

  attempt=0
  until curl -fsS http://127.0.0.1:3210/health >/dev/null; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$health_attempts" ]; then
      echo "The admin service did not become healthy on port 3210." >&2
      return 1
    fi
    sleep "$health_sleep"
  done
}

restore_previous() {
  reason="$1"
  echo "Deployment failed during $reason; rolling back." >&2
  pm2 delete digest-admin >/dev/null 2>&1 || true

  if [ -n "${backup_path:-}" ]; then
    cd "$release/admin-service"
    if ! DATABASE_BACKUP_PATH="$backup_path" npm run --silent restore; then
      echo "Database restoration failed; the previous service will stay stopped." >&2
      return 1
    fi
  fi

  if [ -z "$previous_target" ]; then
    echo "No previous release is available to restart." >&2
    return 1
  fi
  ln -sfn "$previous_target" "$base/current.rollback"
  mv -Tf "$base/current.rollback" "$base/current"
  if ! start_admin; then
    echo "The previous release could not be restarted after rollback." >&2
    return 1
  fi
  echo "Rollback restored $previous_target." >&2
  return 0
}

test -s "$base/shared/.env"

remote_sha="$(
  git ls-remote "$repository" "refs/heads/$branch" |
    awk 'NR == 1 { print $1 }'
)"
test -n "$remote_sha"

previous_target="$(readlink "$base/current" 2>/dev/null || true)"
if [ "$previous_target" = "releases/$remote_sha/admin-service" ]; then
  if ! curl -fsS http://127.0.0.1:3210/health >/dev/null; then
    start_admin
  fi
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
  PLAYWRIGHT_BROWSERS_PATH="$base/shared/playwright" \
    npx playwright install chromium --only-shell
  npm run build
  npm prune --omit=dev
  rm -rf -- "$temporary/.git"
  cd "$base"
  mv -- "$temporary" "$release"
fi

test -s "$release/admin-service/dist/src/server.js"

cd "$release/admin-service"
pm2 delete digest-admin >/dev/null 2>&1 || true
backup_path=""
if ! backup_output="$(npm run --silent backup)"; then
  restore_previous backup || true
  exit 1
fi
printf '%s\n' "$backup_output"
backup_path="$(
  printf '%s\n' "$backup_output" |
    sed -n 's/^SQLite backup created: //p' |
    tail -n 1
)"
if [ -z "$backup_path" ]; then
  restore_previous backup || true
  exit 1
fi

if ! npm run --silent migrate:compiled; then
  restore_previous migration || true
  exit 1
fi

if ! ln -sfn "releases/$remote_sha/admin-service" "$base/current.new" ||
   ! mv -Tf "$base/current.new" "$base/current"; then
  restore_previous release-switch || true
  exit 1
fi

if ! start_admin; then
  restore_previous startup-or-health-check || true
  exit 1
fi

cd "$base/releases"
ls -1dt -- */ 2>/dev/null | tail -n +6 | xargs -r rm -rf --
