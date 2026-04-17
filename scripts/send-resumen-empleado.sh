#!/bin/bash
# Sends monthly employee descuentos PDFs to the configured contador email.
# Only runs if today is the last day of the month (in America/Argentina/Buenos_Aires timezone).

export TZ="America/Argentina/Buenos_Aires"
TOMORROW=$(date -d "tomorrow" +%d)
if [ "$TOMORROW" != "01" ]; then
  exit 0
fi

SECRET=$(grep -E '^CRON_SECRET=' /home/distrialma/.env.local 2>/dev/null | cut -d'=' -f2 | tr -d '"')
if [ -z "$SECRET" ]; then
  # Fallback: first 16 chars of RESEND_API_KEY
  RESEND_KEY=$(grep -E '^RESEND_API_KEY=' /home/distrialma/.env 2>/dev/null /home/distrialma/.env.local 2>/dev/null | head -1 | cut -d'=' -f2 | tr -d '"')
  SECRET="${RESEND_KEY:0:16}"
fi

curl -s -X POST "http://localhost:3000/api/admin/resumen-empleado/enviar?secret=${SECRET}" \
  -H "Content-Type: application/json" \
  -d '{}' >> /tmp/resumen-empleado.log 2>&1

echo "--- $(date) ---" >> /tmp/resumen-empleado.log
