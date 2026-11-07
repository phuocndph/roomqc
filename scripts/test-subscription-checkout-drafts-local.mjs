// Non-payable drafts only. No bank, provider key, email to Internet, payment
// confirmation or entitlement activation. Loopback fixtures are removed by ID.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { assertDatabaseDenied, boundedFetch, withDeadline } from './lib/customer-journey-checks.mjs';
import { readLocalSupabaseStatus } from './lib/local-supabase-status.mjs';

const local = readLocalSupabaseStatus();
const loopback = url => ['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname);
assert.ok(loopback(local.API_URL)&&loopback(local.DB_URL),'Loopback only');
const projectId = (await readFile(new URL('../supabase/config.toml',import.meta.url),'utf8')).match(/^project_id\s*=\s*"([a-z0-9_-]+)"/m)?.[1];
assert.ok(projectId);
const env = kind => JSON.parse(execFileSync('docker',['inspect',`supabase_${kind}_${projectId}`],
  {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000}))[0].Config.Env;
assert.ok(env('edge_runtime').includes('ROOMQC_EMAIL_PROVIDER=mailpit'),'Local business SMTP required');
assert.ok(env('auth').some(v=>/^GOTRUE_SMTP_HOST=.*inbucket/.test(v)),'Local Auth SMTP required');
const mailUrl = new URL(local.INBUCKET_URL||local.MAILPIT_URL||'http://127.0.0.1:54324').origin;
assert.ok(loopback(mailUrl));
const fetch = boundedFetch();
const options = {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch}};
const admin = createClient(local.API_URL,local.SERVICE_ROLE_KEY,options);
const anon = createClient(local.API_URL,local.ANON_KEY,options);
const { Pool } = createRequire(new URL('../server/control/package.json',import.meta.url))('pg');
const db = new Pool({connectionString:local.DB_URL,max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,statement_timeout:8000});
db.on('error',()=>{console.error('Local draft database connection failed');process.exitCode=1;});
const users=[],tenants=[],clients=[],emails=[];
let checks=0;
const ok = (value,label)=>{assert.ok(value,label);checks++;console.log(`PASS ${label}`);};
const data = result=>{assert.ifError(result.error);return result.data;};
const denied = (result,code,message,label)=>{assertDatabaseDenied(result,code,label,message);ok(true,label);};
const quote = async (owner,extra={})=>data(await owner.client.rpc('create_subscription_quote',{
  p_request_id:randomUUID(),p_kind:'extend',p_rooms:3,p_duration_days:90,...extra,
}));
const create = (client,quoteId,requestId=randomUUID())=>client.rpc('create_subscription_checkout_draft',{
  p_quote_id:quoteId,p_request_id:requestId,
});
const get = (client,requestId)=>client.rpc('get_subscription_checkout_draft',{p_request_id:requestId});
const cancel = (owner,paymentId)=>owner.client.rpc('cancel_subscription_payment',{p_payment_id:paymentId});
const snapshot = async owner=>data(await admin.from('tenants').select('*').eq('id',owner.tenantId).single());
async function account() {
  const email=`qc-draft-${randomUUID()}@example.invalid`,password=`QC!${randomUUID()}a9`;
  const user=data(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;
  users.push(user.id);emails.push(email);
  const client=createClient(local.API_URL,local.ANON_KEY,options);clients.push(client);
  const session=data(await client.auth.signInWithPassword({email,password})).session;
  const provision=data(await admin.rpc('provision_workspace_registration',{
    p_workspace_id:randomUUID(),p_owner_id:user.id,p_fields:{fullName:'Draft fixture',phone:'0901234567',
      tenantName:'Draft fixture',hotelName:'Draft fixture',hotelAddress:'123 Test Road',hotelPhone:'0281234567',hotelEmail:email,totalRooms:3},
  }));
  assert.ok(provision.success);tenants.push(provision.tenant_id);
  return {client,userId:user.id,tenantId:provision.tenant_id,hotelId:provision.hotel_id,token:session.access_token,
    claims:JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString())};
}
async function counts(owner) {
  assert.ok(tenants.includes(owner.tenantId));
  return (await db.query(`SELECT
    (SELECT count(*) FROM public.invoices WHERE tenant_id=$1) AS invoices,
    (SELECT count(*) FROM public.payment_transactions WHERE tenant_id=$1) AS payments,
    (SELECT count(*) FROM private.subscription_checkout_drafts WHERE tenant_id=$1) AS drafts`,[owner.tenantId])).rows[0];
}
async function inTransaction(owner,prepare,action,role='authenticated') {
  const cx=await db.connect();
  try {
    await cx.query('BEGIN');await cx.query("SET LOCAL lock_timeout='2s'");
    await prepare(cx);
    await cx.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify(owner.claims)]);
    assert.ok(['authenticated','service_role'].includes(role));
    await cx.query(`SET LOCAL ROLE ${role}`);
    await action(cx);
  } finally {await cx.query('ROLLBACK');cx.release();}
}
try {
  await withDeadline(async()=>{
    const owner=await account(),other=await account(),before=await snapshot(owner),otherBefore=await snapshot(other);
    const q=await quote(owner),request=randomUUID();
    const results=await Promise.all(Array.from({length:20},()=>create(owner.client,q.quote_id,request)));
    const first=data(results[0]);results.forEach(result=>assert.deepEqual(data(result),first));
    ok(true,'20 concurrent requests return the same invoice, payment and draft');
    assert.deepEqual(await counts(owner),{invoices:'1',payments:'1',drafts:'1'});
    ok(true,'Exactly one invoice/payment/private binding is committed');
    ok(first.non_payable===true&&first.checkout_enabled===false&&first.invoice_status==='draft'&&first.payment_status==='pending',
      'Draft response is explicitly non-payable and checkout stays disabled');
    assert.deepEqual(first.quote,q);ok(true,'The draft uses the exact immutable server quote, not client amounts');
    const invoice=data(await admin.from('invoices').select('*').eq('id',first.invoice_id).single());
    const payment=data(await admin.from('payment_transactions').select('*').eq('id',first.payment_id).single());
    ok(invoice.total_amount===q.total_amount&&payment.amount===q.total_amount&&invoice.discount_amount===q.discount_amount
      &&invoice.subscription_plan_id===q.plan_id&&invoice.subscription_quote_id===q.quote_id,'Invoice and payment copy the server tariff snapshot');
    ok(invoice.period_start===q.period_start&&invoice.period_end===q.period_end&&invoice.created_by===owner.userId,
      'Invoice preserves quoted period and real actor');
    ok(invoice.invoice_number.startsWith('DRAFT-')&&invoice.paid_at===null&&payment.payment_method===null
      &&payment.transaction_reference===null&&payment.gateway_transaction_id===null&&payment.metadata.type==='quote_draft',
      'No bank, transfer reference, paid timestamp or activatable payment type is generated');
    assert.deepEqual(data(await get(owner.client,request)),first);ok(true,'Reload recovers the committed draft by request ID');
    assert.deepEqual(await snapshot(owner),before);ok(true,'Preparing a draft changes no tenant entitlement/profile field');
    denied(await create(other.client,q.quote_id),'PT404','QUOTE_NOT_FOUND','Another tenant cannot prepare an owner quote');
    denied(await get(other.client,request),'PT404','DRAFT_NOT_FOUND','Another tenant cannot read a draft by request ID');
    denied(await get(owner.client,randomUUID()),'PT404','DRAFT_NOT_FOUND','Unknown and cross-tenant draft IDs have identical errors');
    denied(await create(anon,q.quote_id),'42501',undefined,'Anonymous cannot create a draft');
    denied(await get(anon,request),'42501',undefined,'Anonymous cannot read a draft');
    denied(await create(admin,q.quote_id),'42501',undefined,'A service key alone cannot impersonate the owner');
    denied(await create(owner.client,null),'22023','DRAFT_INPUT_REQUIRED','Missing quote ID is rejected');
    denied(await create(owner.client,q.quote_id,null),'22023','DRAFT_INPUT_REQUIRED','Missing request ID is rejected');
    denied(await owner.client.rpc('create_subscription_checkout_draft',{p_quote_id:q.quote_id,p_request_id:randomUUID(),p_amount:1}),
      'PGRST202',undefined,'The API has no client-supplied price parameter');
    const second=await quote(owner);
    denied(await create(owner.client,second.quote_id,request),'PT409','DRAFT_REQUEST_CONFLICT','Same request ID cannot refer to a different quote');
    denied(await create(owner.client,q.quote_id),'PT409','QUOTE_ALREADY_HAS_DRAFT','One quote cannot create another invoice');
    denied(await create(owner.client,second.quote_id),'PT409','PENDING_SUBSCRIPTION_ORDER_EXISTS','A different quote cannot bypass an existing pending order');
    for (const patch of [{total_amount:1},{status:'paid',paid_at:new Date().toISOString()},{subscription_quote_id:null}]) {
      denied(await owner.client.from('invoices').update(patch).eq('id',first.invoice_id),'42501',undefined,
        `Browser cannot mutate protected draft invoice: ${Object.keys(patch).join(',')}`);
    }
    denied(await owner.client.from('invoices').delete().eq('id',first.invoice_id),'42501',undefined,'Browser cannot delete a protected draft invoice');
    denied(await owner.client.from('invoices').insert({...invoice,id:randomUUID(),invoice_number:`DRAFT-${randomUUID()}`}),
      '42501',undefined,'Browser cannot attach a quote to a forged invoice');
    denied(await admin.rpc('settle_subscription_payment',{p_payment_id:first.payment_id}),'PT409','SUBSCRIPTION_DRAFT_NOT_PAYABLE',
      'Even trusted manual settlement cannot activate a quote_draft');
    denied(await admin.rpc('settle_subscription_payment',{p_payment_id:first.payment_id,p_gateway_transaction_id:`fixture-${randomUUID()}`}),
      'PT409','SUBSCRIPTION_DRAFT_NOT_PAYABLE','Gateway settlement rejects a non-payable draft');
    assert.deepEqual(await snapshot(owner),before);ok(true,'Denied settlement leaves the complete tenant unchanged');
    assert.deepEqual(data(await get(owner.client,request)),first);ok(true,'Denied settlement and browser edits preserve invoice/payment status');
    data(await admin.from('users').update({account_locked:true}).eq('id',owner.userId));
    denied(await create(owner.client,q.quote_id,request),'42501','ACTIVE_SUBSCRIPTION_OWNER_REQUIRED','A locked owner cannot replay creation');
    denied(await get(owner.client,request),'42501','ACTIVE_SUBSCRIPTION_OWNER_REQUIRED','A locked owner cannot read old drafts');
    denied(await cancel(owner,first.payment_id),'42501',undefined,'A locked owner cannot cancel the server draft');
    data(await admin.from('users').update({account_locked:false}).eq('id',owner.userId));
    data(await admin.from('user_roles').delete().eq('user_id',owner.userId).eq('role','owner'));
    denied(await cancel(owner,first.payment_id),'42501',undefined,'An account without its live owner role cannot cancel a server draft');
    data(await admin.from('user_roles').insert({user_id:owner.userId,role:'owner'}));
    data(await cancel(owner,first.payment_id));
    const cancelled=data(await create(owner.client,q.quote_id,request));
    ok(cancelled.draft_id===first.draft_id&&cancelled.invoice_status==='cancelled'&&cancelled.payment_status==='failed',
      'Replay after cancellation reports the cancelled draft without recreating it');
    assert.deepEqual(await counts(owner),{invoices:'1',payments:'1',drafts:'1'});ok(true,'Cancellation/replay creates no additional rows');
    const baseline=await counts(owner);
    const old=await quote(owner);
    await db.query("UPDATE private.subscription_quotes SET created_at=now()-interval '16 minutes' WHERE id=$1 AND tenant_id=$2",[old.quote_id,owner.tenantId]);
    denied(await create(owner.client,old.quote_id),'PT409','QUOTE_EXPIRED','A stale technical preview cannot create a new draft');
    const changed=await quote(owner);
    await db.query('UPDATE public.tenants SET registered_rooms=4 WHERE id=$1',[owner.tenantId]);
    denied(await create(owner.client,changed.quote_id),'PT409','QUOTE_SUBSCRIPTION_CHANGED','A purchased room change invalidates the earlier quote');
    await db.query('UPDATE public.tenants SET registered_rooms=$1 WHERE id=$2',[before.registered_rooms,owner.tenantId]);
    const changedPrice=await quote(owner);
    for (const [field,value] of [['price_per_room_daily',1001],['max_rooms',99],['min_subscription_days',180],['is_active',false]]) {
      await inTransaction(owner,cx=>cx.query(`UPDATE public.subscription_plans SET ${field}=$1 WHERE id=$2`,[value,changedPrice.plan_id]),async cx=>{
        await assert.rejects(cx.query('SELECT public.create_subscription_checkout_draft($1,$2)',[changedPrice.quote_id,randomUUID()]),
          error=>error.code==='PT409'&&error.message==='QUOTE_PRICE_CHANGED');
      });
      ok(true,`Uncommitted server ${field} change is detected without repricing silently`);
    }
    const rollback=await quote(owner);
    await inTransaction(owner,async cx=>{
      await cx.query(`CREATE FUNCTION pg_temp.fail_qc_draft_payment() RETURNS trigger LANGUAGE plpgsql AS $f$
        BEGIN RAISE EXCEPTION 'QC_DRAFT_INJECTED_FAILURE' USING ERRCODE='23514'; END; $f$`);
      await cx.query(`CREATE TRIGGER qc_test_draft_insert_failure BEFORE INSERT ON public.payment_transactions
        FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_qc_draft_payment()`);
    },async cx=>{
      await assert.rejects(cx.query('SELECT public.create_subscription_checkout_draft($1,$2)',[rollback.quote_id,randomUUID()]),
        error=>error.code==='23514'&&error.message==='QC_DRAFT_INJECTED_FAILURE');
    });
    assert.deepEqual(await counts(owner),baseline);ok(true,'A payment insert failure rolls back the preceding invoice and private binding');
    const pending=data(await admin.from('invoices').insert({tenant_id:owner.tenantId,invoice_number:`LEGACY-${randomUUID()}`,
      due_date:'2099-01-01',period_start:'2026-01-01',period_end:'2026-01-31',status:'sent'}).select('id').single());
    denied(await create(owner.client,rollback.quote_id),'PT409','PENDING_SUBSCRIPTION_ORDER_EXISTS','An existing legacy sent invoice blocks a second order');
    data(await admin.from('invoices').delete().eq('id',pending.id));
    const p=data(await admin.from('payment_transactions').insert({tenant_id:owner.tenantId,amount:1,payment_status:'pending',
      metadata:{type:'extend',rooms:3,duration_days:30}}).select('id').single());
    denied(await create(owner.client,rollback.quote_id),'PT409','PENDING_SUBSCRIPTION_ORDER_EXISTS','A legacy pending payment without an invoice also blocks duplication');
    data(await admin.from('payment_transactions').delete().eq('id',p.id));
    const tooSmall=await quote(owner);
    data(await admin.from('rooms').insert([1,2,3,4].map(n=>({tenant_id:owner.tenantId,hotel_id:owner.hotelId,room_number:`D${n}`,
      floor:1,room_type:'standard',status:'vacant_clean',base_price:100000}))));
    denied(await create(owner.client,tooSmall.quote_id),'22023','DRAFT_ROOM_LIMIT_INVALID','Rooms added after the quote cannot exceed the quoted target');
    const plan=data(await admin.from('subscription_plans').select('id').eq('code','standard').single());
    await db.query("UPDATE public.tenants SET subscription_plan_id=$1,registered_rooms=10,subscription_status='active',subscription_end_date=current_date+12 WHERE id=$2",[plan.id,owner.tenantId]);
    const roomChange=await quote(owner,{p_rooms:11});
    denied(await create(owner.client,roomChange.quote_id),'PT409','ACTIVE_PERIOD_ROOM_CHANGE_REQUIRES_REVIEW',
      'A paid-period room-count change waits for an explicit business policy');
    const active=await quote(owner,{p_rooms:10});
    const activeDraft=data(await create(owner.client,active.quote_id));
    ok(activeDraft.quote.target_rooms===10,'Same-capacity active renewal can be prepared without activating it');
    data(await cancel(owner,activeDraft.payment_id));
    const add=await quote(owner,{p_kind:'add_rooms',p_rooms:2,p_duration_days:null});
    const addBefore=await snapshot(owner),addDraft=data(await create(owner.client,add.quote_id));
    ok(addDraft.quote.total_amount===24000&&addDraft.quote.target_rooms===12,'A paid add-on draft preserves server prorating');
    assert.deepEqual(await snapshot(owner),addBefore);ok(true,'Preparing an add-on does not grant its extra rooms');
    data(await cancel(owner,addDraft.payment_id));
    const raceQuotes=await Promise.all([quote(owner,{p_rooms:10}),quote(owner,{p_rooms:10,p_duration_days:30})]);
    const countBeforeRace=await counts(owner);
    const race=await Promise.all(raceQuotes.map(value=>create(owner.client,value.quote_id)));
    ok(race.filter(value=>!value.error).length===1,'Two tabs with different valid quotes create only one pending draft');
    denied(race.find(value=>value.error),'PT409','PENDING_SUBSCRIPTION_ORDER_EXISTS','The losing tab receives a real pending-order conflict');
    const raceAfter=await counts(owner);
    ok(['invoices','payments','drafts'].every(key=>Number(raceAfter[key])===Number(countBeforeRace[key])+1),
      'The two-tab race commits exactly one row in each table');
    data(await cancel(owner,data(race.find(value=>!value.error)).payment_id));
    // Expiry targets ONLY this additional owned tenant. Never sweep unrelated
    // pending transactions on the shared local instance during an integration test.
    const expiryOwner=await account(),expiryBefore=await snapshot(expiryOwner);
    const expire=(client=admin,limit=100)=>client.rpc('expire_pending_subscription_payments',{
      p_limit:limit,p_tenant_id:expiryOwner.tenantId,
    });
    const fixture=async({invoiceStatus='sent',paymentStatus='pending',hours=26,noInvoice=false}={})=>{
      const inv=noInvoice?null:data(await admin.from('invoices').insert({tenant_id:expiryOwner.tenantId,
        invoice_number:`EXPIRY-${randomUUID()}`,due_date:'2099-01-01',period_start:'2026-01-01',period_end:'2026-01-31',
        status:invoiceStatus,paid_at:invoiceStatus==='paid'?new Date().toISOString():null,total_amount:100000}).select('id').single());
      const pay=data(await admin.from('payment_transactions').insert({tenant_id:expiryOwner.tenantId,invoice_id:inv?.id||null,
        amount:100000,payment_status:paymentStatus,payment_method:'bank_transfer',
        created_at:new Date(Date.now()-hours*3600000).toISOString(),metadata:{type:'extend',duration_days:30,rooms:3}}).select('id').single());
      return {invoiceId:inv?.id,paymentId:pay.id};
    };
    const states=async value=>({
      invoice:value.invoiceId?data(await admin.from('invoices').select('status,paid_at,total_amount').eq('id',value.invoiceId).single()):null,
      payment:data(await admin.from('payment_transactions').select('payment_status,amount').eq('id',value.paymentId).single()),
    });
    denied(await expire(owner.client),'42501',undefined,'An owner cannot invoke the expiry worker');
    denied(await expire(anon),'42501',undefined,'Anonymous cannot invoke the expiry worker');
    denied(await expire(admin,0),'22023','INVALID_EXPIRY_BATCH_LIMIT','The expiry batch limit is validated server-side');
    for(const invoiceStatus of ['draft','sent','overdue']){
      const f=await fixture({invoiceStatus}),result=data(await expire());
      const state=await states(f);
      ok(result.expired_count===1&&result.cancelled_invoices===1&&state.payment.payment_status==='expired'
        &&state.invoice.status==='cancelled',`Expiry atomically expires payment and cancels a ${invoiceStatus} invoice`);
    }
    const fresh=await fixture({hours:0}),freshBefore=await states(fresh);
    ok(data(await expire()).expired_count===0,'A fresh payment is not expired');
    assert.deepEqual(await states(fresh),freshBefore);ok(true,'Skipping fresh payments preserves invoice/payment values');
    // Retire this owned fresh fixture so a later quote draft is not blocked.
    data(await admin.from('payment_transactions').update({payment_status:'failed'}).eq('id',fresh.paymentId));
    data(await admin.from('invoices').update({status:'cancelled'}).eq('id',fresh.invoiceId));
    const paid=await fixture({invoiceStatus:'paid'}),paidBefore=await states(paid);
    ok(data(await expire()).expired_count===0,'A paid parent with inconsistent pending payment is left for reconciliation');
    assert.deepEqual(await states(paid),paidBefore);ok(true,'Expiry never cancels a paid invoice or hides its inconsistent pending row');
    data(await admin.from('payment_transactions').delete().eq('id',paid.paymentId));
    const noInvoice=await fixture({noInvoice:true});
    const unbound=data(await expire());
    ok(unbound.expired_count===1&&unbound.cancelled_invoices===0&&(await states(noInvoice)).payment.payment_status==='expired',
      'An old legacy pending payment without an invoice expires without inventing a cancellation');
    const shared=await fixture();
    const young=data(await admin.from('payment_transactions').insert({tenant_id:expiryOwner.tenantId,invoice_id:shared.invoiceId,
      amount:100000,payment_status:'pending',metadata:{type:'extend',duration_days:30,rooms:3}}).select('id').single());
    const sharedResult=data(await expire());
    ok(sharedResult.expired_count===1&&sharedResult.cancelled_invoices===0&&(await states(shared)).invoice.status==='sent',
      'A shared legacy invoice remains open while a newer pending payment exists');
    await db.query("UPDATE public.payment_transactions SET created_at=now()-interval '26 hours' WHERE id=$1",[young.id]);
    ok(data(await expire()).cancelled_invoices===1&&(await states(shared)).invoice.status==='cancelled',
      'The invoice cancels only after its last pending payment expires');
    const atomic=await fixture(),atomicBefore=await states(atomic);
    await inTransaction(expiryOwner,async cx=>{
      await cx.query(`CREATE FUNCTION pg_temp.fail_qc_expiry_invoice() RETURNS trigger LANGUAGE plpgsql AS $f$
        BEGIN RAISE EXCEPTION 'QC_EXPIRY_INJECTED_FAILURE' USING ERRCODE='23514'; END; $f$`);
      await cx.query(`CREATE TRIGGER qc_test_expiry_invoice_failure BEFORE UPDATE ON public.invoices
        FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_qc_expiry_invoice()`);
    },async cx=>{
      await assert.rejects(cx.query('SELECT public.expire_pending_subscription_payments($1,$2)',[100,expiryOwner.tenantId]),
        error=>error.code==='23514'&&error.message==='QC_EXPIRY_INJECTED_FAILURE');
    },'service_role');
    assert.deepEqual(await states(atomic),atomicBefore);ok(true,'An invoice expiry failure rolls back the payment expiry as well');
    data(await expire());
    const inflight=await fixture();
    const cx=await db.connect();let committed=false;
    try{
      await cx.query('BEGIN');
      await cx.query("UPDATE public.payment_transactions SET payment_status='completed',payment_date=now() WHERE id=$1",[inflight.paymentId]);
      await cx.query("UPDATE public.invoices SET status='paid',paid_at=now() WHERE id=$1",[inflight.invoiceId]);
      ok(data(await expire()).expired_count===0,'Expiry skips a row locked by an in-flight confirmation instead of waiting to overwrite it');
      await cx.query('COMMIT');committed=true;
    }finally{if(!committed)await cx.query('ROLLBACK');cx.release();}
    ok(data(await expire()).expired_count===0&&(await states(inflight)).payment.payment_status==='completed'
      &&(await states(inflight)).invoice.status==='paid','A committed confirmation remains completed/paid after another expiry sweep');
    await fixture();await fixture();
    const parallel=await Promise.all([expire(),expire()]);parallel.forEach(result=>assert.ifError(result.error));
    ok(parallel.reduce((sum,result)=>sum+result.data.expired_count,0)===2
      &&parallel.reduce((sum,result)=>sum+result.data.cancelled_invoices,0)===2,
      'Concurrent expiry workers apply each payment/invoice transition once');
    ok(data(await expire()).expired_count===0,'Expiry replay is idempotent');
    const draftToExpire=await quote(expiryOwner),draftRequest=randomUUID();
    const expiring=data(await create(expiryOwner.client,draftToExpire.quote_id,draftRequest));
    await db.query("UPDATE public.payment_transactions SET created_at=now()-interval '26 hours' WHERE id=$1",[expiring.payment_id]);
    data(await expire());
    const expiredDraft=data(await get(expiryOwner.client,draftRequest));
    ok(expiredDraft.invoice_status==='cancelled'&&expiredDraft.payment_status==='expired'&&expiredDraft.non_payable,
      'An old non-payable draft expires consistently without changing its protected quote');
    assert.deepEqual(await snapshot(expiryOwner),expiryBefore);ok(true,'All expiry scenarios change no tenant entitlement/profile field');
    // Cancellation must honor the parent and siblings, not just payment status.
    for (const marker of ['paid_status','paid_timestamp','completed_sibling']) {
      const row=await fixture({hours:0,invoiceStatus:marker==='paid_status'?'paid':'sent'});
      if(marker==='paid_timestamp') data(await admin.from('invoices').update({paid_at:new Date().toISOString()}).eq('id',row.invoiceId));
      if(marker==='completed_sibling') data(await admin.from('payment_transactions').insert({
        tenant_id:expiryOwner.tenantId,invoice_id:row.invoiceId,amount:100000,payment_status:'completed',
      }));
      const original=await states(row);
      denied(await cancel(expiryOwner,row.paymentId),'PT409','PAID_INVOICE_REQUIRES_RECONCILIATION',
        'Cancellation rejects paid invoice evidence: '+marker);
      assert.deepEqual(await states(row),original);ok(true,'Rejected cancellation preserves invoice and payment: '+marker);
    }
    const sharedCancel=await fixture({hours:0});
    const sibling=data(await admin.from('payment_transactions').insert({tenant_id:expiryOwner.tenantId,
      invoice_id:sharedCancel.invoiceId,amount:100000,payment_status:'pending'}).select('id').single());
    data(await cancel(expiryOwner,sharedCancel.paymentId));
    ok((await states(sharedCancel)).invoice.status==='sent','Cancelling one sibling keeps the invoice open');
    data(await cancel(expiryOwner,sibling.id));
    ok((await states(sharedCancel)).invoice.status==='cancelled','Cancelling the final sibling closes the unpaid invoice');
    ok(data(await cancel(expiryOwner,sibling.id)).already_cancelled,'Cancellation replay is idempotent');
    const concurrentCancel=await fixture({hours:0});
    const sibling2=data(await admin.from('payment_transactions').insert({tenant_id:expiryOwner.tenantId,
      invoice_id:concurrentCancel.invoiceId,amount:100000,payment_status:'pending'}).select('id').single());
    const cancelledSiblings=await Promise.all([cancel(expiryOwner,concurrentCancel.paymentId),cancel(expiryOwner,sibling2.id)]);
    cancelledSiblings.forEach(data);
    ok((await states(concurrentCancel)).invoice.status==='cancelled','Concurrent sibling cancellations finish consistently without deadlock');
    denied(await owner.client.from('payment_transactions').insert({tenant_id:owner.tenantId,amount:1,payment_status:'pending'}),
      '42501',undefined,'Browser cannot submit another client-priced pending payment');
    denied(await owner.client.from('invoices').insert({tenant_id:owner.tenantId,invoice_number:'UNTRUSTED-'+randomUUID(),
      due_date:'2099-01-01',period_start:'2026-01-01',period_end:'2026-01-31',total_amount:1}),
      '42501',undefined,'Browser cannot create an unquoted invoice');
    const legacy=await fixture({hours:0}),legacyState=await states(legacy);
    denied(await admin.rpc('settle_subscription_payment',{p_payment_id:legacy.paymentId}),
      'PT409','SUBSCRIPTION_LEGACY_ORDER_REQUIRES_REVIEW','Trusted legacy settlement requires reconciliation');
    denied(await admin.rpc('handle_successful_payment',{p_transaction_id:legacy.paymentId}),
      'PT409','SUBSCRIPTION_LEGACY_ORDER_REQUIRES_REVIEW','The older service-only activation entry point also fails closed');
    assert.deepEqual(await states(legacy),legacyState);ok(true,'Holding a legacy order does not edit its financial records');
    const completedReplay=data(await admin.from('payment_transactions').insert({
      tenant_id:expiryOwner.tenantId,amount:100000,payment_status:'completed',payment_date:new Date().toISOString(),
    }).select('id').single());
    const replays=await Promise.all(Array.from({length:20},()=>admin.rpc('settle_subscription_payment',{p_payment_id:completedReplay.id})));
    ok(replays.every(result=>!result.error&&result.data.already_processed===true),
      'Twenty replays of an already completed record acknowledge it without activating anything again');
    assert.deepEqual(await snapshot(expiryOwner),expiryBefore);ok(true,'Cancellation and rejected legacy activation never change entitlements');
    await db.query("UPDATE public.tenants SET subscription_status='suspended',is_read_only=true,read_only_reason='subscription_expired',subscription_end_date=current_date-1 WHERE id=$1",[owner.tenantId]);
    const readonly=await quote(owner,{p_rooms:10});
    denied(await create(owner.client,readonly.quote_id),'42501','TENANT_NOT_ELIGIBLE_FOR_DRAFT',
      'Read-only recovery is not silently bypassed by the draft foundation');
    const stale=createClient(local.API_URL,local.ANON_KEY,{...options,global:{fetch,headers:{Authorization:`Bearer ${owner.token}`}}});clients.push(stale);
    assert.ifError((await owner.client.auth.signOut()).error);
    denied(await create(stale,q.quote_id,request),'42501','ACTIVE_SUBSCRIPTION_OWNER_REQUIRED','Logged-out JWT cannot replay a committed draft');
    denied(await get(stale,request),'42501','ACTIVE_SUBSCRIPTION_OWNER_REQUIRED','Logged-out JWT cannot retrieve a draft');
    assert.deepEqual(await snapshot(other),otherBefore);ok(true,'Another hotel retains its exact original tenant state');
    const permissions=await db.query(`SELECT
      has_table_privilege('authenticated','private.subscription_checkout_drafts','INSERT,UPDATE,DELETE,SELECT') AS browser,
      has_table_privilege('service_role','private.subscription_checkout_drafts','INSERT,UPDATE,DELETE,SELECT') AS service,
      has_function_privilege('anon','public.create_subscription_checkout_draft(uuid,uuid)','EXECUTE') AS anon`);
    ok(Object.values(permissions.rows[0]).every(value=>value===false),'Private draft bindings and creation expose no direct table or anonymous rights');
    const integrity=await db.query(`SELECT count(*) FROM private.subscription_checkout_drafts d
      JOIN public.invoices i ON i.id=d.invoice_id JOIN public.payment_transactions p ON p.id=d.payment_id
      WHERE d.tenant_id=$1 AND (i.tenant_id<>d.tenant_id OR p.tenant_id<>d.tenant_id OR p.invoice_id<>i.id
        OR i.subscription_quote_id<>d.quote_id OR i.total_amount<>p.amount OR i.paid_at IS NOT NULL OR p.payment_status='completed')`,[owner.tenantId]);
    ok(Number(integrity.rows[0].count)===0,'All committed draft bindings retain tenant/amount integrity and none are paid');
  },'local checkout draft suite',180000);
  console.log(`Subscription checkout drafts verified: ${checks} checks passed.`);
} finally {
  const failures=[];
  for(const client of clients)try{await withDeadline(async()=>assert.ifError((await client.auth.signOut()).error),'fixture signout',20000);}catch{failures.push('signout');}
  for(const id of tenants)try{await withDeadline(async()=>assert.ifError((await admin.from('tenants').delete().eq('id',id)).error),'fixture tenant cleanup',20000);}catch{failures.push('tenant');}
  for(const id of users)try{await withDeadline(async()=>assert.ifError((await admin.auth.admin.deleteUser(id)).error),'fixture user cleanup',20000);}catch{failures.push('user');}
  for(const email of emails)try{
    await withDeadline(async()=>{
      const response=await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);assert.ok(response.ok);
      for(const message of ((await response.json()).messages||[]).filter(m=>m.To?.some(to=>to.Address?.toLowerCase()===email)))
        assert.ok((await fetch(`${mailUrl}/api/v1/messages`,{method:'DELETE',
          headers:{'Content-Type':'application/json'},body:JSON.stringify({IDs:[message.ID]})})).ok);
      const verify=await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);assert.ok(verify.ok);
      assert.ok(!((await verify.json()).messages||[]).some(m=>m.To?.some(to=>to.Address?.toLowerCase()===email)));
    },'fixture captured mail cleanup',20000);
  }catch{failures.push('mail');}
  try{
    const rest=await db.query(`SELECT
      (SELECT count(*) FROM private.subscription_checkout_drafts WHERE tenant_id=ANY($1::uuid[])) AS drafts,
      (SELECT count(*) FROM private.subscription_quotes WHERE tenant_id=ANY($1::uuid[])) AS quotes,
      (SELECT count(*) FROM public.invoices WHERE tenant_id=ANY($1::uuid[])) AS invoices,
      (SELECT count(*) FROM public.payment_transactions WHERE tenant_id=ANY($1::uuid[])) AS payments,
      (SELECT count(*) FROM public.tenants WHERE id=ANY($1::uuid[])) AS tenants,
      (SELECT count(*) FROM auth.users WHERE id=ANY($2::uuid[])) AS users,
      (SELECT count(*) FROM auth.sessions WHERE user_id=ANY($2::uuid[])) AS sessions`,[tenants,users]);
    assert.ok(Object.values(rest.rows[0]).every(value=>Number(value)===0));
  }catch{failures.push('verification');}
  await db.end();
  if(failures.length){console.error(`Draft fixture cleanup failed: ${failures.join(', ')}`);process.exitCode=1;}
  else console.log('Only identified draft-test tenants, quotes, invoices, payments, accounts, sessions and mail removed/verified.');
}
