// Installer-only checks on the exact-owned full vendor sandbox. No external
// origin, provider, existing user or business database is accepted as input.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_ACCESS_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);assert.ok(input.publishableKey&&input.serviceKey&&input.databasePassword);
const origin='http://127.0.0.1:8000',checks=[];let phase='setup';
process.on('uncaughtExceptionMonitor',()=>process.stderr.write(JSON.stringify({event:'access_check_failed',phase,checks})+'\n'));
async function request(path,token,{body,method=body===undefined?'GET':'POST',headers={}}={}){
  const response=await fetch(origin+path,{method,signal:AbortSignal.timeout(5000),headers:{
    apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json',...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=null}
  return {status:response.status,data};
}
async function ok(name,path,token,options){const result=await request(path,token,options);
  assert.equal(result.status,200,name+' must succeed');checks.push(name);return result.data}
async function deny(name,path,token,options){const result=await request(path,token,options);
  if(![401,403].includes(result.status)||result.data?.code!=='42501')process.stderr.write(JSON.stringify({event:'access_permission_denial_mismatch',check:name,status:result.status,sqlstate:result.data?.code??null})+'\n');
  assert.ok([401,403].includes(result.status),name+' must be a real permission denial');
  assert.equal(result.data?.code,'42501',name+' must reach the permission boundary');checks.push(name);return result.data}
const rpc=(name,token,body={})=>ok(name,'/rest/v1/rpc/'+name,token,{body});
async function emailAction(label,token,status,body={action:'status'}){
  const response=await fetch('http://email-admin-test:9000/',{method:'POST',signal:AbortSignal.timeout(5000),
    headers:{authorization:'Bearer '+token,'content-type':'application/json',Origin:'http://127.0.0.1:8082'},body:JSON.stringify(body)});
  assert.ok((Array.isArray(status)?status:[status]).includes(response.status),'Actual Edge email handler '+label);const data=await response.json();
  if(status===200){assert.equal(data.provider,'disabled');assert.equal(data.enabled,false);assert.ok(Array.isArray(data.logs))}
  else{assert.equal(typeof data.error,'string');assert.ok(!('logs' in data))}
  assert.equal(response.headers.get('cache-control'),'no-store');checks.push('email-edge-'+label);
}
async function insert(table,body){const result=await request('/rest/v1/'+table,input.serviceKey,{body,headers:{Prefer:'return=representation'}});
  if(result.status!==201)process.stderr.write(JSON.stringify({event:'fixture_insert_rejected',table,status:result.status,
    code:result.data?.code,message:result.data?.message})+'\n');
  assert.equal(result.status,201,'Owned fixture insert '+table);assert.ok(result.data?.[0]?.id||table==='user_roles'||table==='user_hotels');return result.data?.[0]}
async function patchUser(user,body){const result=await request('/rest/v1/users?id=eq.'+user.id,input.serviceKey,{body,method:'PATCH',headers:{Prefer:'return=representation'}});
  assert.equal(result.status,200);assert.equal(result.data?.length,1);assert.equal(result.data[0].id,user.id)}
async function authUser(label){
  const email='access-'+input.run+'-'+label+'@roomqc.invalid',password=randomBytes(32).toString('hex');
  const user=await ok('create-auth-'+label,'/auth/v1/admin/users',input.serviceKey,{body:{email,password,email_confirm:true}});
  const session=await ok('login-'+label,'/auth/v1/token?grant_type=password',input.publishableKey,{body:{email,password}});
  assert.equal(session.user.id,user.id);const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url'));
  assert.ok(claims.session_id);return {id:user.id,email,password,token:session.access_token,sessionId:claims.session_id};
}
async function owner(label){const user=await authUser(label);
  const binding=await rpc('provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:user.id,
    p_fields:{fullName:'Owned access fixture',phone:'0901234567',tenantName:'Owned access fixture',hotelName:'Owned access fixture',
      hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:user.email,totalRooms:3}});
  assert.equal(binding.success,true,'Owned owner provisioning');return {...user,tenantId:binding.tenant_id,hotelId:binding.hotel_id};
}
async function staff(label,parent,{admin=false,role='staff',level='staff'}={}){const user=await authUser(label);
  await insert('users',{id:user.id,email:user.email,full_name:'Owned fixture '+label,tenant_id:parent.tenantId,hotel_id:parent.hotelId,
    role,user_level_code:admin?'super_admin':level,status:'active',created_by:parent.id,must_change_password:false,
    account_locked:false,is_super_admin:admin});
  await insert('user_roles',{user_id:user.id,role:admin?'super_admin':role});
  await insert('user_hotels',{user_id:user.id,hotel_id:parent.hotelId,assigned_by:parent.id});return {...user,tenantId:parent.tenantId,hotelId:parent.hotelId};
}
const a=await owner('owner-a'),b=await owner('owner-b'),assigned=await staff('assigned',a),unassigned=await staff('unassigned',a),
  admin=await staff('admin',a,{admin:true}),liveAdmin=await staff('live-admin',a,{admin:true}),
  manager=await staff('manager',a,{role:'department_manager',level:'department_manager'}),
  outsideManager=await staff('manager-no-hotel',a,{role:'department_manager',level:'department_manager'});
await patchUser(outsideManager,{hotel_id:null});
assert.equal((await request('/rest/v1/user_hotels?user_id=eq.'+outsideManager.id,input.serviceKey,{method:'DELETE'})).status,204);
phase='actors';
const setupPath='/rest/v1/rpc/get_hotel_room_setup',setupBody={p_hotel_id:a.hotelId};
const setup=await ok('room-owner-positive',setupPath,a.token,{body:setupBody});assert.equal(setup.hotel_id,a.hotelId);
await deny('room-other-tenant',setupPath,b.token,{body:setupBody});await deny('room-staff',setupPath,assigned.token,{body:setupBody});
const quote=await rpc('create_subscription_quote',a.token,{p_request_id:randomUUID(),p_kind:'extend',p_rooms:3,p_duration_days:30});
assert.ok(quote.quote_id);const quotePath='/rest/v1/rpc/get_subscription_quote',quoteBody={p_quote_id:quote.quote_id};
assert.equal((await ok('quote-owner-positive',quotePath,a.token,{body:quoteBody})).quote_id,quote.quote_id);
await deny('quote-staff',quotePath,assigned.token,{body:quoteBody});
assert.equal(await rpc('platform_support_actor',admin.token),admin.id);assert.equal(await rpc('email_admin_actor',admin.token),admin.id);
await deny('support-owner','/rest/v1/rpc/platform_support_actor',a.token,{body:{}});
await deny('email-owner','/rest/v1/rpc/email_admin_actor',a.token,{body:{}});
await emailAction('admin-positive',admin.token,200);await emailAction('owner',a.token,403);
await emailAction('anon',input.publishableKey,401);await emailAction('provider-disabled',admin.token,409,{action:'test',email:a.email});
for(const user of [a,admin]){
  // Same server SDK binding as email/admin.ts: apikey stays server-side, but
  // Authorization must remain the caller JWT rather than service_role.
  const client=createClient(origin,input.serviceKey,{auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:'Bearer '+user.token}}});
  const result=await client.rpc('email_admin_actor');
  if(user===admin){assert.equal(result.error,null);assert.equal(result.data,admin.id)}
  else{assert.equal(result.error?.code,'42501');assert.equal(result.data,null)}
  checks.push('email-sdk-caller-bound-'+(user===admin?'admin':'owner'));
}
for(const [label,value,restore] of [['locked',{account_locked:true},{account_locked:false}],
  ['deleted',{deleted_at:new Date().toISOString()},{deleted_at:null}],['inactive',{status:'inactive'},{status:'active'}],
  ['null-status',{status:null},{status:'active'}]]){
  await patchUser(a,value);await deny('room-'+label,setupPath,a.token,{body:setupBody});await deny('quote-'+label,quotePath,a.token,{body:quoteBody});
  await patchUser(a,restore);await patchUser(admin,value);
  await deny('support-'+label,'/rest/v1/rpc/platform_support_actor',admin.token,{body:{}});
  await deny('email-'+label,'/rest/v1/rpc/email_admin_actor',admin.token,{body:{}});
  await emailAction(label,admin.token,403);await patchUser(admin,restore);
}
phase='server-only';
for(const table of ['email_admin_actions','email_deliveries','email_provider_events']){
  await ok('service-'+table,'/rest/v1/'+table+'?select=*&limit=0',input.serviceKey);
  for(const [role,token] of [['anon',input.publishableKey],['owner',a.token]])await deny(role+'-'+table,'/rest/v1/'+table+'?select=*&limit=0',token);
}
for(const token of [input.publishableKey,a.token]){
  await deny('server-only-receipt','/rest/v1/rpc/get_workspace_provisioning',token,{body:{p_workspace_id:randomUUID()}});
  const result=await request('/rest/v1/hotel_room_setup?select=*&limit=0',token,{headers:{'Accept-Profile':'private'}});
  assert.equal(result.status,406);assert.equal(result.data?.code,'PGRST106');checks.push('private-schema-not-exposed');
}
phase='distribution';
const room=await insert('rooms',{tenant_id:a.tenantId,hotel_id:a.hotelId,room_number:'R4-101',floor:1,room_type:'standard',status:'vacant_clean',base_price:100000,max_guests:2});
const item=await insert('items',{tenant_id:a.tenantId,hotel_id:a.hotelId,code:'R4-ITEM',name:'Owned canary towel',unit:'piece',quantity_total:20,quantity_in_stock:20});
const payload={p_tenant_id:a.tenantId,p_hotel_id:a.hotelId,p_created_by:a.id,p_assigned_to:assigned.id,
  p_rooms:[{room_id:room.id,items:[{item_id:item.id,quantity:1}]}],p_notes:'Owned R4 fixture',p_auto_release:false,p_supplement_request_ids:null};
