#!/bin/bash
source /opt/toshify-sync/env.sh
cd /opt/toshify-sync
/root/.deno/bin/deno run --allow-net --allow-env sync-cabify-realtime.ts >> /var/log/sync-cabify-realtime.log 2>&1
