#!/bin/bash
set -euo pipefail

set -a
source /etc/diya/backup.env
set +a

cd /opt/diya
timestamp=$(date -u +%Y%m%dT%H%M%SZ)

for database in diya festiveos; do
  docker compose -f compose.prod.yaml exec -T postgres \
    sh -c "PGPASSWORD=\$(cat /run/secrets/postgres-password) pg_dump -U diya -d '$database' --format=custom" \
    | gzip -9 \
    | aws s3 cp - "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX:-postgres}/${timestamp}/${database}.dump.gz" \
        --region "${AWS_REGION:-ap-south-1}" --only-show-errors
done