const order=await rpc('create_distribution_order',a.token,payload);assert.equal(order.success,true);assert.ok(order.order_id);
const detailPath='/rest/v1/rpc/get_distribution_order_detail',detailBody={p_order_id:order.order_id};
for(const [label,user] of [['owner',a],['assigned',assigned],['manager',manager]]){
  const detail=await ok('distribution-detail-'+label,detailPath,user.token,{body:detailBody});assert.equal(detail.id,order.order_id);assert.equal(detail.rooms.length,1);
}
for(const [label,user] of [['unassigned',unassigned],['other-tenant',b]]){
  assert.equal(await ok('distribution-detail-hidden-'+label,detailPath,user.token,{body:detailBody}),null);
  const rows=await ok('distribution-rest-hidden-'+label,'/rest/v1/distribution_orders?id=eq.'+order.order_id+'&select=id',user.token);assert.deepEqual(rows,[]);
}
const filter={p_tenant_id:a.tenantId,p_hotel_id:a.hotelId,p_status:null,p_assigned_to:null,p_floor:null,p_shift_date:null,p_shift_code:null,p_limit:25,p_offset:0};
for(const [label,user,expected] of [['owner',a,1],['manager',manager,1],['assigned',assigned,1],['unassigned',unassigned,0],['other-tenant',b,0]]){
  const rows=await ok('distribution-list-'+label,'/rest/v1/rpc/get_distribution_orders_filtered',user.token,{body:filter});assert.equal(rows.length,expected);
  const {p_limit,p_offset,...countFilter}=filter;
  assert.equal(await ok('distribution-count-'+label,'/rest/v1/rpc/get_distribution_orders_count',user.token,{body:countFilter}),expected);
}
await deny('distribution-staff-create','/rest/v1/rpc/create_distribution_order',unassigned.token,{body:{...payload,p_created_by:unassigned.id}});
const updatePath='/rest/v1/distribution_orders?id=eq.'+order.order_id;
const updated=await ok('distribution-assigned-update',updatePath,assigned.token,{method:'PATCH',body:{notes:'Assigned fixture update'},headers:{Prefer:'return=representation'}});
assert.equal(updated.length,1);
const hiddenUpdate=await ok('distribution-unassigned-update',updatePath,unassigned.token,{method:'PATCH',body:{notes:'Must not persist'},headers:{Prefer:'return=representation'}});
assert.deepEqual(hiddenUpdate,[]);assert.equal((await ok('distribution-update-verify',detailPath,a.token,{body:detailBody})).notes,'Assigned fixture update');
await deny('distribution-cross-tenant-check',updatePath,assigned.token,{method:'PATCH',body:{tenant_id:b.tenantId},headers:{Prefer:'return=representation'}});
// A column grant protects every direct REST write, not just the exact payload
// of an RPC. Compare the entire owned aggregate and stock around each denial.
const directDetail=await ok('distribution-direct-start',detailPath,a.token,{body:detailBody});
const directRoomId=directDetail.rooms[0].id;
async function distributionSnapshot(){
  const paths=['/distribution_orders?id=eq.'+order.order_id,'/distribution_order_rooms?distribution_order_id=eq.'+order.order_id,
    '/distribution_order_batches?distribution_order_id=eq.'+order.order_id,'/distribution_order_items?distribution_order_room_id=eq.'+directRoomId,
    '/items?id=eq.'+item.id];
  const result=[];for(const path of paths){const response=await request('/rest/v1'+path+'&select=*&order=id',input.serviceKey);
    assert.equal(response.status,200);result.push(response.data)}return result;
}
const directBefore=await distributionSnapshot();
const protectedUpdates={tenant:{tenant_id:b.tenantId},hotel:{hotel_id:b.hotelId},assignee:{assigned_to:unassigned.id},
  creator:{created_by:unassigned.id},status:{status:'completed'},totals:{total_items:999},
  mixed:{notes:'Must roll back',assigned_to:unassigned.id}};
