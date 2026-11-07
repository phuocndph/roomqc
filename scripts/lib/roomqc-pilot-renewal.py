"""Scoped, forward-only renewal of an unchanged contabo-pilot release.

No signing key, schema mutation, admission override, or public signup opening.
On partial failure retain the receipt/snapshot and reconcile; never replay an
old authority install with a different idempotency key.
"""
import base64, fcntl, hashlib, hmac, json, os, pathlib, shutil, subprocess, sys, time, urllib.request, urllib.error, uuid
BASE = pathlib.Path('/opt/RoomQC/management/contabo-pilot-mgmt')
ROOT = pathlib.Path(__file__).resolve().parent
MON = BASE / 'operator/monitoring'
SETUP = BASE / 'operator/setup'
DIRECTORY = 'roomqc-management-contabo-pilot-mgmt-roomqc-directory-1'
DB = 'roomqc-contabo-pilot-db-1'
WEB = 'roomqc-management-contabo-pilot-mgmt-roomqc-web-1'
WORKERS = ['roomqc-contabo-health-health-worker-1', 'roomqc-contabo-setup-setup-worker-1', 'roomqc-contabo-setup-credential-rotation-1']
IMAGE = 'roomqc/control@sha256:8896e97b56e09507074a510df668fe1aac98f20f3f7ba4e9268782349406869a'
COMPOSE = ['docker', 'compose', '-p', 'roomqc-management-contabo-pilot-mgmt', '-f', str(BASE/'output/management.compose.json'), '-f', str(BASE/'operator/proxy-dns/compose.json')]
phase = 'preflight'

def save(path, value, uid=1000):
    path = pathlib.Path(path)
    assert not path.is_symlink(), 'symlink refused'
    data = value if isinstance(value, str) else json.dumps(value, separators=(',', ':'))+'\n'
    temp = path.with_name(path.name+'.new')
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(data); stream.flush(); os.fsync(stream.fileno())
    os.chown(temp, uid, uid); os.replace(temp, path)

def run(args, data=None, timeout=120):
    p = subprocess.run(args, input=data, capture_output=True, text=True, timeout=timeout)
    if p.returncode:
        save(ROOT/'last-command.private.log', p.stdout+'\n'+p.stderr, 0)
        raise RuntimeError('command failed; private diagnostic retained')
    return p.stdout.strip()

def sql(query, directory=False):
    return run(['docker', 'exec', '-i']+(['--user','70:70'] if directory else [])+[DIRECTORY if directory else DB,
        'psql','-X','-Atq','-v','ON_ERROR_STOP=1','-U','postgres' if directory else 'supabase_admin','-d','roomqc_control' if directory else 'postgres'],query)

def api(path, token=None, body=None, headers=None):
    hs={'apikey':backend['publishableKey'],'Origin':'https://roomqc.com'}
    if token: hs['Authorization']='Bearer '+token
    if body is not None: hs['Content-Type']='application/json'
    if headers: hs.update(headers)
    req=urllib.request.Request('https://roomqc.com'+path,headers=hs,data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req,timeout=20) as response:
            raw=response.read();return response.status,json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        raw=error.read();save(ROOT/'last-api.private.log',raw.decode(errors='replace'),0)
        try: value=json.loads(raw)
        except ValueError: value={}
        return error.code,value

def container(command, mounts, data=None):
    args=['docker','run','--rm','-i','--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true',
        '--memory','256m','--cpus','0.5','--pids-limit','64','--network','roomqc-contabo-pilot-mgmt-directory',
        '-e','NODE_ENV=production','-e','NODE_EXTRA_CA_CERTS=/ops/worker-ca.pem']
    for source,target in mounts: args+=['--mount','type=bind,src='+str(source)+',dst='+target+',readonly']
    return run(args+[IMAGE]+command,data)

def emit(name, **values):
    save(ROOT/'state.json',{'phase':name,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),**values},0)
    print(json.dumps({'phase':name,**values}),flush=True)

def health():
    return json.loads(sql("SELECT row_to_json(t) FROM (SELECT observed_at,evaluator_state->'probes' AS probes FROM roomqc_control.cluster_health_current WHERE cluster_id='contabo-pilot') t;",True))

def authority():
    return json.loads(sql("SELECT row_to_json(t) FROM (SELECT epoch,row_version AS version,state FROM roomqc_control.release_authority WHERE cluster_id='contabo-pilot') t;",True))

