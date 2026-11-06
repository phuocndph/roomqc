FROM docker:cli@sha256:1a4c7cb63513f349bdad01fcc6e0f3f2f67d37b9da86f14dc0d4a0942eecda00 AS dockercli
FROM node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85
RUN apk add --no-cache openssh-client ca-certificates
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
WORKDIR /app
COPY server/control/package.json server/control/package-lock.json ./server/control/
RUN cd server/control && npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY server/control/*.mjs ./server/control/
COPY server/control/workers ./server/control/workers/
COPY server/control/migrations ./server/control/migrations/
COPY scripts/roomqc-vps-executor.mjs scripts/roomqc-vps-deploy.mjs scripts/roomqc-vps-preflight.mjs scripts/roomqc-vps-config.mjs ./scripts/
COPY scripts/roomqc-management-install.mjs ./scripts/
COPY scripts/lib ./scripts/lib/
USER node
ENV NODE_ENV=production
ENTRYPOINT ["node", "scripts/roomqc-vps-executor.mjs"]
CMD ["--help"]
