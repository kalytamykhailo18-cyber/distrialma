#!/bin/bash
# Sends automatic debt reminders via WhatsApp to clients with overdue balances.
# Runs weekdays at 10am and 3pm Argentina time.

SECRET=$(grep -E '^CRON_SECRET=' /home/distrialma/.env.local 2>/dev/null | cut -d'=' -f2 | tr -d '"')
if [ -z "$SECRET" ]; then
  RESEND_KEY=$(grep -E '^RESEND_API_KEY=' /home/distrialma/.env 2>/dev/null /home/distrialma/.env.local 2>/dev/null | head -1 | cut -d'=' -f2 | tr -d '"')
  SECRET="${RESEND_KEY:0:16}"
fi

curl -s -X POST "http://localhost:3000/api/admin/deuda-reminder" \
  -H "Content-Type: application/json" \
  -d "{\"secret\":\"${SECRET}\"}" \
  >> /tmp/deuda-reminder.log 2>&1

echo "--- $(date) ---" >> /tmp/deuda-reminder.log
