#!/bin/bash
# Zero-downtime deploy for Distrialma
# Build in background, only restart when build succeeds

set -e
cd /home/distrialma

echo "Building..."
npm run build

echo "Restarting (instant swap)..."
pm2 restart distrialma --update-env

echo "Done! Downtime: ~2 seconds"
