#!/bin/bash
source /opt/toshify-sync/env.sh
cd /opt/toshify-sync
/root/.deno/bin/deno run --allow-net --allow-env sync-cabify.ts >> /var/log/sync-cabify.log 2>&1
