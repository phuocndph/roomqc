import {lstat} from 'node:fs/promises';
import {isAbsolute,parse,resolve,relative,sep,join} from 'node:path';
import pg from 'pg';
import {ControlError,uuidPattern} from './errors.mjs';
import {boundedHealthFile,healthDatabaseUrl} from './workers/health-config.mjs';
import {ReleaseApprovalTrust,releaseApprovalEndpointFingerprint} from './release-approval.mjs';
import {releaseExpectation,releaseExpectationFingerprint} from './release-manifest.mjs';
import {ReleaseApprovalStore,releaseAuthoritySelect,releaseAuthorityMatches} from './release-authority.mjs';
import {migrationManifest,verifyHistory} from './migrate.mjs';

const invalid=(code='RELEASE_INSTALLER_CONFIG_INVALID')=>new ControlError(400,code,'Cấu hình hoặc lệnh cài phê duyệt chưa hợp lệ.');
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{1,63}$/.test(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const commandFields=['version','operation','expectedVersion','key','requestId','reason'];
const runtimeRoles=['roomqc_control_api','roomqc_control_worker','roomqc_control_metrics','roomqc_control_probe_runtime','roomqc_control_probe_installer','roomqc_control_release_writer'];
const protectedTables=['schema_migrations','hosts','clusters','release_approvals','release_authority','release_commands','release_key_revocations','cluster_policies','cluster_events'];
const functions=['release_approval_command(text,text,bigint,uuid,text,uuid,jsonb)','release_key_withdrawal_command(text,bigint,uuid,text,uuid)','release_approval_receipt(uuid)'];
export function releaseInstallerArguments(args){
  if(!Array.isArray(args)||args.some(v=>typeof v!=='string'))throw invalid('RELEASE_INSTALLER_ARGUMENTS_INVALID');
  if(args.length===1&&args[0]==='--help')return {help:true};
  if(args.length!==4)throw invalid('RELEASE_INSTALLER_ARGUMENTS_INVALID');
  const values={};
  for(let i=0;i<args.length;i+=2){
    if(!['--config-file','--command-file'].includes(args[i])||Object.hasOwn(values,args[i])||!isAbsolute(args[i+1]??''))throw invalid('RELEASE_INSTALLER_ARGUMENTS_INVALID');
    values[args[i]]=args[i+1];
  }
  return {configFile:values['--config-file'],commandFile:values['--command-file']};
}
async function privateFile(file,max){
  try{
    if(typeof file!=='string'||!isAbsolute(file))throw invalid();
    const normalized=resolve(file),root=parse(normalized).root;
    let current=root;
    for(const part of relative(root,normalized).split(sep)){
      current=join(current,part);const info=await lstat(current);
      if(info.isSymbolicLink())throw invalid();
      if(current!==normalized){
        if(!info.isDirectory())throw invalid();
        if(process.platform!=='win32'&&(![0,process.getuid()].includes(info.uid)
          ||((info.mode&0o022)!==0&&!(info.uid===0&&(info.mode&0o1000)!==0))))throw invalid();
      }
    }
    return await boundedHealthFile(normalized,max,{sensitive:true});
  }catch{throw invalid('RELEASE_INSTALLER_FILE_INVALID')}
}
const jsonFile=async(file,max)=>{
  try{return JSON.parse((await privateFile(file,max)).replace(/^\uFEFF/,''))}
  catch(error){if(error instanceof ControlError)throw error;throw invalid('RELEASE_INSTALLER_FILE_INVALID')}
};
export function releaseInstallerCommand(raw){
  const op=raw?.operation;
  const fields=op==='check'?['version','operation']:op==='receipt'?['version','operation','key']
    :[...commandFields,...(op==='install'?['clusterId','approvalFile']:op==='withdraw'?['clusterId','approvalId']:op==='withdraw_key'?['keyFingerprint']:[])];
  if(!exact(raw,fields)||raw.version!==1||!['check','receipt','install','withdraw','withdraw_key'].includes(op))throw invalid('RELEASE_INSTALLER_COMMAND_INVALID');
  if(op==='check')return {...raw};
  if(typeof raw.key!=='string'||!uuidPattern.test(raw.key))throw invalid('RELEASE_INSTALLER_COMMAND_INVALID');
  if(op==='receipt')return {...raw};
  if(!Number.isSafeInteger(raw.expectedVersion)||raw.expectedVersion<0||raw.expectedVersion>Number.MAX_SAFE_INTEGER-2
    ||typeof raw.requestId!=='string'||!uuidPattern.test(raw.requestId)||typeof raw.reason!=='string'
    ||raw.reason.trim()!==raw.reason||raw.reason.length<5||raw.reason.length>1000
    ||(op==='withdraw_key'&&(!digest(raw.keyFingerprint)||raw.expectedVersion>1))
    ||(op!=='withdraw_key'&&(!id(raw.clusterId)||raw.clusterId.length>40))
    ||(op==='withdraw'&&(typeof raw.approvalId!=='string'||!uuidPattern.test(raw.approvalId)))
    ||(op==='install'&&(typeof raw.approvalFile!=='string'||!isAbsolute(raw.approvalFile))))throw invalid('RELEASE_INSTALLER_COMMAND_INVALID');
  return {...raw};
}
function inventory(raw,allowLocal){
  if(!exact(raw,['version','targets'])||raw.version!==1||!Array.isArray(raw.targets)||raw.targets.length<1||raw.targets.length>100)throw invalid();
  const targets=new Map();
  for(const entry of raw.targets){
    if(!exact(entry,['cluster','expected']))throw invalid();
    const c=entry.cluster;
    if(!exact(c,['id','hostId','inventoryRef','credentialRef','environment','url','internalUrl','approvedAddresses'])
      ||![c.id,c.hostId,c.inventoryRef,c.credentialRef].every(id)||c.id.length>40
      ||!['local','staging','production'].includes(c.environment)||(!allowLocal&&c.environment==='local')||targets.has(c.id))throw invalid();
    for(const value of [c.url,c.internalUrl??c.url]){
      const url=new URL(value);
      if(url.protocol!=='https:'&&!(allowLocal&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]','host.docker.internal'].includes(url.hostname)))throw invalid();
    }
    if(!exact(entry.expected,['clusterId','releaseId','artifactDigest','frontendArtifactDigest','migrationSetHash','schemaManifestHash']))throw invalid();
    const expected=releaseExpectation(entry.expected),endpointFingerprint=releaseApprovalEndpointFingerprint({url:c.url,
      internalUrl:c.internalUrl,approvedAddresses:c.approvedAddresses,credentialRef:c.credentialRef});
    if(expected.clusterId!==c.id)throw invalid();
    targets.set(c.id,{cluster:c,context:{clusterId:c.id,hostId:c.hostId,inventoryRef:c.inventoryRef,environment:c.environment,expected,endpointFingerprint}});
  }
  return targets;
}
async function installerRoleAndSchema(client,expectedDatabase){
  if(!(await client.query('SELECT pg_try_advisory_lock_shared(727000) AS locked')).rows[0].locked){
    throw invalid('RELEASE_INSTALLER_MIGRATION_BUSY');
  }
  const manifest=await migrationManifest();
  try{if(await verifyHistory(client,manifest)!==manifest.length)throw invalid('RELEASE_INSTALLER_SCHEMA_PENDING')}
  catch(error){if(error instanceof ControlError)throw error;throw invalid('RELEASE_INSTALLER_SCHEMA_INVALID')}
  const row=(await client.query(`SELECT current_database()=$1 AS database_matches,session_user=current_user AS actual_login,
    NOT pg_is_in_recovery() AND current_setting('transaction_read_only')='off' AS primary_writable,
    pg_has_role(session_user,'roomqc_control_release_installer','USAGE') AS installer,
    EXISTS(SELECT 1 FROM pg_roles r WHERE pg_has_role(session_user,r.oid,'MEMBER')
      AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)) AS elevated,
    EXISTS(SELECT 1 FROM unnest($2::text[]) role(name) WHERE pg_has_role(session_user,name,'MEMBER')) AS mixed_roles,
    has_schema_privilege(session_user,'roomqc_control','CREATE') AS schema_write,
    EXISTS(SELECT 1 FROM unnest($3::text[]) t(name) WHERE
      has_any_column_privilege(session_user,'roomqc_control.'||name,'INSERT,UPDATE')
      OR has_table_privilege(session_user,'roomqc_control.'||name,'DELETE,TRUNCATE,TRIGGER')) AS direct_write,
    (SELECT count(*)::integer FROM unnest($4::text[]) f(signature) JOIN pg_proc p
      ON p.oid=to_regprocedure('roomqc_control.'||signature) JOIN pg_roles owner ON owner.oid=p.proowner
      WHERE has_function_privilege(session_user,p.oid,'EXECUTE') AND p.prosecdef
      AND owner.rolname='roomqc_control_release_writer' AND NOT owner.rolcanlogin
      AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
      AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')) AS protected_functions`,
  [expectedDatabase,runtimeRoles,protectedTables,functions])).rows[0];
  if(!row.database_matches)throw invalid('RELEASE_INSTALLER_DATABASE_MISMATCH');
  if(!row.primary_writable||!row.actual_login||!row.installer||row.elevated||row.mixed_roles||row.schema_write||row.direct_write
    ||row.protected_functions!==functions.length)throw invalid('RELEASE_INSTALLER_PRIVILEGES_UNSAFE');
  return {schemaVersion:manifest.at(-1).version};
}
async function assertTargets(client,targets){
  const rows=(await client.query(`SELECT c.id,c.api_url,c.host_id,c.inventory_ref,c.credential_ref,h.environment
    FROM roomqc_control.clusters c JOIN roomqc_control.hosts h ON h.id=c.host_id WHERE c.id=ANY($1::text[])`,[[...targets.keys()]])).rows;
  if(rows.length!==targets.size||rows.some(row=>{
    const {cluster:c}=targets.get(row.id);
    return row.api_url!==c.url||row.host_id!==c.hostId||row.inventory_ref!==c.inventoryRef||row.credential_ref!==c.credentialRef||row.environment!==c.environment;
  }))throw invalid('RELEASE_INSTALLER_TARGET_MISMATCH');
}
function receiptProjection(value){
  if(!value||typeof value!=='object'||!uuidPattern.test(value.commandId??'')||!Number.isSafeInteger(value.version)||value.version<1
    ||!['active','withdrawn'].includes(value.state))throw invalid('RELEASE_INSTALLER_RESULT_INVALID');
  if(Object.hasOwn(value,'keyFingerprint')){
    if(!digest(value.keyFingerprint)||!Array.isArray(value.affected))throw invalid('RELEASE_INSTALLER_RESULT_INVALID');
    return {commandId:value.commandId,keyFingerprint:value.keyFingerprint,version:value.version,state:value.state,
      affectedClusterCount:value.affected.length,...(typeof value.replayed==='boolean'?{replayed:value.replayed}:{})};
  }
  if(!id(value.clusterId)||!uuidPattern.test(value.approvalId??'')||!Number.isSafeInteger(value.epoch)||value.epoch<1)throw invalid('RELEASE_INSTALLER_RESULT_INVALID');
  return Object.fromEntries(['commandId','clusterId','approvalId','epoch','version','state','replayed'].filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]));
}
export async function runReleaseInstaller(args,env=process.env){
  const parsed=releaseInstallerArguments(args);if(parsed.help)return {help:true};
  const allowLocal=env.NODE_ENV!=='production'&&env.ROOMQC_RELEASE_INSTALLER_ALLOW_LOCAL==='true';
  if(process.platform==='win32'&&!allowLocal)throw invalid('RELEASE_INSTALLER_PLATFORM_UNSUPPORTED');
  let pool,client,locked=false,command,dispatching=false;
  try{
    const config=await jsonFile(parsed.configFile,8192);
    if(!exact(config,['version','databaseUrlFile','expectedDatabase','trustFile','inventoryFile','maximumValidityMs'])||config.version!==1
      ||![config.databaseUrlFile,config.trustFile,config.inventoryFile].every(v=>typeof v==='string'&&isAbsolute(v))
      ||typeof config.expectedDatabase!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(config.expectedDatabase)
      ||!Number.isSafeInteger(config.maximumValidityMs)||config.maximumValidityMs<1)throw invalid();
    command=releaseInstallerCommand(await jsonFile(parsed.commandFile,16384));
    const databaseUrl=(await privateFile(config.databaseUrlFile,8192)).trim();
    healthDatabaseUrl(databaseUrl,{production:!allowLocal,allowLocal});
    let trust,targets,envelope;
    if(['check','install'].includes(command.operation)){
      trust=new ReleaseApprovalTrust(await jsonFile(config.trustFile,65536),{maximumValidityMs:config.maximumValidityMs});
      targets=inventory(await jsonFile(config.inventoryFile,262144),allowLocal);
      if(command.operation==='install'){
        if(!targets.has(command.clusterId))throw invalid('RELEASE_INSTALLER_TARGET_MISMATCH');
        envelope=await jsonFile(command.approvalFile,65536);
      }
    }
    pool=new pg.Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:3000,idleTimeoutMillis:1000,
      statement_timeout:5000,idle_in_transaction_session_timeout:6000,options:'',application_name:'roomqc-release-installer'});
    pool.on('error',()=>{});
    client=await pool.connect();
    // A checked-out client's transport failure is not a pool error. Let the
    // pending query reject and produce the stable receipt recovery response.
    client.on('error',()=>{});
    const schema=await installerRoleAndSchema(client,config.expectedDatabase);locked=true;
    const session={query:(...a)=>client.query(...a),connect:async()=>({query:(...a)=>client.query(...a),release:()=>{}})};
    const store=new ReleaseApprovalStore(session,trust);
    if(command.operation==='check'){
      await assertTargets(client,targets);
      const authorityRows=(await client.query(releaseAuthoritySelect.replace('WHERE r.cluster_id=$1',
        'WHERE r.cluster_id=ANY($1::text[])'),[[...targets.keys()]])).rows;
      const authorities=new Map(authorityRows.map(row=>[row.cluster_id,row]));
      const states=[];
      for(const [clusterId,{context}]of targets){
        const row=authorities.get(clusterId);
        const identity=row&&{issuerId:row.issuer_id,keyId:row.key_id,keyFingerprint:row.key_fingerprint,environment:row.environment};
        const approved=row&&{...context,approvalId:row.approval_id,epoch:Number(row.epoch),envelopeDigest:row.envelope_digest,
          issuerId:row.issuer_id,keyId:row.key_id,keyFingerprint:row.key_fingerprint,
          notBefore:Number(row.not_before_ms),expiresAt:Number(row.expires_at_ms),expectationFingerprint:releaseExpectationFingerprint(context.expected)};
        const ready=!!row&&trust.acceptsIdentity(identity)&&approved.expiresAt-approved.notBefore<=config.maximumValidityMs&&releaseAuthorityMatches(row,approved);
        states.push({clusterId,ready,reasonCode:ready?null:!row?'RELEASE_APPROVAL_MISSING':'RELEASE_APPROVAL_NOT_CURRENT'});
      }
      return {ok:true,installerReady:true,ready:states.every(s=>s.ready),...schema,targets:states};
    }
    let result;
    if(command.operation==='receipt')result=await store.receipt(command.key);
    else{
      dispatching=true;
      if(command.operation==='install'){
        const target=targets.get(command.clusterId),verified=trust.verify(envelope,target.context,{now:envelope?.payload?.notBefore});
        result=await store.transaction(async tx=>{
          await assertTargets(tx,new Map([[command.clusterId,target]]));
          return store.execute(tx,'install',command.clusterId,verified,command);
        });
      }else if(command.operation==='withdraw')result=await store.withdraw(command.clusterId,command.approvalId,command);
      else result=await store.withdrawKey(command.keyFingerprint,command);
    }
    return {ok:true,operation:command.operation,key:command.key,receipt:receiptProjection(result),historicalResult:true,currentAuthorityChecked:false};
  }catch(error){
    const code=error instanceof ControlError?error.code:dispatching?'RELEASE_INSTALLER_OUTCOME_UNKNOWN':'RELEASE_INSTALLER_UNAVAILABLE';
    const safe=new ControlError(error instanceof ControlError?error.status:503,code,'Không hoàn tất kiểm tra hoặc lệnh cài phê duyệt.');
    if(command?.key)safe.recovery={operation:'receipt',key:command.key};
    throw safe;
  }finally{
    if(client){if(locked)await client.query('SELECT pg_advisory_unlock_shared(727000)').catch(()=>{});client.release(true)}
    await pool?.end();
  }
}
