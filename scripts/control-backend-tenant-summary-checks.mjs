// Only the labelled disposable backend's fixture administrator may run this.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
import {readTenantSummary,tenantSummaryBinding} from '/control/tenant-summary.mjs';
import {runSummaryCredentialChecks} from '/control/testing/tenant-summary-credential-native.mjs';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_TENANT_SUMMARY_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);
const db=new pg.Client({host:'db',database:'postgres',user:'postgres',password:input.databasePassword,statement_timeout:10000});
const checks=[];const check=(label,condition=true)=>{assert.ok(condition,label);checks.push({label,passed:true})};
const origin='http://127.0.0.1:8000';
const call=async(path,token,body,headers={})=>{
 const response=await fetch(origin+path,{method:'POST',headers:{apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json',...headers},
  body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 return {status:response.status,data:await response.json()};
};
try{
 await db.connect();const beforeSchema=(await db.query('SELECT private.roomqc_schema_fingerprint() AS hash')).rows[0].hash;
 const email='summary-'+input.run+'@roomqc.invalid',password=randomBytes(32).toString('hex');
 const user=await call('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(user.status,200);
 const login=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});assert.equal(login.status,200);
 const session=JSON.parse(Buffer.from(login.data.access_token.split('.')[1],'base64url')).session_id;
 const id=randomUUID();
 const provision=await call('/rest/v1/rpc/provision_workspace_registration',input.serviceKey,{p_workspace_id:id,p_owner_id:user.data.id,p_fields:{
  fullName:'Summary owner',phone:'0901234567',tenantName:'Summary full-schema tenant',hotelName:'Summary fixture hotel',hotelAddress:'Fixture road',
  hotelPhone:'0901234567',hotelEmail:email,totalRooms:3,workspaceSlug:'summary-'+input.run,registrationSessionId:session}});
 assert.equal(provision.status,200);assert.equal(provision.data.success,true);check('actual Auth signup/session and provisioning receipt fixture');
 const workspace={id,tenant_id:provision.data.tenant_id,owner_id:user.data.id,hotel_id:provision.data.hotel_id,routing_version:1,
  cluster_id:'cluster-a',api_url:'https://summary.example.invalid'};
 const cluster={id:'cluster-a',ref:'summary-fixture',inventoryRef:'cluster-a',url:workspace.api_url,internalUrl:origin,approvedAddresses:['127.0.0.1'],publishableKey:input.publishableKey};
 const binding=tenantSummaryBinding(cluster),iat=Math.floor(Date.now()/1000),exp=iat+600,credentialId=randomUUID();
 await db.query('INSERT INTO private.tenant_summary_authority VALUES(true,$1,$2)',[cluster.id,binding.bindingHash]);
 await db.query('INSERT INTO private.tenant_summary_credentials(id,cluster_id,binding_sha256,not_before,expires_at,revoked_at) VALUES($1,$2,$3,to_timestamp($4),to_timestamp($5),null)',[credentialId,cluster.id,binding.bindingHash,iat,exp]);
 const body=[{alg:'HS256',typ:'JWT'},{role:'roomqc_tenant_summary',iss:'roomqc-tenant-summary/v1',aud:'authenticated',jti:credentialId,
  cluster_id:cluster.id,binding_sha256:binding.bindingHash,iat,exp}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const credential={version:1,clusterId:cluster.id,bindingSha256:binding.bindingHash,publishableKey:input.publishableKey,
  token:body+'.'+createHmac('sha256',input.jwtSecret).update(body).digest('base64url')};
 const config={allowLocal:true,inventory:new Map([[cluster.id,cluster]])};
 const snapshot=async()=>JSON.stringify((await db.query(`SELECT (SELECT jsonb_agg(t ORDER BY id) FROM public.tenants t) AS tenants,
  (SELECT jsonb_agg(u ORDER BY id) FROM public.users u) AS users,(SELECT jsonb_agg(r ORDER BY id) FROM public.rooms r) AS rooms,
  (SELECT jsonb_agg(w ORDER BY workspace_id) FROM private.workspace_provisioning w) AS receipts`)).rows);
 const before=await snapshot();
 const result=await readTenantSummary(config,cluster,workspace,{loadCredential:async()=>credential});
 check('real gateway through Kong/PostgREST returns exact tenant',result.tenant.id===workspace.tenant_id&&result.tenant.name==='Summary full-schema tenant');
 const count=(await db.query(`SELECT (SELECT count(*)::int FROM public.hotels WHERE tenant_id=$1) AS hotels,
  (SELECT count(*)::int FROM public.users WHERE tenant_id=$1 AND deleted_at IS NULL) AS staff,
  (SELECT count(*)::int FROM public.rooms r JOIN public.hotels h ON h.id=r.hotel_id WHERE h.tenant_id=$1) AS rooms`,[workspace.tenant_id])).rows[0];
 check('all counts match actual provisioned business rows',result.tenant.hotelCount===count.hotels&&result.tenant.staffCount===count.staff&&result.tenant.roomCount===count.rooms);
 const payload={p_workspace_id:workspace.id,p_tenant_id:workspace.tenant_id,p_owner_id:workspace.owner_id,p_hotel_id:workspace.hotel_id};
 const denied=await call('/rest/v1/rpc/tenant_summary',credential.token,{...payload,p_tenant_id:randomUUID()},{'Content-Profile':'roomqc_summary'});
 check('cross tenant receipt mismatch denied',denied.status===400);
 for(const [label,token]of [['owner',login.data.access_token],['service',input.serviceKey],['anon',input.publishableKey]]){
  const r=await call('/rest/v1/rpc/tenant_summary',token,payload,{'Content-Profile':'roomqc_summary'});check(label+' cannot invoke summary capability',r.status>=400);
 }
 await db.query('UPDATE private.tenant_summary_credentials SET revoked_at=now() WHERE id=$1',[credentialId]);
 await assert.rejects(readTenantSummary(config,cluster,workspace,{loadCredential:async()=>credential}),{code:'TENANT_SUMMARY_CREDENTIAL_DENIED'});check('live credential revocation denied');
 check('business data and receipt unchanged by summary reads',before===await snapshot());
 check('credential runtime rows do not change schema fingerprint',beforeSchema===(await db.query('SELECT private.roomqc_schema_fingerprint() AS hash')).rows[0].hash);
 for(const [label,sql]of [
  ['summary schema ACL', 'GRANT USAGE ON SCHEMA roomqc_summary TO authenticated'],
  ['summary function ACL','GRANT EXECUTE ON FUNCTION roomqc_summary.tenant_summary(uuid,uuid,uuid,uuid) TO authenticated'],
  ['summary search path','ALTER FUNCTION roomqc_summary.tenant_summary(uuid,uuid,uuid,uuid) SET search_path=public'],
  ['summary role attributes','ALTER ROLE roomqc_tenant_summary INHERIT'],
 ]){
  await db.query('BEGIN');try{await db.query(sql);check(label+' drift changes attestation',beforeSchema!==(await db.query('SELECT private.roomqc_schema_fingerprint() AS hash')).rows[0].hash)}finally{await db.query('ROLLBACK')}
  check(label+' rollback restores attestation',beforeSchema===(await db.query('SELECT private.roomqc_schema_fingerprint() AS hash')).rows[0].hash);
 }
 const grants=(await db.query(`SELECT has_schema_privilege('roomqc_tenant_summary','public','USAGE') AS public_usage,
  (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','private','auth','storage')
  AND c.relkind IN('r','p','v','m') AND (has_table_privilege('roomqc_tenant_summary',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  OR has_any_column_privilege('roomqc_tenant_summary',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) AS tables,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN('pg_catalog','information_schema')
  AND has_schema_privilege('roomqc_tenant_summary',n.oid,'USAGE') AND has_function_privilege('roomqc_tenant_summary',p.oid,'EXECUTE')) AS functions`)).rows[0];
 check('actual schema summary role has no business table rights and exactly one application RPC',!grants.public_usage&&grants.tables===0&&grants.functions===1);
 const businessBeforeMaintenance=await snapshot();
 checks.push(...await runSummaryCredentialChecks({db,input,cluster,binding}));
 check('credential lifecycle does not modify tenant staff room or provision receipt',businessBeforeMaintenance===await snapshot());
 check('temporary maintenance login cleanup restores schema attestation',beforeSchema===(await db.query('SELECT private.roomqc_schema_fingerprint() AS hash')).rows[0].hash);
 const owner={id:user.data.id,sessionId:session};
 console.log(JSON.stringify({verified:true,checks,containsSecrets:false,owner}));
}finally{await db.end()}
