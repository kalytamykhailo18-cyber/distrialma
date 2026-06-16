#!/bin/bash
# Sync fichador MDB from Google Drive and import into PostgreSQL
# Called by cron daily at 7am Argentina

set -e

DRIVE_FOLDER="https://drive.google.com/drive/folders/1Om0-kOGnCMB4Lr0KzR9OdZPRqk0864KD"
DOWNLOAD_DIR="/tmp/fichador-sync"
MDB_PATH="/tmp/fichador-base.mdb"
LOG="/tmp/fichador-sync.log"

echo "$(date): Starting fichador sync" >> "$LOG"

# Download from Drive
rm -rf "$DOWNLOAD_DIR"
gdown --folder "$DRIVE_FOLDER" -O "$DOWNLOAD_DIR" --no-cookies >> "$LOG" 2>&1

# Find the MDB file
MDB_FILE=$(find "$DOWNLOAD_DIR" -maxdepth 1 -name "*.mdb" -type f | head -1)
if [ -z "$MDB_FILE" ]; then
  echo "$(date): No MDB file found" >> "$LOG"
  exit 1
fi

# Check if file changed (compare size)
NEW_SIZE=$(stat -f%z "$MDB_FILE" 2>/dev/null || stat -c%s "$MDB_FILE" 2>/dev/null)
OLD_SIZE=$(stat -f%z "$MDB_PATH" 2>/dev/null || stat -c%s "$MDB_PATH" 2>/dev/null || echo "0")

if [ "$NEW_SIZE" = "$OLD_SIZE" ]; then
  echo "$(date): File unchanged (${NEW_SIZE} bytes), skipping import" >> "$LOG"
  rm -rf "$DOWNLOAD_DIR"
  exit 0
fi

echo "$(date): New file detected (${NEW_SIZE} vs ${OLD_SIZE} bytes)" >> "$LOG"
cp "$MDB_FILE" "$MDB_PATH"

# Import via API
RESULT=$(curl -s -X POST "http://localhost:3000/api/admin/fichador?secret=$(grep RESEND_API_KEY /home/distrialma/.env | cut -d= -f2 | head -c16)" 2>/dev/null)
echo "$(date): Import result: $RESULT" >> "$LOG"

# Cleanup
rm -rf "$DOWNLOAD_DIR"
echo "$(date): Sync complete" >> "$LOG"
