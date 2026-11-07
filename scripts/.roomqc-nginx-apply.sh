set -eu
WEB=roomqc-management-contabo-pilot-mgmt-roomqc-web-1
NET=roomqc-contabo-pilot_default
CFG=/opt/RoomQC/management/contabo-pilot-mgmt/metadata/nginx.conf
BAK=$CFG.pre-api-routes-20261031
CONNECTED=0
if [ ! -e "$BAK" ]; then cp -p "$CFG" "$BAK"; fi
if ! docker inspect "$WEB" --format '{{json .NetworkSettings.Networks}}' | grep -q '"roomqc-contabo-pilot_default"'; then
  docker network connect --alias api-gw "$NET" "$WEB"
  CONNECTED=1
fi
cp -p /tmp/roomqc-nginx-new.conf "$CFG"
if ! docker exec "$WEB" nginx -t; then
  cp -p "$BAK" "$CFG"
  if [ "$CONNECTED" = 1 ]; then docker network disconnect "$NET" "$WEB" || true; fi
  exit 1
fi
docker exec "$WEB" nginx -s reload
printf 'nginx-reloaded\n'
docker inspect "$WEB" --format '{{json .NetworkSettings.Networks}}' | grep -o 'roomqc-contabo-pilot_default' | head -n 1
curl -sS -o /dev/null -w 'rest-route=%{http_code}\n' https://roomqc.com/rest/v1/
curl -sS -o /dev/null -w 'auth-route=%{http_code}\n' https://roomqc.com/auth/v1/settings
curl -sS -o /dev/null -w 'control-ready=%{http_code}\n' https://roomqc.com/api/control/readyz
