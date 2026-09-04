#!/bin/sh

set -eu

repository_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
temporary="$(mktemp -d)"
trap 'rm -rf -- "$temporary"' EXIT
TEST_REAL_LN="$(command -v ln)"
TEST_REAL_MV="$(command -v mv)"
TEST_REAL_READLINK="$(command -v readlink)"
export TEST_REAL_LN TEST_REAL_MV TEST_REAL_READLINK

create_fake_commands() {
  fake_bin="$1"
  mkdir -p "$fake_bin"

  cat >"$fake_bin/git" <<'EOF'
#!/bin/sh
if [ "$1" = "-c" ]; then
  shift 2
fi
if [ "$1" = "ls-remote" ]; then
  printf '%s\trefs/heads/main\n' newsha
  exit 0
fi
case "$1" in
  init)
    mkdir -p "${3:-${2:-}}"
    exit 0
    ;;
  --git-dir=*)
    case "$2" in
      fetch) exit 0 ;;
      rev-parse) printf 'admin-tree-new\n'; exit 0 ;;
    esac
    ;;
esac
exit 1
EOF

  cat >"$fake_bin/npm" <<'EOF'
#!/bin/sh
printf 'npm %s\n' "$*" >>"$TEST_LOG"
case "$*" in
  *backup*)
    cp "$TEST_DATABASE" "$TEST_BACKUP"
    printf 'SQLite backup created: %s\n' "$TEST_BACKUP"
    ;;
  *migrate*)
    printf 'migrated state\n' >"$TEST_DATABASE"
    [ "$TEST_SCENARIO" != "migration" ]
    ;;
  *restore*)
    cp "$DATABASE_BACKUP_PATH" "$TEST_DATABASE"
    printf 'database restored\n' >>"$TEST_LOG"
    ;;
esac
EOF

  cat >"$fake_bin/npx" <<'EOF'
#!/bin/sh
exit 0
EOF

  cat >"$fake_bin/pm2" <<'EOF'
#!/bin/sh
printf 'pm2 %s [%s]\n' "$*" "$(readlink "$TEST_BASE/current" 2>/dev/null || true)" >>"$TEST_LOG"
if [ "$1" = "delete" ] && [ "$TEST_SCENARIO" = "stop" ]; then
  exit 1
fi
if [ "$1" = "pid" ]; then
  if [ "$TEST_SCENARIO" = "stop" ]; then
    printf '4242\n'
  else
    printf '0\n'
  fi
  exit 0
fi
if [ "$1" = "start" ] &&
   [ "$TEST_SCENARIO" = "startup" ] &&
   [ "$(readlink "$TEST_BASE/current")" = "releases/newsha/admin-service" ]; then
  exit 1
fi
exit 0
EOF

  cat >"$fake_bin/curl" <<'EOF'
#!/bin/sh
case "$*" in
  *"/archive/newsha.tar.gz"*)
    archive_root="$TEST_BASE/archive/digest-web-newsha"
    mkdir -p "$archive_root/admin-service/dist/src"
    printf 'server\n' >"$archive_root/admin-service/dist/src/server.js"
    printf 'module.exports = {}\n' >"$archive_root/admin-service/ecosystem.config.cjs"
    printf '{}\n' >"$archive_root/admin-service/package.json"
    tar -czf - -C "$TEST_BASE/archive" digest-web-newsha
    exit 0
    ;;
esac
if { [ "$TEST_SCENARIO" = "health" ] ||
     [ "$TEST_SCENARIO" = "rollback-switch" ]; } &&
   [ "$(readlink "$TEST_BASE/current")" = "releases/newsha/admin-service" ]; then
  exit 1
fi
exit 0
EOF

  cat >"$fake_bin/sleep" <<'EOF'
#!/bin/sh
exit 0
EOF

  cat >"$fake_bin/flock" <<'EOF'
#!/bin/sh
exit 0
EOF


  cat >"$fake_bin/readlink" <<'EOF'
#!/bin/sh
if [ "$1" = "$TEST_BASE/current" ]; then
  cat "$TEST_CURRENT_TARGET_FILE"
else
  "$TEST_REAL_READLINK" "$@"
fi
EOF

  cat >"$fake_bin/ln" <<'EOF'
