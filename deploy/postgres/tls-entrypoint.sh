#!/bin/sh
set -eu

tls_dir=/var/lib/postgresql/tls
mkdir -p "$tls_dir"
if [ ! -s "$tls_dir/server.key" ] || [ ! -s "$tls_dir/server.crt" ]; then
  openssl req -new -x509 -days 3650 -nodes -text \
    -out "$tls_dir/server.crt" \
    -keyout "$tls_dir/server.key" \
    -subj "/CN=postgres"
fi
chown postgres:postgres "$tls_dir/server.crt" "$tls_dir/server.key"
chmod 0644 "$tls_dir/server.crt"
chmod 0600 "$tls_dir/server.key"

exec /usr/local/bin/docker-entrypoint.sh "$@"
