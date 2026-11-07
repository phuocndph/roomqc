// Real Auth/RPC/RLS integration on the running loopback stack. No linked project.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const output=process.platform==='win32'
  ?execFileSync('cmd.exe',['/d','/s','/c','npx supabase status --output json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})
  :execFileSync('npx',['supabase','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const local=JSON.parse(output.slice(output.indexOf('{')));
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(local.API_URL).hostname),'Only local Supabase is allowed');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(local.API_URL,local.SERVICE_ROLE_KEY,options);
const anonymous=createClient(local.API_URL,local.ANON_KEY,options);
const ownedUsers=[],ownedTenants=[];let checks=0;
function check(value,label){assert.ok(value,label);checks++;console.log(`PASS ${label}`)}
async function account(){
  const email=`room-setup-${randomUUID()}@example.invalid`,password=`QC!${randomUUID()}a9`;
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(created.error);ownedUsers.push(created.data.user.id);
  const client=createClient(local.API_URL,local.ANON_KEY,options);
  const login=await client.auth.signInWithPassword({email,password});assert.ifError(login.error);
  const fields={fullName:'Test room setup',phone:'0901234567',tenantName:'Test Room Setup',hotelName:'Test hotel',hotelAddress:'123 Test Road',hotelPhone:'0281234567',hotelEmail:email,totalRooms:3};
  const provision=await admin.rpc('provision_workspace_registration',{p_workspace_id:randomUUID(),p_owner_id:created.data.user.id,p_fields:fields});
  assert.ifError(provision.error);assert.ok(provision.data.success,JSON.stringify(provision.data));ownedTenants.push(provision.data.tenant_id);
  return{client,email,password,userId:created.data.user.id,tenantId:provision.data.tenant_id,hotelId:provision.data.hotel_id};
}
const room=(number)=>({room_number:String(number),floor:1,room_type:'standard',max_guests:2,base_price:450000,hourly_price:120000,monthly_price:6000000});
const get=(a,hotel=a.hotelId)=>a.client.rpc('get_hotel_room_setup',{p_hotel_id:hotel});
const save=(a,version,rooms,hotel=a.hotelId)=>a.client.rpc('save_hotel_room_setup',{p_hotel_id:hotel,p_expected_version:version,p_rooms:rooms});
const commit=(a,draft,extra={})=>a.client.rpc('complete_hotel_room_setup',{p_hotel_id:a.hotelId,p_request_id:draft.request_id,p_version:draft.version,p_confirm_prices:true,...extra});
try{
  const owner=await account(),outsider=await account();
  const initial=await get(owner);assert.ifError(initial.error);
  check(initial.data.version===0&&initial.data.actual_rooms===0&&initial.data.expected_rooms===3,'Empty hotel starts with its real expected room count');
  check(!!(await anonymous.rpc('get_hotel_room_setup',{p_hotel_id:owner.hotelId})).error,'Anonymous caller cannot read room setup');
  check(!!(await get(outsider,owner.hotelId)).error,'Another tenant cannot read the draft');
  check(!!(await save(outsider,0,[room(101)],owner.hotelId)).error,'Another tenant cannot save room setup');
  check(!!(await save(owner,0,[room(101),room(101)])).error,'Duplicate room numbers are rejected');
  check(!!(await save(owner,0,[room('A01'),room('a01')])).error,'Room numbers differing only in case are rejected');
  check(!!(await save(owner,0,[{...room(101),floor:0}])).error,'Invalid floors are rejected at the server');
  check(!!(await save(owner,0,[{...room(101),base_price:-1}])).error,'Negative rates are rejected at the server');
  check(!!(await save(owner,0,[room(101),{...room(102),base_price:1000}])).error,'A room type cannot have conflicting rates within a batch');
  check(!!(await save(owner,0,Array.from({length:201},(_,i)=>room(i+1)))).error,'More than 200 rooms is rejected');
  const drafts=await Promise.all(Array.from({length:5},()=>save(owner,0,[room(101),room(102),room(103)])));
  drafts.forEach(d=>assert.ifError(d.error));let draft=drafts[0].data;
  check(drafts.every(d=>d.data.version===1&&d.data.request_id===draft.request_id),'Concurrent identical draft retries preserve one version and request ID');
  const otherDevice=createClient(local.API_URL,local.ANON_KEY,options);
  assert.ifError((await otherDevice.auth.signInWithPassword({email:owner.email,password:owner.password})).error);
  const persisted=await otherDevice.rpc('get_hotel_room_setup',{p_hotel_id:owner.hotelId});assert.ifError(persisted.error);
  check(persisted.data.rooms.length===3&&persisted.data.request_id===draft.request_id,'A new session on another device can resume the saved draft');
  check(!!(await save(owner,0,[room(104)])).error,'Stale version cannot overwrite another saved draft');
  check(!!(await commit(owner,draft,{p_confirm_prices:false})).error,'Commit requires explicit price confirmation');
  check(!!(await commit(owner,draft,{p_request_id:randomUUID()})).error,'Changed or forged preview request IDs are rejected');
  // Plan limit 50, purchased room limit 2: both have to be respected.
  assert.ifError((await admin.from('tenants').update({registered_rooms:2}).eq('id',owner.tenantId)).error);
  const before=await admin.from('room_types').select('id,base_price').eq('tenant_id',owner.tenantId).eq('code','STD').single();assert.ifError(before.error);
  check(!!(await commit(owner,draft)).error,'An atomic batch cannot exceed purchased room capacity');
  const failed=await get(owner);assert.ifError(failed.error);
  const after=await admin.from('room_types').select('base_price').eq('id',before.data.id).single();assert.ifError(after.error);
  check(failed.data.actual_rooms===0&&!failed.data.completed_at&&after.data.base_price===before.data.base_price,'Rejected batch rolls back every room, price change and completion marker');
  assert.ifError((await admin.from('tenants').update({registered_rooms:3,is_read_only:true}).eq('id',owner.tenantId)).error);
  check(!!(await commit(owner,draft)).error,'Read-only tenant cannot create rooms');
  assert.ifError((await admin.from('tenants').update({is_read_only:false,trial_ends_at:new Date(Date.now()-60000).toISOString()}).eq('id',owner.tenantId)).error);
  check(!!(await commit(owner,draft)).error,'Expired trial cannot create rooms');
  assert.ifError((await admin.from('tenants').update({trial_ends_at:new Date(Date.now()+86400000).toISOString()}).eq('id',owner.tenantId)).error);
  const commits=await Promise.all(Array.from({length:6},()=>commit(owner,draft)));commits.forEach(c=>assert.ifError(c.error));
  check(commits.every(c=>c.data.actual_rooms===3&&c.data.completed_at)&&commits.filter(c=>!c.data.idempotent).length===1,'Six concurrent commits create three rooms exactly once');
  const created=await owner.client.from('rooms').select('room_number,base_price,hourly_price,monthly_price,status').eq('hotel_id',owner.hotelId);assert.ifError(created.error);
  check(created.data.length===3&&created.data.every(r=>r.base_price===450000&&r.hourly_price===120000&&r.monthly_price===6000000&&r.status==='vacant_clean'),'Actual rooms have confirmed rates and the correct operational status');
  const rates=await owner.client.from('room_type_rates').select('daily_rate,hourly_rate,monthly_rate').eq('room_type_id',before.data.id).single();assert.ifError(rates.error);
  check(rates.data.daily_rate===450000&&rates.data.hourly_rate===120000&&rates.data.monthly_rate===6000000,'The booking rate table matches confirmed room prices');
  const resolved=await owner.client.rpc('resolve_today_prices_for_hotel',{p_hotel_id:owner.hotelId,p_apply_to:'daily'});assert.ifError(resolved.error);
  check(resolved.data.some(r=>r.room_type_code==='STD'&&r.final_price===450000),'The booking price resolver uses the confirmed nightly price');
  const usage=await admin.from('tenant_usage').select('current_rooms_count').eq('tenant_id',owner.tenantId).single();assert.ifError(usage.error);
  check(usage.data.current_rooms_count===3,'Usage counter agrees with actual committed rooms');
  check(!!(await save(owner,draft.version,[room(999)])).error,'Completed setup cannot overwrite live room data');
  // Competing normal REST inserts must use the very same capacity lock.
  assert.ifError((await admin.from('tenants').update({registered_rooms:5}).eq('id',owner.tenantId)).error);
  const inserts=await Promise.all(Array.from({length:6},(_,i)=>owner.client.from('rooms').insert({...room(201+i),tenant_id:owner.tenantId,hotel_id:owner.hotelId,status:'vacant_clean'})));
  check(inserts.filter(r=>!r.error).length===2,'Concurrent normal REST inserts cannot race past the remaining two slots');
  const count=await owner.client.from('rooms').select('id',{count:'exact',head:true}).eq('hotel_id',owner.hotelId);assert.ifError(count.error);
  check(count.count===5,'Database room count stops exactly at purchased capacity');
  assert.ifError((await admin.from('tenants').update({registered_rooms:50}).eq('id',owner.tenantId)).error);
  const oversized=await owner.client.from('rooms').insert(Array.from({length:46},(_,i)=>({...room(301+i),tenant_id:owner.tenantId,hotel_id:owner.hotelId,status:'vacant_clean'})));
  check(!!oversized.error,'Multi-row REST INSERT cannot exceed plan capacity');
  check((await owner.client.from('rooms').select('id',{count:'exact',head:true}).eq('hotel_id',owner.hotelId)).count===5,'Oversized REST INSERT also rolls back its entire batch');
  const mismatch=await owner.client.from('rooms').insert({...room(999),tenant_id:owner.tenantId,hotel_id:outsider.hotelId,status:'vacant_clean'});
  check(!!mismatch.error,'Room tenant cannot differ from its hotel tenant');
  const leak=await outsider.client.from('rooms').select('id').eq('hotel_id',owner.hotelId);assert.ifError(leak.error);
  check(leak.data.length===0,'RLS hides committed rooms from another business');
  const hotel2=await admin.from('hotels').insert({tenant_id:owner.tenantId,name:'Second test hotel',code:`T-${randomUUID().slice(0,8).toUpperCase()}`,status:'active',total_rooms:1}).select('id').single();assert.ifError(hotel2.error);
  const second={...owner,hotelId:hotel2.data.id};const secondDraft=await save(second,0,[{...room(101),base_price:900000}]);assert.ifError(secondDraft.error);
  check(!!(await commit(second,secondDraft.data)).error,'Setup cannot overwrite a room type already used by another hotel');
  const preservedRate=await owner.client.from('room_type_rates').select('daily_rate').eq('room_type_id',before.data.id).single();assert.ifError(preservedRate.error);
  check(preservedRate.data.daily_rate===450000&&(await get(second)).data.actual_rooms===0,'Another hotel failure preserves live prices and creates no rooms');
  const trialDraft=await save(outsider,0,[room(101),room(102)]);assert.ifError(trialDraft.error);
  const trialCommit=await commit(outsider,trialDraft.data);assert.ifError(trialCommit.error);
  check(trialCommit.data.actual_rooms===2,'New trial with registered_rooms=0 uses its server plan allowance');
  assert.ifError((await admin.from('tenants').update({trial_ends_at:new Date(Date.now()-60000).toISOString()}).eq('id',outsider.tenantId)).error);
  const replay=await commit(outsider,trialDraft.data);assert.ifError(replay.error);
  check(replay.data.idempotent===true,'A completed request remains safely recoverable after subscription expiry');
  // Downgrade the exact test account in its own tenant to prove role checks.
  assert.ifError((await admin.from('user_roles').delete().eq('user_id',outsider.userId).eq('role','owner')).error);
  assert.ifError((await admin.from('user_roles').insert({user_id:outsider.userId,role:'staff'})).error);
  check(!!(await save(outsider,0,[room(101)])).error,'A staff account in the same tenant cannot run owner setup');
  console.log(`Room setup integration verified: ${checks} checks passed.`);
}finally{
  const errors=[];
  for(const id of ownedTenants){try{assert.ifError((await admin.from('tenants').delete().eq('id',id)).error)}catch{errors.push('tenant')}}
  for(const id of ownedUsers){try{assert.ifError((await admin.auth.admin.deleteUser(id)).error)}catch{errors.push('user')}}
  if(errors.length){console.error(`Local test cleanup failed for ${errors.length} identified resources.`);process.exitCode=1}
  else console.log('Identified room setup test tenants, rooms, drafts and accounts removed.');
}