for(const [label,user] of [['assigned',assigned],['manager',manager],['owner',a]]){
  for(const [field,body] of Object.entries(protectedUpdates))
    await deny('distribution-direct-protected-'+label+'-'+field,updatePath,user.token,{method:'PATCH',body,headers:{Prefer:'return=representation'}});
  await deny('distribution-direct-insert-'+label,'/rest/v1/distribution_orders',user.token,{body:{tenant_id:a.tenantId,hotel_id:a.hotelId,
    order_code:'OWNED-MUST-NOT-CREATE',created_by:user.id},headers:{Prefer:'return=representation'}});
  await deny('distribution-direct-delete-'+label,updatePath,user.token,{method:'DELETE',headers:{Prefer:'return=representation'}});
  for(const [table,query,body] of [
    ['distribution_order_rooms','distribution_order_id=eq.'+order.order_id,{room_id:room.id,status:'confirmed'}],
    ['distribution_order_items','distribution_order_room_id=eq.'+directRoomId,{item_id:item.id,quantity:999}],
    ['distribution_order_batches','distribution_order_id=eq.'+order.order_id,{status:'received'}]]){
    const path='/rest/v1/'+table+'?'+query;
    await deny('distribution-direct-child-update-'+label+'-'+table,path,user.token,{method:'PATCH',body,headers:{Prefer:'return=representation'}});
    await deny('distribution-direct-child-delete-'+label+'-'+table,path,user.token,{method:'DELETE',headers:{Prefer:'return=representation'}});
    await deny('distribution-direct-child-insert-'+label+'-'+table,'/rest/v1/'+table,user.token,{body:
      table==='distribution_order_items'?{distribution_order_room_id:directRoomId,item_id:item.id,quantity:1}:
        table==='distribution_order_rooms'?{distribution_order_id:order.order_id,room_id:room.id}:
          {distribution_order_id:order.order_id,batch_number:999},headers:{Prefer:'return=representation'}});
  }
  assert.deepEqual(await distributionSnapshot(),directBefore,'Denied direct aggregate/stock writes must be atomic');
}
await deny('distribution-direct-manager-no-hotel',updatePath,outsideManager.token,{method:'PATCH',body:{notes:'Must not persist'},headers:{Prefer:'return=representation'}});
for(const [label,value,restore] of [['locked',{account_locked:true},{account_locked:false}],
  ['deleted',{deleted_at:new Date().toISOString()},{deleted_at:null}],['inactive',{status:'inactive'},{status:'active'}]]){
  await patchUser(assigned,value);
  await deny('distribution-direct-note-'+label,updatePath,assigned.token,{method:'PATCH',body:{notes:'Must not persist'},headers:{Prefer:'return=representation'}});
  await patchUser(assigned,restore);
}
assert.deepEqual(await distributionSnapshot(),directBefore,'Denied notes must preserve the complete aggregate and stock');
assert.equal((await rpc('mark_cannot_access',assigned.token,{p_room_order_id:directRoomId,p_exception_type:'dnd',p_actor_id:assigned.id})).success,true);
assert.equal((await ok('distribution-assigned-workflow-preserved',detailPath,a.token,{body:detailBody})).rooms[0].stop_status,'cannot_access');
await patchUser(a,{account_locked:true});await deny('distribution-locked-create','/rest/v1/rpc/create_distribution_order',a.token,{body:payload});await patchUser(a,{account_locked:false});
const detail=await ok('distribution-mutation-start',detailPath,a.token,{body:detailBody}),roomOrderId=detail.rooms[0].id;
for(const [label,user] of [['unassigned',unassigned],['assigned',assigned],['other-tenant',b]]){
  await deny('distribution-cancel-denied-'+label,'/rest/v1/rpc/cancel_distribution_order',user.token,{body:{p_order_id:order.order_id,p_cancelled_by:user.id}});
  await deny('distribution-edit-denied-'+label,'/rest/v1/rpc/update_distribution_order',user.token,{body:{p_order_id:order.order_id,p_notes:'Must not persist'}});
  await deny('distribution-warehouse-denied-'+label,'/rest/v1/rpc/confirm_warehouse_delivery',user.token,{body:{p_room_order_id:roomOrderId,p_delivered_by:user.id}});
}
const unchanged=await ok('distribution-denial-no-side-effects',detailPath,a.token,{body:detailBody});
assert.equal(unchanged.status,'pending');assert.equal(unchanged.notes,'Assigned fixture update');assert.equal(unchanged.rooms[0].status,'pending');
assert.equal((await rpc('update_distribution_order',manager.token,{p_order_id:order.order_id,p_notes:'Manager edit'})).success,true);
await deny('distribution-assignee-other-tenant','/rest/v1/rpc/update_distribution_order',manager.token,{body:{p_order_id:order.order_id,p_assigned_to:b.id}});
const cancelOrder=await rpc('create_distribution_order',manager.token,{...payload,p_created_by:manager.id});assert.equal(cancelOrder.success,true);
assert.equal((await rpc('cancel_distribution_order',manager.token,{p_order_id:cancelOrder.order_id,p_cancelled_by:manager.id})).success,true);
assert.equal((await ok('distribution-cancel-verified',detailPath,a.token,{body:{p_order_id:cancelOrder.order_id}})).status,'cancelled');
const warehouseOrder=await rpc('create_distribution_order',a.token,payload);assert.equal(warehouseOrder.success,true);
const warehouseDetail=await ok('distribution-warehouse-start',detailPath,a.token,{body:{p_order_id:warehouseOrder.order_id}});
assert.equal((await rpc('confirm_warehouse_delivery',manager.token,{p_room_order_id:warehouseDetail.rooms[0].id,p_delivered_by:manager.id})).success,true);
assert.equal((await ok('distribution-warehouse-verified',detailPath,a.token,{body:{p_order_id:warehouseOrder.order_id}})).rooms[0].status,'confirmed');
const supplement=await insert('supplement_requests',{tenant_id:a.tenantId,hotel_id:a.hotelId,room_id:room.id,
  request_code:'OWNED-R4-'+input.run,status:'pending',request_type:'consumed',requested_by:a.id,items:[{item_id:item.id,quantity:1}]});
