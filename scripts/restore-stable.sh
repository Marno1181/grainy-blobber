#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SNAPSHOT_DIR="$ROOT_DIR/.backups/stable-pre-canvas-overhaul"

if [[ ! -d "$SNAPSHOT_DIR/src" ]]; then
  echo "Stable snapshot not found at: $SNAPSHOT_DIR"
  exit 1
fi

echo "Restoring stable snapshot from $SNAPSHOT_DIR ..."
rm -rf "$ROOT_DIR/src"
cp -R "$SNAPSHOT_DIR/src" "$ROOT_DIR/src"
cp "$SNAPSHOT_DIR/README.md" "$ROOT_DIR/README.md"
cp "$SNAPSHOT_DIR/package.json" "$ROOT_DIR/package.json"
cp "$SNAPSHOT_DIR/tsconfig.json" "$ROOT_DIR/tsconfig.json"

echo "Restore complete."
echo "Run: npm install && npm run dev"
