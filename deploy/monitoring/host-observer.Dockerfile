FROM node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85
RUN apk add --no-cache openssh-client-default=10.3_p1-r1 \
    && mkdir -p /home/node/.ssh /run/roomqc \
    && chown node:node /home/node/.ssh /run/roomqc \
    && chmod 0700 /home/node/.ssh /run/roomqc
WORKDIR /opt/roomqc
COPY server/control/package.json server/control/package-lock.json ./server/control/
RUN cd server/control && npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY server/control/*.mjs ./server/control/
COPY server/control/workers ./server/control/workers
COPY scripts/roomqc-host-observer.mjs scripts/roomqc-vps-preflight.mjs ./scripts/
USER 1000:1000
ENV NODE_ENV=production
CMD ["node", "scripts/roomqc-host-observer.mjs", "--targets-file", "/etc/roomqc/hosts.json", "--database-url-file", "/run/secrets/observer-dsn", "--status-file", "/run/roomqc/observer-status.json", "--watch", "--interval-seconds", "60"]