const linkedOrder=await rpc('create_distribution_order',manager.token,{...payload,p_created_by:manager.id,p_supplement_request_ids:[supplement.id]});
assert.equal(linkedOrder.success,true);
const reverseLink=await ok('distribution-atomic-reverse-link','/rest/v1/distribution_orders?id=eq.'+linkedOrder.order_id+'&select=supplement_request_id',a.token);
assert.equal(reverseLink[0].supplement_request_id,supplement.id);
const forwardLink=await ok('distribution-atomic-forward-link','/rest/v1/supplement_requests?id=eq.'+supplement.id+'&select=distribution_order_id,status',a.token);
assert.deepEqual(forwardLink,[{distribution_order_id:linkedOrder.order_id,status:'approved'}]);
// The installer alone mutates Auth.deleted_at: the public Auth admin API does
// not expose it. All authorization assertions still use real caller JWTs over
// HTTP/REST or the actual provider-disabled Edge handler, never forged claims.
phase='auth-soft-delete';
const db=new pg.Pool({host:'db',port:5432,user:'postgres',database:'postgres',password:input.databasePassword,
  max:2,statement_timeout:10000,application_name:'owned-access-'+input.run});
const draftRooms=[{room_number:'SOFT-101',floor:1,room_type:'standard',max_guests:2,base_price:100000,hourly_price:0,monthly_price:0}];
const draftBody={p_hotel_id:b.hotelId,p_expected_version:0,p_rooms:draftRooms};
const saved=await rpc('save_hotel_room_setup',b.token,draftBody);assert.ok(saved.version>0);
const softQuoteBody={p_request_id:randomUUID(),p_kind:'extend',p_rooms:3,p_duration_days:30};
const softQuote=await rpc('create_subscription_quote',b.token,softQuoteBody);assert.ok(softQuote.quote_id);
const checkoutBody={p_quote_id:softQuote.quote_id,p_request_id:randomUUID()};
const checkout=await rpc('create_subscription_checkout_draft',b.token,checkoutBody);
assert.equal(checkout.non_payable,true);assert.equal(checkout.checkout_enabled,false);
const tables=['private.hotel_room_setup','private.subscription_quotes','private.subscription_checkout_drafts',
  'private.workspace_provisioning','public.tenants','public.hotels','public.rooms','public.room_types',
  'public.users','public.user_roles','public.user_hotels','public.invoices','public.payment_transactions',
  'public.items','public.distribution_orders','public.distribution_order_rooms','public.distribution_order_items',
  'public.distribution_order_batches','public.supplement_requests','public.email_deliveries'];
