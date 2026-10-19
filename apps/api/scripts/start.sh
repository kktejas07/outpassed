#!/bin/sh
# Container entrypoint: apply migrations, optionally load demo data, start the API.
set -e
pnpm --filter @outpassed/api exec prisma migrate deploy

# Demo servers only. The seed resets demo activity (passes, fees, events,
# listings, offers), so it needs BOTH flags and never runs on a real college.
if [ "$SEED_DEMO" = "true" ]; then
  if [ "$DEMO_ACCOUNTS" = "true" ]; then
    echo "SEED_DEMO=true: loading demo data"
    pnpm --filter @outpassed/api db:seed
  else
    echo "SEED_DEMO=true ignored: set DEMO_ACCOUNTS=true as well (demo servers only)"
  fi
fi

exec node apps/api/dist/index.js
