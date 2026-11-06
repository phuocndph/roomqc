set -eu
ENV=/opt/RoomQC/management/contabo-pilot-mgmt/private/api.env
ANON_KEY=$(grep '^ROOMQC_CONTROL_CLUSTERS=' "$ENV" | cut -d= -f2- | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["publishableKey"])')
JWT_SECRET=$(docker inspect roomqc-contabo-pilot-functions-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | awk -F= '$1=="JWT_SECRET"{print substr($0,index($0,"=")+1)}')
export ANON_KEY JWT_SECRET
TOKEN=$(python3 - <<'PY'
import base64,hmac,hashlib,json,os,time
enc=lambda b: base64.urlsafe_b64encode(b).rstrip(b'=').decode()
h=enc(json.dumps({'alg':'HS256','typ':'JWT'},separators=(',',':')).encode())
p=enc(json.dumps({'role':'roomqc_control_probe','exp':int(time.time())+300},separators=(',',':')).encode())
s=enc(hmac.new(os.environ['JWT_SECRET'].encode(),(h+'.'+p).encode(),hashlib.sha256).digest())
print(h+'.'+p+'.'+s)
PY
)
challenge=$(printf 'a%.0s' $(seq 1 64))
status=$(curl -sS -o /tmp/roomqc-manifest-body -w '%{http_code}' -X POST https://roomqc.com/rest/v1/rpc/control_cluster_manifest -H "apikey: $ANON_KEY" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data "{"p_challenge":"$challenge"}")
printf 'manifest-status=%s
' "$status"
cat /tmp/roomqc-manifest-body
