#!/bin/bash
# Archive Local1 orders from PunTouch — runs daily at 18:00 Argentina
curl -s -X POST http://localhost:3000/api/admin/archive-orders \
  -H "Content-Type: application/json" \
  -d '{"clienteCod":"9411","cronSecret":"k8m3x9w2p5v7j1n4q6r0t8y3u5i2o7a"}' >> /var/log/distrialma-archive.log 2>&1
echo " [$(date)]" >> /var/log/distrialma-archive.log
