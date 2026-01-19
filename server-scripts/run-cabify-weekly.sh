#!/bin/bash
source /opt/toshify-sync/env.sh
cd /opt/toshify-sync
/root/.deno/bin/deno run --allow-net --allow-env sync-cabify-weekly.ts >> /var/log/sync-cabify-weekly.log 2>&1
