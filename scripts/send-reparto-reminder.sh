#!/bin/bash
# Send reparto reminder via API
# Usage: send-reparto-reminder.sh [DAY]
# If no day specified, it auto-detects tomorrow's delivery day

cd /home/distrialma

if [ -n "$1" ]; then
  DAY="&day=$1"
else
  DAY=""
fi

curl -s -X POST "http://localhost:3000/api/admin/reparto-reminder" \
  -H "Content-Type: application/json" \
  -d "{\"secret\":\"re_5wSDTNZc_3ZCp\"}" \
  >> /tmp/reparto-reminder.log 2>&1

echo "" >> /tmp/reparto-reminder.log
echo "--- $(date) ---" >> /tmp/reparto-reminder.log
