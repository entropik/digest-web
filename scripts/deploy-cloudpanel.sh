#!/bin/sh

set -eu

base="/home/digest/htdocs/digest.ooblik.com"
repository="https://github.com/entropik/digest-web.git"
branch="production"

mkdir -p "$base/releases"

remote_sha="$(
  git -c protocol.version=1 ls-remote "$repository" "refs/heads/$branch" |
    awk 'NR == 1 { print $1 }'
)"

test -n "$remote_sha"

current_target="$(readlink "$base/current" 2>/dev/null || true)"
if [ "$current_target" = "releases/$remote_sha" ]; then
  exit 0
fi

release="$base/releases/$remote_sha"
temporary="$base/releases/.tmp-$remote_sha"

if [ ! -d "$release" ]; then
  rm -rf -- "$temporary"
  git -c protocol.version=1 clone --quiet --depth 1 --single-branch --branch "$branch" \
    "$repository" "$temporary"
  rm -rf -- "$temporary/.git"
  mv -- "$temporary" "$release"
fi

test -s "$release/index.html"

if [ -d "$base/current" ] && [ ! -L "$base/current" ]; then
  rmdir "$base/current"
fi

ln -sfn "releases/$remote_sha" "$base/current.new"
mv -Tf "$base/current.new" "$base/current"

cd "$base/releases"
ls -1dt -- */ 2>/dev/null | tail -n +6 | xargs -r rm -rf --
