#!/bin/bash
source /opt/toshify-sync/env.sh
cd /opt/toshify-sync
/root/.deno/bin/deno run --allow-net --allow-env sync-wialon-bitacora.ts >> /var/log/sync-wialon-bitacora.log 2>&1
