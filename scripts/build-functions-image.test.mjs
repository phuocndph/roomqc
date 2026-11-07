import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {functionPolicies,packagedFunctionRouter} from './build-functions-image.mjs';

test('JWT is required by default; only explicitly named function policies opt out',()=>{
 const config='[functions.webhook]\nverify_jwt = false\n[auth]\nverify_jwt = false\n[functions.admin]\nverify_jwt = true\n';
 assert.deepEqual(functionPolicies(config,['webhook','admin','probe']),{
  webhook:{verifyJwt:false},admin:{verifyJwt:true},probe:{verifyJwt:true}});
 assert.throws(()=>functionPolicies('[functions.missing]\nverify_jwt=false',['probe']),{code:'FUNCTION_POLICY_TARGET_MISSING'});
});
test('every configured function exists in the shipped source tree',async()=>{
 const entries=await readdir(new URL('../supabase/functions/',import.meta.url),{withFileTypes:true});
 const slugs=[];for(const entry of entries)if(entry.isDirectory()&&!entry.name.startsWith('_')){
  try{await readFile(new URL('../supabase/functions/'+entry.name+'/index.ts',import.meta.url));slugs.push(entry.name);}catch{}
 }
 const policies=functionPolicies(await readFile(new URL('../supabase/config.toml',import.meta.url),'utf8'),slugs);
 assert.equal(policies['control-probe'].verifyJwt,true);
 assert.equal(policies['email-provider-webhook'].verifyJwt,false);
 assert.equal(policies['create-user'].verifyJwt,false);
 assert.equal(Object.keys(policies).length,slugs.length);
});
test('a changed vendor router cannot silently remove JWT checks during packaging',()=>{
 assert.throws(()=>packagedFunctionRouter('Deno.serve(()=>new Response());',{probe:{verifyJwt:true}}),/FUNCTION_VENDOR_ROUTER_DRIFT/);
});
