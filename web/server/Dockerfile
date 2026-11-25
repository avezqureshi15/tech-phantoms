FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM build AS production-deps
RUN npm prune --omit=dev

FROM node:24-alpine AS production
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/src/generated ./dist/src/generated
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/src/index.js"]

FROM build AS ops
ENV NODE_ENV=production
USER node
