FROM node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85
WORKDIR /app
COPY server/control/package.json server/control/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY server/control/*.mjs server/control/schema.sql ./
COPY server/control/migrations ./migrations
USER node
ENV NODE_ENV=production ROOMQC_CONTROL_HOST=0.0.0.0 ROOMQC_CONTROL_PORT=8091
EXPOSE 8091
CMD ["node", "server.mjs"]
