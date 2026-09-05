#!/bin/sh
set -eu

# Script de déploiement direct et autonome sur le VPS (CloudPanel)
# Élimine tout passage par GitHub Actions pour la mise en ligne du site.

BASE="${DIGEST_SITE_BASE:-/home/digest/htdocs/digest.ooblik.com}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
HUGO_BIN="${HUGO_BIN:-$(command -v hugo 2>/dev/null || echo "$HOME/bin/hugo")}"
HUGO_VERSION="0.165.0"

# 1. Vérifier ou installer Hugo Extended localement si absent
if [ ! -x "$HUGO_BIN" ]; then
  echo "Hugo introuvable sur le VPS. Installation de Hugo Extended v${HUGO_VERSION} dans $HOME/bin..."
  mkdir -p "$HOME/bin"
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) HUGO_ARCH="linux-amd64" ;;
    aarch64|arm64) HUGO_ARCH="linux-arm64" ;;
    *) echo "Architecture $ARCH non supportée automatiquement pour Hugo"; exit 1 ;;
  esac
  TARBALL="hugo_extended_${HUGO_VERSION}_${HUGO_ARCH}.tar.gz"
  URL="https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/${TARBALL}"
  curl -sSL "$URL" | tar -xz -C "$HOME/bin" hugo
  chmod +x "$HOME/bin/hugo"
  HUGO_BIN="$HOME/bin/hugo"
  echo "Hugo installé avec succès : $("$HUGO_BIN" version)"
fi

RELEASE_ID="$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="$BASE/releases/$RELEASE_ID"

echo "Compilation Hugo vers $RELEASE_DIR..."
mkdir -p "$BASE/releases"
HUGO_BINARY="$HUGO_BIN" node scripts/build-site.mjs --destination "$RELEASE_DIR"

for required_page in \
  index.html \
  en/index.html \
  en/flux/index.html \
  en/tags/index.html \
  en/archives/index.html \
  en/a-propos/index.html \
  en/confidentialite/index.html
do
  test -s "$RELEASE_DIR/$required_page"
done

# Bascule atomique du symlink CloudPanel
ln -sfn "releases/$RELEASE_ID" "$BASE/current.new"
mv -Tf "$BASE/current.new" "$BASE/current"

echo "Site OOBLIK Digest mis en ligne avec succès ! (Release $RELEASE_ID)"

# Nettoyage des anciennes releases (conserver les 5 dernières)
cd "$BASE/releases"
ls -1dt -- */ 2>/dev/null | tail -n +6 | xargs -r rm -rf --
