#!/bin/bash
source /opt/toshify-sync/env.sh
cd /opt/toshify-sync
/root/.deno/bin/deno run --allow-net --allow-env sync-uss-excesos.ts >> /var/log/sync-uss.log 2>&1
