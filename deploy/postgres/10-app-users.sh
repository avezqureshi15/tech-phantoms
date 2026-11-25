#!/bin/sh
set -eu

diya_password=$(cat "$DIYA_APP_PASSWORD_FILE")
festiveos_password=$(cat "$FESTIVEOS_APP_PASSWORD_FILE")

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 \
  --set diya_password="$diya_password" \
  --set festiveos_password="$festiveos_password" <<'SQL'
CREATE ROLE diya_app LOGIN PASSWORD :'diya_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE festiveos_app LOGIN PASSWORD :'festiveos_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE diya OWNER TO diya_app;
CREATE DATABASE festiveos OWNER festiveos_app;
REVOKE ALL ON DATABASE diya FROM PUBLIC;
REVOKE ALL ON DATABASE festiveos FROM PUBLIC;
GRANT CONNECT ON DATABASE diya TO diya_app;
GRANT CONNECT ON DATABASE festiveos TO festiveos_app;
SQL
