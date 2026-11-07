// Read-only diagnostics against identified loopback fixtures. No real provider,
// settlement, global expiry, live customer changes or external email.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { assertDatabaseDenied, boundedFetch, withDeadline } from './lib/customer-journey-checks.mjs';
import { readLocalSupabaseStatus } from './lib/local-supabase-status.mjs';

const local = readLocalSupabaseStatus();
const loopback = value => ['localhost','127.0.0.1','[::1]'].includes(new URL(value).hostname);
assert.ok(loopback(local.API_URL) && loopback(local.DB_URL));
const project = (await readFile(new URL('../supabase/config.toml',import.meta.url),'utf8')).match(/^project_id\s*=\s*"([a-z0-9_-]+)"/m)?.[1];
assert.ok(project);
const env = kind => JSON.parse(execFileSync('docker',['inspect',`supabase_${kind}_${project}`],{encoding:'utf8',timeout:15000}))[0].Config.Env;
assert.ok(env('edge_runtime').includes('ROOMQC_EMAIL_PROVIDER=mailpit'));
assert.ok(env('auth').some(v => /^GOTRUE_SMTP_HOST=.*inbucket/.test(v)));
const mailUrl = new URL(local.INBUCKET_URL || local.MAILPIT_URL || 'http://127.0.0.1:54324').origin;
assert.ok(loopback(mailUrl));
const fetch = boundedFetch();
const options = {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch}};
const server = createClient(local.API_URL,local.SERVICE_ROLE_KEY,options);
const anonymous = createClient(local.API_URL,local.ANON_KEY,options);
const users=[],tenants=[],clients=[],emails=[];
const anomalies=[];
let checks=0;
const data = result => {assert.ifError(result.error);return result.data;};
const ok = (value,label) => {assert.ok(value,label);checks++;console.log('PASS '+label);};
const denied = (result,code,label) => {assertDatabaseDenied(result,code,label);ok(true,label);};
const inspect = (client,tenant,extra={}) => client.rpc('admin_subscription_reconciliation',{p_tenant_id:tenant,...extra});
async function account() {
  const email=`qc-reconcile-${randomUUID()}@example.invalid`,password=`QC!${randomUUID()}a9`;
  const user=data(await server.auth.admin.createUser({email,password,email_confirm:true})).user;
  users.push(user.id);emails.push(email);
  const client=createClient(local.API_URL,local.ANON_KEY,options);clients.push(client);
  const session=data(await client.auth.signInWithPassword({email,password})).session;
  const workspace=data(await server.rpc('provision_workspace_registration',{
    p_workspace_id:randomUUID(),p_owner_id:user.id,p_fields:{fullName:'Reconciliation fixture',phone:'0901234567',
      tenantName:'Reconciliation fixture',hotelName:'Reconciliation fixture',hotelAddress:'123 Test Road',
      hotelPhone:'0281234567',hotelEmail:email,totalRooms:3},
  }));
  assert.ok(workspace.success);tenants.push(workspace.tenant_id);
  return {client,userId:user.id,tenantId:workspace.tenant_id,token:session.access_token};
}
async function invoice(tenant,status='draft',extra={}) {
  return data(await server.from('invoices').insert({tenant_id:tenant,invoice_number:`RECON-${randomUUID()}`,
    due_date:'2026-10-18',period_start:'2026-10-17',period_end:'2026-11-17',total_amount:50000,status,...extra}).select('*').single());
}
async function payment(tenant,invoiceId,extra={}) {
  return data(await server.from('payment_transactions').insert({tenant_id:tenant,invoice_id:invoiceId,amount:50000,
    metadata:{private_note:'Do not expose metadata'},...extra}).select('*').single());
}
async function snapshot(tenant) {
  return {
    tenant:data(await server.from('tenants').select('*').eq('id',tenant).single()),
    payments:data(await server.from('payment_transactions').select('*').eq('tenant_id',tenant).order('id')),
    invoices:data(await server.from('invoices').select('*').eq('tenant_id',tenant).order('id')),
  };
}
try {
  await withDeadline(async () => {
    const owner=await account(),other=await account(),support=await account();
    data(await server.from('user_roles').insert({user_id:support.userId,role:'super_admin'}));
    data(await server.from('users').update({is_super_admin:true}).eq('id',support.userId));
    const anomaly=data(await server.from('payment_anomalies').insert({tenant_id:owner.tenantId,
      anomaly_type:'unmatched',sepay_tx_id:`a0-${randomUUID()}`,sepay_amount:50000}).select('*').single());
    anomalies.push(anomaly.id);
    ok(data(await owner.client.from('payment_anomalies').select('id').eq('id',anomaly.id)).length===1,
      'Legacy owner history remains readable in own tenant');
    ok(data(await other.client.from('payment_anomalies').select('id').eq('id',anomaly.id)).length===0,
      'Legacy history is not visible to another tenant');
    ok(data(await support.client.from('payment_anomalies').select('id').eq('id',anomaly.id)).length===1,
      'Live support role can read legacy evidence');
    data(await server.from('users').update({account_locked:true}).eq('id',owner.userId));
    ok(data(await owner.client.from('payment_anomalies').select('id').eq('id',anomaly.id)).length===0,
      'Locked owner cannot read legacy evidence with an existing JWT');
    data(await server.from('users').update({account_locked:false}).eq('id',owner.userId));
    data(await server.from('user_roles').delete().eq('user_id',owner.userId).eq('role','owner'));
    ok(data(await owner.client.from('payment_anomalies').select('id').eq('id',anomaly.id)).length===0,
      'Removed owner role cannot read legacy evidence');
    data(await server.from('user_roles').insert({user_id:owner.userId,role:'owner'}));
    data(await server.auth.admin.updateUserById(owner.userId,{ban_duration:'1h'}));
    ok(data(await owner.client.from('payment_anomalies').select('id').eq('id',anomaly.id)).length===0,
      'Auth-banned owner cannot read legacy evidence');
    data(await server.auth.admin.updateUserById(owner.userId,{ban_duration:'none'}));
    for(const [actor,client] of [['owner',owner.client],['other tenant',other.client],['support browser',support.client],['anonymous',anonymous]]) {
      denied(await client.from('payment_anomalies').update({status:'resolved',sepay_amount:1}).eq('id',anomaly.id),
        '42501',`Legacy anomaly direct update denied for ${actor}`);
      denied(await client.from('payment_anomalies').delete().eq('id',anomaly.id),'42501',`Legacy anomaly delete denied for ${actor}`);
      denied(await client.from('payment_anomalies').insert({tenant_id:owner.tenantId,anomaly_type:'unmatched',
        sepay_tx_id:`denied-${randomUUID()}`,sepay_amount:1}),'42501',`Legacy anomaly insert denied for ${actor}`);
    }
    assert.deepEqual(data(await server.from('payment_anomalies').select('*').eq('id',anomaly.id).single()),anomaly);
    ok(true,'Denied legacy edits do not change source evidence or resolution');
    denied(await inspect(anonymous,owner.tenantId),'42501','Anonymous cannot inspect subscription queue');
    denied(await inspect(server,owner.tenantId),'42501','Service key alone cannot impersonate support session');
    denied(await inspect(owner.client,owner.tenantId),'42501','Owner cannot inspect even their own admin queue');
    denied(await inspect(other.client,owner.tenantId),'42501','Other tenant cannot inspect queue');
    denied(await inspect(owner.client,null,{p_filter:'bad'}),'42501','Authorization precedes parameter validation');
    const quote=data(await owner.client.rpc('create_subscription_quote',{p_request_id:randomUUID(),p_kind:'extend',p_rooms:3,p_duration_days:30}));
    const draft=data(await owner.client.rpc('create_subscription_checkout_draft',{p_request_id:randomUUID(),p_quote_id:quote.quote_id}));
    const clean=data(await inspect(support.client,owner.tenantId));
    ok(clean.rows.length===1 && clean.rows[0].flags.join(',')==='non_payable_draft','Fresh draft has only explicit non-payable flag');
    ok(data(await inspect(support.client,owner.tenantId,{p_filter:'attention'})).rows.length===0,'Routine fresh draft is not an anomaly');
    const ordinary=await invoice(owner.tenantId);
    const shared1=await payment(owner.tenantId,ordinary.id),shared2=await payment(owner.tenantId,ordinary.id);
    const paid=await invoice(owner.tenantId,'paid',{paid_at:new Date().toISOString()});
    const blocked=await payment(owner.tenantId,paid.id);
    const closed=await invoice(owner.tenantId,'cancelled');
    const closedPayment=await payment(owner.tenantId,closed.id);
    const unpaidCompleted=await payment(owner.tenantId,(await invoice(owner.tenantId)).id,{payment_status:'completed'});
    const mismatch=await payment(owner.tenantId,(await invoice(owner.tenantId)).id,{amount:1});
    const missing=await payment(owner.tenantId,null,{created_at:null});
    const stale=await payment(owner.tenantId,(await invoice(owner.tenantId)).id,{created_at:'2020-01-01T00:00:00Z'});
    const hidden=await invoice(other.tenantId,'sent',{notes:'Another tenant private invoice'});
    const crossed=await payment(owner.tenantId,hidden.id);
    const healthy=await payment(owner.tenantId,(await invoice(owner.tenantId,'paid')).id,{payment_status:'completed'});
    const siblingInvoice=await invoice(owner.tenantId);
    await payment(owner.tenantId,siblingInvoice.id,{payment_status:'completed'});
    const sibling=await payment(owner.tenantId,siblingInvoice.id);
    const invalid=await payment(owner.tenantId,(await invoice(owner.tenantId)).id,{amount:0,currency:'USD'});
    await payment(other.tenantId,hidden.id);
    const before=await snapshot(owner.tenantId),otherBefore=await snapshot(other.tenantId);
    const queue=data(await inspect(support.client,owner.tenantId,{p_limit:100}));
    const flags=id => queue.rows.find(row=>row.id===id)?.flags || [];
    ok(flags(shared1.id).includes('shared_pending_invoice') && flags(shared2.id).includes('shared_pending_invoice'),'Shared pending children are identified');
    ok(flags(shared1.id).includes('legacy_unverified'),'Legacy price is marked unverified');
    ok(flags(blocked.id).includes('paid_parent_pending'),'Pending against paid parent requires reconciliation');
    ok(flags(sibling.id).includes('paid_parent_pending'),'Completed sibling is detected despite unpaid parent status');
    ok(flags(closedPayment.id).includes('closed_parent_pending'),'Pending against cancelled parent is diagnosed');
    ok(flags(unpaidCompleted.id).includes('completed_invoice_unpaid'),'Completed transaction with unpaid invoice is visible');
    ok(flags(mismatch.id).includes('amount_mismatch'),'Amount difference is visible, not silently fixed');
    ok(flags(missing.id).includes('missing_invoice') && flags(missing.id).includes('missing_created_at'),'Missing invoice and timestamp remain visible');
    ok(flags(stale.id).includes('stale_pending'),'Old pending rows are diagnosed without running expiry');
    ok(flags(crossed.id).includes('invoice_tenant_mismatch'),'Cross-tenant invoice corruption is diagnosed');
    const crossedRow=queue.rows.find(row=>row.id===crossed.id);
    ok(crossedRow.invoice_number===null && crossedRow.invoice_status===null,'Foreign invoice contents are not projected');
    ok(flags(invalid.id).includes('invalid_payment_value'),'Invalid amount/currency needs verification');
    ok(!queue.rows.some(row=>row.id===healthy.id),'Ordinary completed payments are not added to queue');
    ok(queue.rows.every(row=>row.tenant_id===owner.tenantId),'Queue stays scoped to requested tenant');
    ok(queue.rows.every(row=>!('metadata' in row) && !('notes' in row) && !('gateway_transaction_id' in row)),'Response omits raw metadata, notes and provider payload');
    const legacy=data(await inspect(support.client,owner.tenantId,{p_filter:'legacy',p_limit:100}));
    ok(legacy.rows.length>0 && legacy.rows.every(row=>row.flags.includes('legacy_unverified')),'Legacy filter is applied on server');
    const old=data(await inspect(support.client,owner.tenantId,{p_filter:'stale'}));
    ok(old.rows.length===1 && old.rows[0].id===stale.id,'Stale filter is applied on server');
    // Timestamp ties and cursor boundaries: no OFFSET, repeated/lost rows.
    const sameTime='2026-01-02T00:00:00Z';
    for(let i=0;i<7;i++) await payment(owner.tenantId,ordinary.id,{created_at:sameTime});
    const expected=data(await inspect(support.client,owner.tenantId,{p_limit:100})).rows.map(row=>row.id);
    let cursor={},ids=[],pages=0;
    do {
      const page=data(await inspect(support.client,owner.tenantId,{p_limit:3,...cursor}));pages++;
      ok(page.rows.length<=3,'Server enforces page size '+pages);
      ids.push(...page.rows.map(row=>row.id));
      if(!page.has_more) {assert.equal(page.next_cursor,null);break;}
      assert.equal(page.next_cursor.id,page.rows.at(-1).id);
      cursor={p_before_created_at:page.next_cursor.created_at,p_before_id:page.next_cursor.id};
      assert.ok(pages<30);
    } while(true);
    assert.deepEqual(ids,expected);ok(true,'Keyset pages cover timestamp ties and null dates exactly once');
    // Remove page-only fixtures before read-only snapshot comparison.
    data(await server.from('payment_transactions').delete().eq('tenant_id',owner.tenantId).eq('created_at',sameTime));
    assert.deepEqual(await snapshot(owner.tenantId),before);ok(true,'Inspection changes no invoice, payment or entitlement field');
    assert.deepEqual(await snapshot(other.tenantId),otherBefore);ok(true,'Other tenant remains unchanged');
    for(const extra of [{p_filter:'bad'},{p_filter:null},{p_limit:0},{p_limit:101},{p_limit:null},
      {p_before_id:randomUUID()},{p_before_created_at:new Date().toISOString()}])
      denied(await inspect(support.client,owner.tenantId,extra),'22023','Invalid filter/limit/partial cursor is rejected');
    denied(await inspect(support.client,randomUUID()),'PT404','Missing tenant does not appear as empty success');
    data(await server.from('users').update({account_locked:true}).eq('id',support.userId));
    denied(await inspect(support.client,owner.tenantId),'42501','Locked admin loses queue access with existing JWT');
    ok(data(await support.client.from('payment_anomalies').select('id').eq('id',anomaly.id)).length===0,
      'Locked admin loses legacy read scope');
    data(await server.from('users').update({account_locked:false,status:'inactive'}).eq('id',support.userId));
    denied(await inspect(support.client,owner.tenantId),'42501','Inactive admin loses queue access');
    data(await server.from('users').update({status:'active',is_super_admin:false}).eq('id',support.userId));
    data(await server.from('user_roles').delete().eq('user_id',support.userId).eq('role','super_admin'));
    denied(await inspect(support.client,owner.tenantId),'42501','Removing live platform role invalidates access');
    ok(data(await support.client.from('payment_anomalies').select('id').eq('id',anomaly.id)).length===0,
      'Removed support role cannot read a foreign legacy tenant');
    data(await server.from('user_roles').insert({user_id:support.userId,role:'super_admin'}));
    data(await server.from('users').update({is_super_admin:true}).eq('id',support.userId));
    data(await server.auth.admin.updateUserById(support.userId,{ban_duration:'1h'}));
    denied(await inspect(support.client,owner.tenantId),'42501','Auth-banned admin cannot inspect with an existing JWT');
    data(await server.auth.admin.updateUserById(support.userId,{ban_duration:'none'}));
    const staleClient=createClient(local.API_URL,local.ANON_KEY,{...options,global:{fetch,headers:{Authorization:`Bearer ${support.token}`}}});
    data(await support.client.auth.signOut());
    denied(await inspect(staleClient,owner.tenantId),'42501','Logged-out admin token cannot inspect queue');
    ok(data(await staleClient.from('payment_anomalies').select('id').eq('id',anomaly.id)).length===0,
      'Logged-out admin token cannot read legacy evidence');
    ok(before.payments.find(row=>row.id===draft.payment_id)?.payment_status==='pending','Non-payable draft remains pending without activation');
  },'read-only subscription reconciliation suite',180000);
  console.log(`Subscription reconciliation verified: ${checks} checks passed.`);
} finally {
  const failures=[];
  for(const client of clients)try{assert.ifError((await client.auth.signOut()).error);}catch{failures.push('signout');}
  for(const id of anomalies)try{assert.ifError((await server.from('payment_anomalies').delete().eq('id',id)).error);}catch{failures.push('anomaly');}
  for(const id of tenants)try{assert.ifError((await server.from('tenants').delete().eq('id',id)).error);}catch{failures.push('tenant');}
  for(const id of users)try{assert.ifError((await server.auth.admin.deleteUser(id)).error);}catch{failures.push('user');}
  for(const email of emails)try{
    const response=await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);assert.ok(response.ok);
    for(const message of ((await response.json()).messages||[]).filter(m=>m.To?.some(to=>to.Address?.toLowerCase()===email)))
      assert.ok((await fetch(`${mailUrl}/api/v1/messages`,{method:'DELETE',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({IDs:[message.ID]})})).ok);
  }catch{failures.push('mail');}
  for(const id of tenants)try{assert.equal(data(await server.from('tenants').select('id').eq('id',id)).length,0);}catch{failures.push('verify tenant');}
  for(const id of anomalies)try{assert.equal(data(await server.from('payment_anomalies').select('id').eq('id',id)).length,0);}catch{failures.push('verify anomaly');}
  for(const id of users)try{const result=await server.auth.admin.getUserById(id);assert.equal(result.error?.status,404);}catch{failures.push('verify user');}
  if(failures.length){console.error('Fixture cleanup failed: '+failures.join(', '));process.exitCode=1;}
  else console.log('Only identified reconciliation fixtures and their captured mail removed and checked.');
}
