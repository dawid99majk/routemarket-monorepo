#!/bin/bash
# Wdrożenie route-builder-api. Build trwa 5-7 min — dłużej niż typowa sesja SSH,
# dlatego leci przez nohup w tle. Postęp: tail -f /tmp/rb-build.log
set -e
cd /root/routemarket-workspace/apps/atlas-engine/deploy
nohup sh -c "docker compose -f docker-compose.vps.yml build route-builder-api && docker compose -f docker-compose.vps.yml up -d route-builder-api && sleep 5 && curl -sf http://127.0.0.1:8081/health && echo && echo DEPLOY-OK" > /tmp/rb-build.log 2>&1 &
echo "Build ruszył w tle. Sprawdź: tail -f /tmp/rb-build.log (koniec = DEPLOY-OK, błędy TS: grep \"error TS\" /tmp/rb-build.log)"
