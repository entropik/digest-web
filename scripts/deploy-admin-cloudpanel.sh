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

stop_admin() {
  if pm2 delete digest-admin >/dev/null 2>&1; then
    pm2 save --force
    return
  fi
  if ! pid="$(pm2 pid digest-admin 2>/dev/null)"; then
    return 1
  fi
  case "$pid" in
    ""|0) pm2 save --force ;;
    *) return 1 ;;
  esac
}

start_admin() {
  cd "$base/current"
  if ! stop_admin; then
    return 1
  fi
  if ! pm2 start ecosystem.config.cjs --update-env; then
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
  pm2 save
}

restore_previous() {
  reason="$1"
  echo "Deployment failed during $reason; rolling back." >&2
  if ! stop_admin; then
    echo "The active admin process could not be stopped; rollback is unsafe." >&2
    return 1
  fi

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
  if ! ln -sfn "$previous_target" "$base/current.rollback" ||
     ! mv -Tf "$base/current.rollback" "$base/current"; then
    echo "The previous release symlink could not be restored; the service will stay stopped." >&2
    return 1
  fi
  if ! start_admin; then
    echo "The previous release could not be restarted after rollback." >&2
    return 1
  fi
  echo "Rollback restored $previous_target." >&2
  return 0
}

test -s "$base/shared/.env"

remote_sha="$(
  git -c protocol.version=1 ls-remote "$repository" "refs/heads/$branch" |
    awk 'NR == 1 { print $1 }'
)"
test -n "$remote_sha"

source_repository="$base/shared/source.git"
if [ ! -d "$source_repository" ]; then
  git init --bare "$source_repository" >/dev/null
fi
git --git-dir="$source_repository" fetch --quiet --filter=blob:none "$repository" "+refs/heads/$branch:refs/remotes/origin/$branch"
remote_admin_tree="$(git --git-dir="$source_repository" rev-parse "$remote_sha:admin-service")"
observed_tree="$(cat "$base/shared/observed-admin-tree" 2>/dev/null || true)"
if [ -n "$observed_tree" ] && [ "$observed_tree" = "$remote_admin_tree" ]; then
  printf '%s\n' "$remote_sha" >"$base/shared/observed-main-sha"
  if ! curl -fsS http://127.0.0.1:3210/health >/dev/null; then
    start_admin
  fi
  exit 0
fi

previous_target="$(readlink "$base/current" 2>/dev/null || true)"
if [ "$previous_target" = "releases/$remote_sha/admin-service" ]; then
  printf '%s\n' "$remote_admin_tree" >"$base/shared/observed-admin-tree"
  printf '%s\n' "$remote_sha" >"$base/shared/observed-main-sha"
  if ! curl -fsS http://127.0.0.1:3210/health >/dev/null; then
    start_admin
  fi
  exit 0
fi

release="$base/releases/$remote_sha"
temporary="$base/releases/.tmp-$remote_sha"

if [ ! -d "$release" ]; then
  rm -rf -- "$temporary"
  mkdir -p "$temporary"
  curl --fail --location --silent --show-error --retry 3 \
    "${repository%.git}/archive/$remote_sha.tar.gz" |
    tar -xz --strip-components=1 -C "$temporary"
  cd "$temporary/admin-service"
  ln -s "$base/shared/.env" .env
  npm ci
  PLAYWRIGHT_BROWSERS_PATH="$base/shared/playwright" \
    npx playwright install chromium --only-shell
  npm run build
  npm prune --omit=dev
  cd "$base"
  mv -- "$temporary" "$release"
fi

test -s "$release/admin-service/dist/src/server.js"

cd "$release/admin-service"
if ! stop_admin; then
  echo "The active admin process could not be stopped; deployment aborted." >&2
  exit 1
fi
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

printf '%s\n' "$remote_admin_tree" >"$base/shared/observed-admin-tree"
printf '%s\n' "$remote_sha" >"$base/shared/observed-main-sha"

cd "$base/releases"
ls -1dt -- */ 2>/dev/null | tail -n +6 | xargs -r rm -rf --
