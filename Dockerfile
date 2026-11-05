FROM node:24-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
COPY backend/domain ./backend/domain
COPY scripts/export-contracts.ts scripts/copy-notices.mjs ./scripts/
COPY LICENSE THIRD_PARTY_NOTICES.md ./
COPY licenses ./licenses
COPY docs/reference/ASSETS.md ./docs/reference/ASSETS.md
RUN npm run build

FROM golang:1.27.3-alpine AS backend-build
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/onecup ./cmd/onecup

FROM alpine:3.23 AS api
WORKDIR /app
RUN addgroup -g 1000 onecup && adduser -D -u 1000 -G onecup onecup && mkdir -p /data && chown onecup:onecup /data && chmod 700 /data
COPY --from=backend-build /out/onecup /app/onecup
COPY LICENSE THIRD_PARTY_NOTICES.md /app/notices/
COPY licenses /app/notices/licenses
ENV HOST=0.0.0.0 PORT=8080 STATIC_DIRECTORY=- DATABASE_PATH=/data/onecup.sqlite BACKUP_DIRECTORY=/data/backups ONECUP_AUTO_BACKUP_HOURS=24
USER onecup
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["/app/onecup", "healthcheck"]
ENTRYPOINT ["/app/onecup"]
CMD ["serve"]

FROM nginx:stable-alpine AS web
COPY --from=frontend-build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/nginx-main.conf /etc/nginx/nginx.conf
RUN chown -R nginx:nginx /var/cache/nginx
USER nginx
EXPOSE 8080
