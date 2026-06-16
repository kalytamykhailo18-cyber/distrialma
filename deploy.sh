#!/bin/bash
# Zero-downtime deploy for Distrialma
# Builds in a temp copy, swaps .next folder, restarts PM2
# Total downtime: ~1 second (only pm2 restart)

set -e
cd /home/distrialma

echo "[deploy] Starting zero-downtime build..."

# Build in temp directory
BUILD_DIR="/tmp/distrialma-build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy only what's needed for build (not node_modules, not .next)
echo "[deploy] Copying source files..."
rsync -a --exclude='.next' --exclude='.next-old' --exclude='node_modules' --exclude='.git' --exclude='bot' . "$BUILD_DIR/"

# Symlink node_modules (don't copy — too slow)
ln -s /home/distrialma/node_modules "$BUILD_DIR/node_modules"

# Build in temp directory.
# Set a generous V8 heap — the default 1.7GB ceiling can OOM on this 2GB VPS
# when swap is already heavily used.
echo "[deploy] Building..."
cd "$BUILD_DIR"
NODE_OPTIONS="--max-old-space-size=4096" npm run build 2>&1

# Swap .next folders
echo "[deploy] Swapping .next folder..."
cd /home/distrialma
rm -rf .next-old
mv .next .next-old 2>/dev/null || true
mv "$BUILD_DIR/.next" .next

# Restart PM2 (instant, ~1 second)
echo "[deploy] Restarting PM2..."
pm2 restart distrialma

# Cleanup
rm -rf "$BUILD_DIR"
rm -rf .next-old

echo "[deploy] Done — zero downtime!"
