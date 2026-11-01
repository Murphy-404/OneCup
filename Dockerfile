FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
COPY server ./server
COPY scripts/build-server.mjs scripts/copy-notices.mjs ./scripts/
COPY LICENSE THIRD_PARTY_NOTICES.md ./
COPY licenses ./licenses
COPY docs/reference/ASSETS.md ./docs/reference/ASSETS.md
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
RUN mkdir -p /data && chown node:node /data && chmod 700 /data
COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist
COPY LICENSE THIRD_PARTY_NOTICES.md ./dist/
COPY licenses ./dist/licenses
COPY docs/reference/ASSETS.md ./dist/docs/reference/ASSETS.md
ENV HOST=0.0.0.0 PORT=8080 DATABASE_PATH=/data/onecup.sqlite BACKUP_DIRECTORY=/data/backups ONECUP_AUTO_BACKUP_HOURS=24
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server-dist/index.mjs"]
