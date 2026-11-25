FROM postgres:16-alpine
RUN apk add --no-cache openssl
COPY tls-entrypoint.sh /usr/local/bin/tls-entrypoint.sh
COPY 10-app-users.sh /docker-entrypoint-initdb.d/10-app-users.sh
RUN chmod 0755 /usr/local/bin/tls-entrypoint.sh /docker-entrypoint-initdb.d/10-app-users.sh
ENTRYPOINT ["tls-entrypoint.sh"]
CMD ["postgres"]