#!/bin/sh
position=$(($# - 1))
eval "target=\${$position}"
eval "destination=\${$#}"
if [ "$destination" = "$TEST_BASE/current.new" ] ||
   [ "$destination" = "$TEST_BASE/current.rollback" ]; then
  if [ "$TEST_SCENARIO" = "switch" ] &&
     [ "$target" = "releases/newsha/admin-service" ]; then
    exit 1
  fi
  if [ "$TEST_SCENARIO" = "rollback-switch" ] &&
     [ "$target" = "releases/oldsha/admin-service" ]; then
    exit 1
  fi
  printf '%s\n' "$target" >"$TEST_PENDING_TARGET"
else
  "$TEST_REAL_LN" "$@"
fi
EOF

  cat >"$fake_bin/mv" <<'EOF'
#!/bin/sh
eval "destination=\${$#}"
if [ "$destination" = "$TEST_BASE/current" ]; then
  cp "$TEST_PENDING_TARGET" "$TEST_CURRENT_TARGET_FILE"
else
  "$TEST_REAL_MV" "$@"
fi
EOF

  chmod +x "$fake_bin"/*
}

run_failure_case() {
  scenario="$1"
  case_root="$temporary/$scenario"
  base="$case_root/base"
  fake_bin="$case_root/bin"
  log="$case_root/commands.log"
  database="$base/shared/auth.sqlite"
  backup="$base/shared/auth.sqlite.deploy.backup"
  mkdir -p "$base/releases/oldsha/admin-service/dist/src" "$base/shared" "$base/current"
  printf 'old server\n' >"$base/releases/oldsha/admin-service/dist/src/server.js"
  printf 'module.exports = {}\n' >"$base/releases/oldsha/admin-service/ecosystem.config.cjs"
  printf 'old database state\n' >"$database"
  printf 'production environment\n' >"$base/shared/.env"
  current_target_file="$case_root/current-target"
  pending_target="$case_root/pending-target"
  printf 'releases/oldsha/admin-service\n' >"$current_target_file"
  : >"$log"
  create_fake_commands "$fake_bin"

  if PATH="$fake_bin:$PATH" \
    TEST_SCENARIO="$scenario" \
    TEST_BASE="$base" \
    TEST_LOG="$log" \
    TEST_DATABASE="$database" \
    TEST_BACKUP="$backup" \
    TEST_CURRENT_TARGET_FILE="$current_target_file" \
    TEST_PENDING_TARGET="$pending_target" \
    DIGEST_ADMIN_BASE="$base" \
    DIGEST_ADMIN_REPOSITORY="fake://digest-web" \
    DIGEST_ADMIN_HEALTH_ATTEMPTS=2 \
    DIGEST_ADMIN_HEALTH_SLEEP=0 \
    sh "$repository_root/scripts/deploy-admin-cloudpanel.sh"; then
    echo "$scenario deployment unexpectedly succeeded" >&2
    return 1
  fi

  if [ "$scenario" = "stop" ]; then
    test "$(cat "$current_target_file")" = "releases/oldsha/admin-service"
    test "$(cat "$database")" = "old database state"
    ! grep -q 'npm run --silent backup' "$log"
    ! grep -q 'pm2 start' "$log"
    return
  fi

  test "$(cat "$database")" = "old database state"
  grep -q "database restored" "$log"
  if [ "$scenario" = "rollback-switch" ]; then
    test "$(cat "$current_target_file")" = "releases/newsha/admin-service"
    test "$(grep -c 'pm2 start ecosystem.config.cjs --update-env' "$log")" -eq 1
  else
    test "$(cat "$current_target_file")" = "releases/oldsha/admin-service"
    grep -q "pm2 start ecosystem.config.cjs --update-env \[releases/oldsha/admin-service\]" "$log"
  fi
  delete_line="$(grep -n 'pm2 delete' "$log" | head -n 1 | cut -d: -f1)"
  backup_line="$(grep -n 'npm run --silent backup' "$log" | head -n 1 | cut -d: -f1)"
  test "$delete_line" -lt "$backup_line"
  grep -q 'pm2 save --force' "$log"
}

run_unchanged_tree_case() {
  case_root="$temporary/unchanged-tree"
  base="$case_root/base"
  fake_bin="$case_root/bin"
  log="$case_root/commands.log"
  mkdir -p "$base/releases/oldsha/admin-service/dist/src" "$base/shared"
  printf 'production environment\n' >"$base/shared/.env"
  printf 'admin-tree-new\n' >"$base/shared/observed-admin-tree"
  current_target_file="$case_root/current-target"
  pending_target="$case_root/pending-target"
  printf 'releases/oldsha/admin-service\n' >"$current_target_file"
  : >"$log"
  create_fake_commands "$fake_bin"
  PATH="$fake_bin:$PATH" TEST_SCENARIO="unchanged-tree" TEST_BASE="$base" TEST_LOG="$log" \
    TEST_DATABASE="$base/shared/auth.sqlite" TEST_BACKUP="$base/shared/backup" \
    TEST_CURRENT_TARGET_FILE="$current_target_file" TEST_PENDING_TARGET="$pending_target" \
    DIGEST_ADMIN_BASE="$base" DIGEST_ADMIN_REPOSITORY="fake://digest-web" \
    sh "$repository_root/scripts/deploy-admin-cloudpanel.sh"
  test "$(cat "$base/shared/observed-main-sha")" = "newsha"
  ! grep -q '^npm ' "$log"
  ! grep -q '^pm2 ' "$log"
}

run_failure_case migration
run_failure_case startup
run_failure_case health
run_failure_case switch
run_failure_case rollback-switch
run_failure_case stop
run_unchanged_tree_case
echo "Deployment rollback scenarios passed."