def unrelated():
    rows=json.loads(run(['docker','inspect',*run(['docker','ps','-aq']).splitlines()]))
    return {r['Name']:{'id':r['Id'],'startedAt':r['State']['StartedAt'],'restartCount':r['RestartCount']} for r in rows if not r['Name'].startswith('/roomqc')}

try:
    assert sys.argv[1:] in [['--preflight'],['--apply'],['--resume-uninstalled']], 'explicit mode required'
    resume='--resume-uninstalled' in sys.argv
    lock=open(BASE/'.install.lock','r+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    checkpoint=open(BASE/'operator/checkpoints/collection.lock','r+');fcntl.flock(checkpoint,fcntl.LOCK_EX|fcntl.LOCK_NB)
    before=json.loads((ROOT/'before.json').read_text());old=before['approval']
    approval=json.loads((ROOT/'approval.json').read_text());p=approval['payload'];epoch=p['epoch'];expected=p['expected']
    assert old==json.loads((BASE/'private/release-approval.json').read_text()), 'approval changed; reconcile first'
    assert before['trust']==json.loads((BASE/'private/release-trust.json').read_text()), 'trust changed'
    assert epoch==old['payload']['epoch']+1 and expected==old['payload']['expected'], 'release mutation refused'
    assert p['expiresAt']>int(time.time()*1000)+3600000, 'renewal too close to expiry'
    assert authority()=={'epoch':epoch-1,'version':epoch-1,'state':'active'}, 'authority changed'
    assert sql('SELECT private.roomqc_schema_fingerprint();')==expected['schemaManifestHash'], 'schema changed'
    assert run(['docker','inspect',WEB,'--format','{{.Image}}'])=='sha256:'+expected['frontendArtifactDigest'], 'web changed'
    backend=json.loads(pathlib.Path('/opt/RoomQC/clusters/contabo-pilot/config/operator/backend.json').read_text())
    code,closed=api('/api/control/signup-intents',body={});assert code==503 and closed.get('error')=='SIGNUP_CLOSED'
    before_health=health();assert all(before_health['probes'].values()), 'service probes unhealthy'
    others=unrelated()
    setup_binding=sql('SELECT binding_sha256 FROM private.setup_recovery_authority WHERE singleton;')
    counts=sql("SELECT json_build_object('auth',(SELECT count(*) FROM auth.users),'users',(SELECT count(*) FROM public.users),'hotels',(SELECT count(*) FROM public.hotels));")
    configs=[BASE/'private/release-validation.json',BASE/'private/release-approval.json',MON/'managed-probes.json',SETUP/'worker/setup.json']+[SETUP/n/'config.json' for n in ['installer','issuer','rotation']]
    for path in configs:
        v=json.loads(path.read_text())
        if 'target' in v: assert v['target']['approval']==old and v['target']['expected']==expected
        for target in v.get('targets',[]): assert target['approval']==old
    # Verify signature/unchanged target with the existing least-privilege installer.
    mounts=[(BASE/'operator/release','/operator-release'),(BASE/'private/release-trust.json','/release/release-trust.json'),
        (ROOT/'approval.json','/release/release-approval.json'),(MON/'worker-ca.pem','/ops/worker-ca.pem')]
    verify="import{readFileSync}from'node:fs';import{ReleaseApprovalTrust}from'./release-approval.mjs';const a=JSON.parse(readFileSync('/release/release-approval.json'));const i=JSON.parse(readFileSync('/operator-release/inventory.json')).targets[0];const{releaseApprovalEndpointFingerprint}=await import('./release-approval.mjs');new ReleaseApprovalTrust(JSON.parse(readFileSync('/release/release-trust.json')),{maximumValidityMs:86400000}).verify(a,{clusterId:i.cluster.id,hostId:i.cluster.hostId,inventoryRef:i.cluster.inventoryRef,environment:i.cluster.environment,expected:i.expected,endpointFingerprint:releaseApprovalEndpointFingerprint({url:i.cluster.url,internalUrl:i.cluster.internalUrl,approvedAddresses:i.cluster.approvedAddresses,credentialRef:i.cluster.credentialRef})});console.log(JSON.stringify({signatureVerified:true}));"
    os.chown(ROOT/'approval.json',1000,1000);os.chmod(ROOT/'approval.json',0o600)
    assert json.loads(container(['node','--input-type=module','-e',verify],mounts))['signatureVerified']
    if '--preflight' in sys.argv:
        print(json.dumps({'preflight':True,'epoch':epoch,'expectedUnchanged':True,'signatureVerified':True,'fiveServiceProbes':before_health['probes'],'signupClosed':True}));sys.exit(0)
    snapshot=ROOT/'snapshot'
    if resume:
        assert json.loads((ROOT/'state.json').read_text())['phase']=='workers_stopped'
        assert not (ROOT/'authority-receipt.json').exists(), 'authority receipt exists; forward reconciliation required'
        observation=json.loads((snapshot/'observations.json').read_text())
        assert observation['counts']==counts and observation['setupBinding']==setup_binding and observation['unrelated']==others
        before_health=observation['health']
    else:
        assert not (ROOT/'state.json').exists(), 'renewal already started; reconcile receipt'
        snapshot.mkdir(mode=0o700)
        for i,path in enumerate(configs): shutil.copy2(path,snapshot/(str(i)+'.private'))
        save(snapshot/'index.json',[str(x) for x in configs],0)
        save(snapshot/'observations.json',{'counts':counts,'setupBinding':setup_binding,'unrelated':others,'health':before_health},0)
        emit('snapshot_saved',epoch=epoch)
        phase='stop_workers';run(['docker','stop','--time','25',*WORKERS]);emit('workers_stopped')
    phase='install_authority'
    if resume:
        command=json.loads((ROOT/'command.json').read_text())
        assert command['expectedVersion']==epoch-1 and command['clusterId']=='contabo-pilot' and command['operation']=='install'
    else:
        command={'version':1,'operation':'install','expectedVersion':epoch-1,'key':str(uuid.uuid4()),'requestId':str(uuid.uuid4()),
            'reason':'Renew unchanged pilot release before expiry; keep public registration closed','clusterId':'contabo-pilot','approvalFile':'/release/release-approval.json'}
        save(ROOT/'command.json',command)
    mounts.append((ROOT/'command.json','/renew-command.json'))
    result=json.loads(container(['node','release-installer-cli.mjs','--config-file','/operator-release/config.json','--command-file','/renew-command.json'],mounts))
    save(ROOT/'authority-receipt.json',result,0);assert result['ok'] and result['receipt']['epoch']==epoch
    emit('authority_installed',epoch=epoch)
    phase='publish_consumers'
    b64=lambda value:base64.urlsafe_b64encode(value).decode().rstrip('=')
    head=b64(b'{"alg":"HS256","typ":"JWT"}')
    claims=b64(json.dumps({'role':'roomqc_control_probe','iss':'supabase','iat':int(time.time()),'exp':p['expiresAt']//1000},separators=(',',':')).encode())
    unsigned=head+'.'+claims;token=unsigned+'.'+b64(hmac.new(backend['jwtSecret'].encode(),unsigned.encode(),hashlib.sha256).digest())
    validation=json.loads((BASE/'private/release-validation.json').read_text())
    entries=[x for x in validation['entries'] if x['inventoryRef']=='contabo-pilot'];assert len(entries)==1
    entries[0]['approval']=approval;entries[0]['credential']={'publishableKey':backend['publishableKey'],'token':token}
    save(BASE/'private/release-validation.json',validation);save(BASE/'private/release-approval.json',approval)
    for path in configs[2:]:
        v=json.loads(path.read_text())
        if 'target' in v: v['target']['approval']=approval
        for target in v.get('targets',[]): target['approval']=approval
        save(path,v)
    phase='renew_probe'
    account=json.loads((MON/'canary-account.private.json').read_text())
    status,session=api('/auth/v1/token?grant_type=password',body={'email':account['email'],'password':account['password']})
    assert status==200 and session['user']['id']==account['userId'], 'canary sign in failed'
    auth_claims=json.loads(base64.urlsafe_b64decode(session['access_token'].split('.')[1]+'==='))
    seed={'credential':entries[0]['credential'],'auth':{'token':session['access_token'],'refreshToken':session['refresh_token'],'userId':account['userId'],'sessionId':auth_claims['session_id']}}
    seed_path=ROOT/'seed.private.json';save(seed_path,seed)
    node="""import{readFileSync}from'node:fs';import pg from'pg';import{loadProbeKeyring}from'./probe-secrets.mjs';import{ProbeCredentialStore,probeBinding}from'./probe-credentials.mjs';
const pool=new pg.Pool({connectionString:readFileSync('/ops/probe_installer.dsn','utf8').trim(),max:1});try{const t=JSON.parse(readFileSync('/ops/managed-probes.json')).targets[0];const before=(await pool.query('SELECT revision FROM roomqc_control.probe_credentials WHERE cluster_id=$1',[t.cluster.id])).rows[0];const store=new ProbeCredentialStore(pool,await loadProbeKeyring('/ops/probe-keyring.json'));const r=await store.install(probeBinding(t.cluster,t.expected),JSON.parse(readFileSync('/ops/seed.private.json')),{expectedRevision:Number(before.revision)});console.log(JSON.stringify({installed:true,revision:r.revision,state:r.state}));}finally{await pool.end()}"""
    try:
        seeded=json.loads(container(['node','--input-type=module'],[(MON/n,'/ops/'+n) for n in ['worker-ca.pem','probe_installer.dsn','probe-keyring.json','managed-probes.json']]+[(seed_path,'/ops/seed.private.json')],node))
        save(ROOT/'probe-receipt.json',seeded,0);assert seeded['state']=='ready'
    finally: seed_path.unlink(missing_ok=True)
    emit('consumers_published',epoch=epoch)
    phase='restart_services'
    run(COMPOSE+['up','-d','--no-deps','--force-recreate','roomqc-control'])
    for _ in range(30):
        try:
            if api('/api/control/readyz')[0]==200:break
        except (OSError,ValueError):pass
        time.sleep(1)
    else:raise RuntimeError('control API did not recover')
    operator=json.loads((BASE/'operator/pilot-operator-login.json').read_text())
    status,session=api('/auth/v1/token?grant_type=password',body={'email':operator['email'],'password':operator['password']});assert status==200
    status,value=api('/api/control/admin/clusters',session['access_token']);assert status==200
    view=next(x for x in value.get('items',value.get('clusters',[])) if x['id']=='contabo-pilot')
    status,value=api('/api/control/admin/clusters/contabo-pilot/commands',session['access_token'],{'operation':'validate','expectedVersion':view['rowVersion'],'reason':'Validate renewed unchanged production release','payload':{}},{'Idempotency-Key':str(uuid.uuid4())})
    save(ROOT/'validation-receipt.json',value,0);assert status in [200,201,202] and value['status']=='succeeded'
    run(['docker','compose','-f',str(SETUP/'compose.json'),'up','-d','--no-deps','--force-recreate','credential-rotation','setup-worker'])
    run(['docker','compose','-f',str(MON/'health.compose.json'),'up','-d','--no-deps','--force-recreate','health-worker'])
    phase='verify_runtime'
    after=None
    for _ in range(35):
        sample=health()
        if sample['observed_at']>before_health['observed_at'] and all(sample['probes'].values()):after=sample;break
        time.sleep(3)
    assert after, 'fresh healthy sample missing'
    for name,port in [(WORKERS[0],8093),(WORKERS[1],8095)]:
        run(['docker','exec',name,'node','-e',"fetch('http://127.0.0.1:"+str(port)+"/readyz',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],timeout=10)
    assert authority()=={'epoch':epoch,'version':epoch,'state':'active'}
    assert sql('SELECT private.roomqc_schema_fingerprint();')==expected['schemaManifestHash']
    assert sql('SELECT binding_sha256 FROM private.setup_recovery_authority WHERE singleton;')==setup_binding
    assert sql("SELECT json_build_object('auth',(SELECT count(*) FROM auth.users),'users',(SELECT count(*) FROM public.users),'hotels',(SELECT count(*) FROM public.hotels));")==counts
    assert unrelated()==others, 'unrelated containers changed'
    status,value=api('/api/control/signup-intents',body={});assert status==503 and value.get('error')=='SIGNUP_CLOSED'
    receipt={'kind':'roomqc-pilot-release-renewal','verifiedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'epoch':epoch,
        'expiresAt':p['expiresAt'],'schemaUnchanged':True,'setupBindingUnchanged':True,'businessIdentityCountsUnchanged':True,
        'privateSigningKeyUploaded':False,'fiveServiceProbes':after['probes'],'workersReady':True,'signupOpened':False,
        'unrelatedContainersUnchanged':len(others),'continuousIssuerConfigured':False}
    save(ROOT/'receipt.json',receipt,0);emit('renewed_verified',**receipt)
except SystemExit:raise
except Exception as error:
    failure={'ok':False,'phase':phase,'failure':str(error) if isinstance(error,(AssertionError,RuntimeError)) else type(error).__name__,
        'signupOpened':False,'reconciliationRequired':phase!='preflight'}
    save(ROOT/'failure.json',failure,0);print(json.dumps(failure),flush=True);sys.exit(1)