async function authStateSnapshot(){
  const out={};for(const table of tables){
    // Static allowlist only. Canonical JSON order also covers tables whose PK
    // is not named id, without ever printing row values/credentials.
    const r=await db.query('SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),\'[]\'::jsonb) AS rows FROM '+table+' t');
    out[table]=r.rows[0].rows;
  }return out;
}
const softActors=[a,b,admin,assigned],softIds=softActors.map(u=>u.id);
try{
  const beforeSoft=await authStateSnapshot();
  assert.equal((await db.query('UPDATE auth.users SET deleted_at=now() WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL',[softIds])).rowCount,4);
  // Prove this is specifically the Auth flag; profiles remain otherwise live.
  const states=await db.query('SELECT count(*)::integer AS n FROM public.users WHERE id=ANY($1::uuid[]) AND status=\'active\' AND deleted_at IS NULL AND NOT COALESCE(account_locked,false)',[softIds]);
  assert.equal(states.rows[0].n,4);checks.push('auth-soft-delete-live-profiles-confirmed');
  await deny('settlement-admin-auth-deleted','/rest/v1/rpc/settle_subscription_payment',admin.token,{body:{p_payment_id:checkout.payment_id,p_gateway_transaction_id:null}});
  await deny('tenant-admin-auth-deleted','/rest/v1/rpc/admin_manage_tenant',admin.token,{body:{p_tenant_id:b.tenantId,p_action:'suspend',p_reason:'Owned permission regression'}});
  await deny('room-auth-deleted-read',setupPath,b.token,{body:{p_hotel_id:b.hotelId}});
  await deny('room-auth-deleted-write','/rest/v1/rpc/save_hotel_room_setup',b.token,{body:{...draftBody,p_expected_version:saved.version,p_rooms:[{...draftRooms[0],room_number:'MUST-NOT-SAVE'}]}});
  await deny('quote-auth-deleted-read',quotePath,b.token,{body:{p_quote_id:softQuote.quote_id}});
  await deny('quote-auth-deleted-replay','/rest/v1/rpc/create_subscription_quote',b.token,{body:softQuoteBody});
  await deny('quote-auth-deleted-new','/rest/v1/rpc/create_subscription_quote',b.token,{body:{...softQuoteBody,p_request_id:randomUUID()}});
  await deny('checkout-auth-deleted-read','/rest/v1/rpc/get_subscription_checkout_draft',b.token,{body:{p_request_id:checkoutBody.p_request_id}});
  await deny('checkout-auth-deleted-replay','/rest/v1/rpc/create_subscription_checkout_draft',b.token,{body:checkoutBody});
  await deny('checkout-auth-deleted-new','/rest/v1/rpc/create_subscription_checkout_draft',b.token,{body:{...checkoutBody,p_request_id:randomUUID()}});
  await deny('support-auth-deleted','/rest/v1/rpc/platform_support_actor',admin.token,{body:{}});
  await deny('email-auth-deleted','/rest/v1/rpc/email_admin_actor',admin.token,{body:{}});
  await emailAction('auth-deleted',admin.token,[401,403]);
  await deny('distribution-auth-deleted-create','/rest/v1/rpc/create_distribution_order',a.token,{body:payload});
  await deny('distribution-auth-deleted-edit','/rest/v1/rpc/update_distribution_order',a.token,{body:{p_order_id:order.order_id,p_notes:'MUST-NOT-SAVE'}});
  await deny('distribution-auth-deleted-note',updatePath,assigned.token,{method:'PATCH',body:{notes:'MUST-NOT-SAVE'},headers:{Prefer:'return=representation'}});
  assert.deepEqual(await authStateSnapshot(),beforeSoft);checks.push('auth-soft-delete-no-business-side-effects-20-tables');
  assert.equal((await db.query('UPDATE auth.users SET deleted_at=NULL WHERE id=ANY($1::uuid[]) AND deleted_at IS NOT NULL',[softIds])).rowCount,4);
  assert.equal((await rpc('get_hotel_room_setup',b.token,{p_hotel_id:b.hotelId})).version,saved.version);
  assert.equal((await rpc('get_subscription_quote',b.token,{p_quote_id:softQuote.quote_id})).quote_id,softQuote.quote_id);
  assert.equal((await rpc('create_subscription_quote',b.token,softQuoteBody)).quote_id,softQuote.quote_id);
  assert.equal((await rpc('create_subscription_checkout_draft',b.token,checkoutBody)).draft_id,checkout.draft_id);
  assert.equal(await rpc('platform_support_actor',admin.token),admin.id);assert.equal(await rpc('email_admin_actor',admin.token),admin.id);
  await emailAction('auth-restored',admin.token,200);
  assert.equal((await rpc('update_distribution_order',a.token,{p_order_id:order.order_id,p_notes:'Auth restored'})).success,true);
  assert.equal((await ok('distribution-auth-restored-note',updatePath,assigned.token,{method:'PATCH',body:{notes:'Auth restored assigned'},headers:{Prefer:'return=representation'}})).length,1);
  checks.push('auth-soft-delete-positive-after-restore');
}finally{
  await db.query('UPDATE auth.users SET deleted_at=NULL WHERE id=ANY($1::uuid[])',[softIds]);await db.end();
}
phase='revoked';
for(const user of [a,admin,assigned]){const result=await request('/auth/v1/logout?scope=global',user.token,{method:'POST'});assert.equal(result.status,204)}
await deny('distribution-direct-note-revoked',updatePath,assigned.token,{method:'PATCH',body:{notes:'Must not persist'},headers:{Prefer:'return=representation'}});
await deny('room-revoked',setupPath,a.token,{body:setupBody});await deny('quote-revoked',quotePath,a.token,{body:quoteBody});
await deny('support-revoked','/rest/v1/rpc/platform_support_actor',admin.token,{body:{}});
await deny('email-revoked','/rest/v1/rpc/email_admin_actor',admin.token,{body:{}});
await emailAction('revoked',admin.token,401);
const identity=user=>({id:user.id,tenantId:user.tenantId,hotelId:user.hotelId,sessionId:user.sessionId});
console.log(JSON.stringify({verified:true,checks,fixtures:8,distributionOrders:4,sessionFixtures:{owner:identity(b),admin:identity(liveAdmin)}}));
