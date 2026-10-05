FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
# Keep dependency resolution strict; date-fns is pinned to the range supported
# by react-day-picker, so builds do not rely on a peer-dependency workaround.
RUN npm ci --no-audit --no-fund

COPY . .

# Vite embeds only these public client values into the static bundle.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_VAPID_PUBLIC_KEY
ARG VITE_ENABLE_DEMO_DATA=false
ARG ROOMQC_ENVIRONMENT=local
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY \
    VITE_ENABLE_DEMO_DATA=$VITE_ENABLE_DEMO_DATA \
    ROOMQC_ENVIRONMENT=$ROOMQC_ENVIRONMENT

RUN node scripts/validate-env.mjs \
    && npm run build \
    && npm run verify:build

FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider --quiet http://127.0.0.1/healthz || exit 1
