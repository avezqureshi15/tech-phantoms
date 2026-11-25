#!/bin/bash
set -euo pipefail

mkdir -p /run/secrets
if ! mountpoint -q /run/secrets; then
  mount -t tmpfs -o mode=0700,size=1m tmpfs /run/secrets
fi
chown root:root /run/secrets
chmod 0700 /run/secrets
