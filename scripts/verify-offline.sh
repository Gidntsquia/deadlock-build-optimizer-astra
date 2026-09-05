#!/usr/bin/env bash
# Linux-only stronger acceptance check. Requires unshare and iproute2.
# Run: unshare -Urn bash scripts/verify-offline.sh
set -euo pipefail
ip link set lo up
echo 'Only loopback is available in this network namespace:'
ip -brief address
npm run build
npm test
npm run validate
npm run verify:browser
