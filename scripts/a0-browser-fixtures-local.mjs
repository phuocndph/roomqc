// Disposable browser acceptance fixtures ONLY. All identities are @example.invalid
// on a verified loopback Supabase; never use this known test password elsewhere.
// Run `node scripts/a0-browser-fixtures-local.mjs cleanup` after the browser run.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { boundedFetch } from './lib/customer-journey-checks.mjs';

const file=new URL('../artifacts/a0-browser-fixtures.local',import.meta.url);
const raw=process.platform==='win32'
  ?execFileSync('cmd.exe',['/d','/s','/c','npx --no-install supabase status --output json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000})
  :execFileSync('npx',['--no-install','supabase','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000});
const local=JSON.parse(raw.slice(raw.indexOf('{')));
const loopback=url=>['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname);
assert.ok(loopback(local.API_URL)&&loopback(local.DB_URL),'Only local Supabase');
const project=(await readFile(new URL('../supabase/config.toml',import.meta.url),'utf8')).match(/^project_id\s*=\s*"([a-z0-9_-]+)"/m)?.[1];
assert.ok(project);
const env=kind=>JSON.parse(execFileSync('docker',['inspect',`supabase_${kind}_${project}`],{encoding:'utf8',timeout:15000}))[0].Config.Env;
assert.ok(env('edge_runtime').includes('ROOMQC_EMAIL_PROVIDER=mailpit'),'Mailpit only');
assert.ok(env('auth').some(v=>/^GOTRUE_SMTP_HOST=.*inbucket/.test(v)),'Local Auth SMTP only');
const mailUrl=new URL(local.INBUCKET_URL||local.MAILPIT_URL||'http://127.0.0.1:54324').origin;
assert.ok(loopback(mailUrl));
const fetch=boundedFetch();
const opts={auth:{persistSession:false,autoRefreshToken:false},global:{fetch}};
const server=createClient(local.API_URL,local.SERVICE_ROLE_KEY,opts);
const data=result=>{assert.ifError(result.error);return result.data;};
let manifest;
const save=()=>writeFile(file,JSON.stringify(manifest,null,2));
if(process.argv[2]==='init') {
  try{await readFile(file);throw new Error('A0 fixtures already exist: cleanup first');}catch(e){if(e.code!=='ENOENT')throw e;}
  manifest={project,run:randomUUID().slice(0,8),created_at:new Date().toISOString(),users:[],tenants:[],accounts:{}};
  await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});await save();
  try {
    for(const role of ['owner','other','admin','staff']) {
      const email=`qc-a0-${manifest.run}-${role}@example.invalid`;
      const user=data(await server.auth.admin.createUser({email,password:'RoomQC-A0-Local-Only!2026',email_confirm:true})).user;
      manifest.users.push({id:user.id,email});await save();
      const workspace=data(await server.rpc('provision_workspace_registration',{
        p_workspace_id:randomUUID(),p_owner_id:user.id,p_fields:{fullName:`A0 ${role}`,phone:'0901234567',
          tenantName:`A0 ${manifest.run} ${role}`,hotelName:`A0 ${manifest.run} ${role}`,hotelAddress:'123 Test Road',
          hotelPhone:'0281234567',hotelEmail:email,totalRooms:3},
      }));
      assert.ok(workspace.success);manifest.tenants.push(workspace.tenant_id);
      manifest.accounts[role]={user_id:user.id,tenant_id:workspace.tenant_id,hotel_id:workspace.hotel_id,email};await save();
      if(role==='admin') {
        data(await server.from('user_roles').insert({user_id:user.id,role:'super_admin'}));
        data(await server.from('users').update({is_super_admin:true,user_level_code:'super_admin'}).eq('id',user.id));
      }
      if(role==='staff') {
        data(await server.from('user_roles').delete().eq('user_id',user.id).eq('role','owner'));
        data(await server.from('user_roles').insert({user_id:user.id,role:'staff'}));
        const owner=manifest.accounts.owner;
        data(await server.from('users').update({user_level_code:'staff',is_primary_owner:false,
          tenant_id:owner.tenant_id,hotel_id:owner.hotel_id,created_by:owner.user_id}).eq('id',user.id));
        manifest.accounts.staff.tenant_id=owner.tenant_id;manifest.accounts.staff.hotel_id=owner.hotel_id;await save();
      }
    }
    // One stable fixture tenant with >25 rows makes pagination testable in UI.
    const tenant=manifest.accounts.other.tenant_id;
    for(let n=0;n<27;n++) {
      const invoice=data(await server.from('invoices').insert({tenant_id:tenant,invoice_number:`A0-${manifest.run}-${n}`,
        due_date:'2026-10-20',period_start:'2026-10-17',period_end:'2026-11-17',total_amount:50000}).select('id').single());
      data(await server.from('payment_transactions').insert({tenant_id:tenant,invoice_id:invoice.id,amount:50000,
        created_at:n===26?'2020-01-01T00:00:00Z':new Date().toISOString(),metadata:{type:'extend'}}));
    }
    console.log(JSON.stringify({run:manifest.run,accounts:manifest.accounts}));
  } catch(e) {console.error('Fixture preparation failed; run cleanup for the saved IDs.');throw e;}
} else if(['inspect-owner','revoke-owner','lock-admin','unlock-admin'].includes(process.argv[2])) {
  manifest=JSON.parse(await readFile(file,'utf8'));assert.equal(manifest.project,project);
  const action=process.argv[2];
  const account=manifest.accounts[action.includes('admin')?'admin':'owner'];
  assert.ok(manifest.users.some(u=>u.id===account.user_id&&u.email===account.email));
  if(action==='inspect-owner') {
    const payments=data(await server.from('payment_transactions').select('id,invoice_id,amount,payment_status')
      .eq('tenant_id',account.tenant_id));
    console.log(JSON.stringify({payments,tenant:data(await server.from('tenants')
      .select('registered_rooms,subscription_status,subscription_end_date').eq('id',account.tenant_id).single())}));
  } else if(action==='revoke-owner') {
    const client=createClient(local.API_URL,local.ANON_KEY,opts);
    const session=data(await client.auth.signInWithPassword({email:account.email,password:'RoomQC-A0-Local-Only!2026'})).session;
    assert.ok(session);data(await server.auth.admin.signOut(session.access_token,'global'));
    console.log('Only fixture owner sessions revoked; no credentials logged.');
  } else {
    data(await server.from('users').update({account_locked:action==='lock-admin'}).eq('id',account.user_id));
    console.log('Only fixture admin lock updated.');
  }
} else if(process.argv[2]==='verify-cancel') {
  manifest=JSON.parse(await readFile(file,'utf8'));assert.equal(manifest.project,project);
  const clients={};
  try {
    for(const role of ['owner','other','admin','staff']) {
      const account=manifest.accounts[role];
      assert.ok(account.email===`qc-a0-${manifest.run}-${role}@example.invalid`);
      const client=createClient(local.API_URL,local.ANON_KEY,opts);clients[role]=client;
      data(await client.auth.signInWithPassword({email:account.email,password:'RoomQC-A0-Local-Only!2026'}));
      const result=await client.rpc('admin_subscription_reconciliation',{p_tenant_id:manifest.accounts.owner.tenant_id});
      if(role==='admin') assert.ifError(result.error);
      else assert.equal(result.error?.code,'42501');
    }
    const tenant=manifest.accounts.owner.tenant_id;
    const before=data(await server.from('tenants').select('*').eq('id',tenant).single());
    const pending=data(await server.from('payment_transactions').select('id,amount,metadata').eq('tenant_id',tenant).eq('payment_status','pending'));
    assert.equal(pending.length,1,'Browser workflow must leave exactly one pending draft');
    assert.equal(pending[0].amount,90000);
    assert.equal((await clients.other.rpc('cancel_subscription_payment',{p_payment_id:pending[0].id})).error?.code,'42501');
    data(await clients.owner.rpc('cancel_subscription_payment',{p_payment_id:pending[0].id}));
    const after=data(await server.from('tenants').select('*').eq('id',tenant).single());
    assert.deepEqual(after,before,'Draft cancellation must not change entitlements');
    assert.equal(data(await server.from('payment_transactions').select('id').eq('tenant_id',tenant).eq('payment_status','pending')).length,0);
    console.log('Four fixture-role RPC checks, single 90,000 VND browser draft, foreign cancellation denial and owner API cancellation verified; entitlements unchanged.');
  } finally {
    for(const client of Object.values(clients)) data(await client.auth.signOut({scope:'local'}));
  }
} else if(process.argv[2]==='cleanup') {
  manifest=JSON.parse(await readFile(file,'utf8'));assert.equal(manifest.project,project);
  assert.ok(manifest.users.every(u=>u.email.startsWith(`qc-a0-${manifest.run}-`)&&u.email.endsWith('@example.invalid')));
  const failures=[];
  // Queue payloads do not cascade with email_deliveries. Remove only messages
  // tied to this manifest's tenant delivery IDs before deleting fixture tenants.
  const deliveryIds=data(await server.from('email_deliveries').select('id').in('tenant_id',manifest.tenants)).map(row=>row.id);
  if(deliveryIds.length) {
    assert.ok(deliveryIds.every(id=>/^[0-9a-f-]{36}$/.test(id)));
    execFileSync('docker',['exec','-i',`supabase_db_${project}`,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1','-q'],{
      input:`DELETE FROM pgmq.q_transactional_emails WHERE message->>'delivery_id' IN (${deliveryIds.map(id=>`'${id}'`).join(',')});`,
      encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000,
    });
  }
  for(const user of manifest.users)try{
    // Ban blocks strict live-user checks during cleanup. It does not by itself
    // revoke every JWT; user deletion removes sessions, and sensitive RPCs check
    // the live user/session. Never treat this as universal access-token revocation.
    data(await server.auth.admin.updateUserById(user.id,{ban_duration:'876000h'}));
  }catch{failures.push('ban');}
  for(const id of manifest.tenants)try{data(await server.from('tenants').delete().eq('id',id));}catch{failures.push('tenant');}
  for(const user of manifest.users)try{data(await server.auth.admin.deleteUser(user.id));}catch{failures.push('user');}
  for(const user of manifest.users)try{
    const response=await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${user.email}`)}`);assert.ok(response.ok);
    for(const message of ((await response.json()).messages||[]).filter(m=>m.To?.some(to=>to.Address===user.email)))
      assert.ok((await fetch(`${mailUrl}/api/v1/messages`,{method:'DELETE',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({IDs:[message.ID]})})).ok);
    const verify=await server.auth.admin.getUserById(user.id);assert.equal(verify.error?.status,404);
  }catch{failures.push('verify user/mail');}
  for(const id of manifest.tenants)try{assert.equal(data(await server.from('tenants').select('id').eq('id',id)).length,0);}catch{failures.push('verify tenant');}
  assert.equal(failures.length,0,'Fixture cleanup must finish before removing manifest');
  await unlink(file);console.log('Only identified A0 fixture tenants/users/mail removed and absence verified.');
} else throw new Error('Use init, inspect-owner, revoke-owner, lock-admin, unlock-admin, verify-cancel or cleanup');
