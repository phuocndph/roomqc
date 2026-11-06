// Exact-owned integration fixture only. Policy changes use the real live-user
// command API; installer SQL creates the test platform identity, never a bypass.
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
export function createAdvicePolicyFixture({db,input,call,rpc}){
  assert.match(input?.run??'',/^[a-f0-9]{12}$/);let pending;
  const operator=()=>pending??=(async()=>{
    const email='policy-operator-'+input.run+'@roomqc.invalid';
    const password=createHmac('sha256',input.serviceKey).update('owned-policy-operator:'+input.run).digest('hex');
    let stored=(await db.query('SELECT id FROM auth.users WHERE email=$1',[email])).rows[0];
    if(!stored){const created=await call('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(created.status,200);stored={id:created.data.id};}
    const login=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});assert.equal(login.status,200);assert.equal(login.data.user.id,stored.id);
    const actor={id:stored.id,token:login.data.access_token,sessionId:JSON.parse(Buffer.from(login.data.access_token.split('.')[1],'base64url')).session_id};
    const profile=(await db.query('SELECT id FROM public.users WHERE id=$1',[actor.id])).rows[0];
    if(!profile){const p=await rpc('provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:actor.id,p_fields:{
      fullName:'Owned policy operator',phone:'0901234567',tenantName:'Owned policy operator',hotelName:'Owned policy operator',hotelAddress:'123 Fixture Road',
      hotelPhone:'0281234567',hotelEmail:email,totalRooms:5}});assert.equal(p.status,200);assert.equal(p.data.success,true);}
    await db.query("UPDATE public.users SET role='super_admin',user_level_code='super_admin',is_super_admin=true,is_primary_owner=false WHERE id=$1",[actor.id]);
    await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'super_admin') ON CONFLICT(user_id,role) DO NOTHING",[actor.id]);
    return actor;
  })();
  const configure=async fields=>{
    const actor=await operator(),current=await rpc('get_operations_advice_policy',actor,{p_tenant_id:fields.p_tenant_id});
    if(current.status!==200)return current;
    const response=await rpc('set_operations_advice_policy',actor,{p_tenant_id:fields.p_tenant_id,p_command_id:randomUUID(),p_expected_version:current.data.revision,
      p_policy:{enabled:fields.p_enabled,daily_limit:fields.p_daily_limit,daily_budget_units:fields.p_daily_budget_units,
        units_per_request:fields.p_units_per_request,valid_until:fields.p_valid_until,reason:fields.p_reason}});
    return response.status===200?{status:200,data:response.data.result?.policy}:response;
  };
  return {operator,configure};
}
