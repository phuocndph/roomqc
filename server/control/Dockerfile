FROM node:22-alpine
WORKDIR /app
COPY server/control/package.json server/control/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY server/control/*.mjs server/control/schema.sql ./
USER node
ENV NODE_ENV=production ROOMQC_CONTROL_HOST=0.0.0.0 ROOMQC_CONTROL_PORT=8091
EXPOSE 8091
CMD ["node", "server.mjs"]
