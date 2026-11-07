import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {recoverySequenceAclSQL} from './roomqc-recovery-schema-review.mjs';
const run=randomBytes(6).toString('hex'),name='roomqc-recovery-acl-'+run,label='roomqc.recovery-acl='+run;
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',windowsHide:true,timeout:30000,stdio:['pipe','pipe','pipe']});
const sql=query=>docker(['exec','-i',name,'psql','-XAtq','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],query).trim();
let created=false;
try{
 docker(['run','-d','--pull','never','--name',name,'--label',label,'--network','none','--memory','256m','--cpus','1','--pids-limit','64',
  '--user','postgres','--entrypoint','sh','sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00','-c',
  'initdb -D /tmp/db --username=supabase_admin --auth-local=trust >/tmp/initdb.log 2>&1 && exec postgres -D /tmp/db -c listen_addresses=']);created=true;
 let ready=false;for(let i=0;i<60;i++){try{sql('SELECT 1;');ready=true;break}catch{await new Promise(r=>setTimeout(r,250))}}assert(ready);
 sql(`CREATE ROLE postgres; CREATE ROLE anon; CREATE SCHEMA private;
 CREATE SEQUENCE private.checkout_invoice_numbers; CREATE SEQUENCE private.subscription_lifecycle_commands_ordinal_seq;
 ALTER SEQUENCE private.checkout_invoice_numbers OWNER TO postgres;
 ALTER SEQUENCE private.subscription_lifecycle_commands_ordinal_seq OWNER TO postgres;
 GRANT ALL ON SEQUENCE private.subscription_lifecycle_commands_ordinal_seq TO postgres;
 REVOKE SELECT,UPDATE ON SEQUENCE private.subscription_lifecycle_commands_ordinal_seq FROM postgres;`);
 const snapshot=()=>sql("SELECT jsonb_agg(jsonb_build_array(relname,relacl::text) ORDER BY relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND relkind='S';");
 const before=JSON.parse(snapshot());assert.equal(before.filter(r=>r[1]===null).length,1);assert.equal(before.filter(r=>r[1]==='{postgres=U/postgres}').length,1);
 const parts=Array.from({length:101},(_,i)=>['table','public.t'+i,{}]);
 for(const sequence of before)parts.push(['relation','private.'+sequence[0],{kind:'S',owner:'postgres',acl:['postgres=rwU/postgres']}]);
 const repair=recoverySequenceAclSQL(parts);sql(repair);const after=snapshot();
 assert(JSON.parse(after).every(r=>r[1]==='{postgres=rwU/postgres}'));sql(repair);assert.equal(snapshot(),after);
 sql('GRANT USAGE ON SEQUENCE private.checkout_invoice_numbers TO anon;');const drifted=snapshot();
 let denied=false;try{sql(repair)}catch(e){denied=e.stderr.includes('RECOVERY_SEQUENCE_ACL_SOURCE_CHANGED')}assert(denied);assert.equal(snapshot(),drifted);
 console.log(JSON.stringify({kind:'roomqc-recovery-sequence-acl-native',implicitAndExplicitUsageRepaired:true,
  exactSourceOwnerRightsRestored:true,idempotent:true,unexpectedGranteeDeniedWithoutChanges:true,network:'none',sourceHostContacted:false,verified:true}));
}catch{console.error('RECOVERY_SEQUENCE_ACL_NATIVE_FAILED');process.exitCode=1}
finally{if(created){const state=JSON.parse(docker(['inspect',name]))[0];assert.equal(state.Config.Labels['roomqc.recovery-acl'],run);docker(['rm','-f',name])}
 assert.equal(docker(['ps','-aq','--filter','label='+label]),'');}
