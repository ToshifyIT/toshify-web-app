#!/bin/bash
source /opt/toshify-sync/env.sh
cd /opt/toshify-sync
/root/.deno/bin/deno run --allow-net --allow-env sync-cabify-backfill.ts "$@" 2>&1 | tee -a /var/log/sync-cabify-backfill.log
