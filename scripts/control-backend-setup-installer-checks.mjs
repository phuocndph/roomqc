// Focused installer diagnostic against the same owned vendor stack/migrations.
// This omits broader Auth/API/worker tests and must never replace their proof.
import assert from 'node:assert/strict';
import pg from '/control/node_modules/pg/lib/index.js';
import {runSetupInstallerNativeChecks} from '/control/testing/setup-installer-native.mjs';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_SETUP_DISPATCH_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);
const db=new pg.Pool({host:'db',database:'postgres',user:'postgres',password:input.databasePassword,max:2,statement_timeout:20000});
const maintenance=new pg.Pool({host:'db',database:'postgres',user:'supabase_admin',password:input.databasePassword,max:1,statement_timeout:20000});
const recoveryCluster={id:'cluster-a',url:'http://127.0.0.1:8082',internalUrl:'http://127.0.0.1:8000',
 inventoryRef:'cluster-a',credentialRef:'cluster-a',approvedAddresses:['127.0.0.1']};
const checks=[];
async function snapshot(){
 const out={};for(const table of ['public.tenants','public.hotels','public.users','public.user_roles','public.user_hotels','public.room_types',
  'public.item_categories','public.laundry_categories','public.maintenance_categories','public.email_deliveries','private.workspace_provisioning'])
  out[table]=(await db.query('SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),\'[]\'::jsonb) AS value FROM '+table+' t')).rows[0].value;
 return out;
}
try{
 const installer=await runSetupInstallerNativeChecks({input,db,maintenance,recoveryCluster,snapshot,record:label=>checks.push({label,passed:true})});
 console.log(JSON.stringify({verified:true,diagnosticOnly:true,fullIntegratedCandidate:false,checks,installer}));
}finally{await Promise.all([db.end(),maintenance.end()])}
