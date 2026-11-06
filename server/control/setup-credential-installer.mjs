import pg from 'pg';
import {isAbsolute,resolve,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {exact} from './probe-secrets.mjs';
import {uuidPattern} from './errors.mjs';
import {readSetupBackfillFile,assertSetupBackfillAccess} from './setup-backfill-files.mjs';
import {resourceDatabaseConnection} from './resource-database.mjs';
import {loadRuntimeResourceContext} from './resource-runtime.mjs';
import {ReleaseApprovalTrust} from './release-approval.mjs';
import {releaseAuthoritySelect,releaseAuthorityMatches} from './release-authority.mjs';
import {setupTargetApproval} from './workers/setup-config.mjs';
import {releaseExpectation,releaseExpectationFingerprint} from './release-manifest.mjs';
import {recoveryBinding} from './setup-recovery.mjs';
import {credentialCanonical,credentialIssueReceipt,loadCredentialReceiptSigner} from './setup-credential-signing.mjs';
import {publishSetupCredential} from './setup-credential-publication.mjs';
import {migrationManifest,verifyHistory} from './migrate.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
const hash=value=>createHash('sha256').update(value).digest('hex');
const ref=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{1,63}$/.test(value);
const path=value=>typeof value==='string'&&isAbsolute(value)&&resolve(value)===value;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const uuid=value=>typeof value==='string'&&uuidPattern.test(value);
const name=value=>typeof value==='string'&&Buffer.byteLength(value)>0&&Buffer.byteLength(value)<=63&&!/[\x00-\x1f\x7f]/.test(value);
const database=value=>exact(value,['dsnFile','expected'])&&path(value.dsnFile)
  &&exact(value.expected,['systemIdentifier','databaseOid','databaseName','role'])
  &&/^[1-9][0-9]{0,19}$/.test(value.expected.systemIdentifier??'')&&BigInt(value.expected.systemIdentifier)<=18446744073709551615n
  &&/^[1-9][0-9]{0,9}$/.test(value.expected.databaseOid??'')&&BigInt(value.expected.databaseOid)<=4294967295n
  &&name(value.expected.databaseName)&&name(value.expected.role);

export function setupCredentialInstallerArguments(args){
  if(args.length===1&&args[0]==='--help')return {help:true};
  let allowLocal=false;const values={};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--allow-local'&&!allowLocal){allowLocal=true;continue}
    if(!['--config-file','--command-file'].includes(args[i])||Object.hasOwn(values,args[i])||!path(args[i+1]))
      fail('SETUP_INSTALLER_ARGUMENTS_INVALID');
    values[args[i]]=args[++i];
  }
  if(Object.keys(values).length!==2)fail('SETUP_INSTALLER_ARGUMENTS_INVALID');
  return {configFile:values['--config-file'],commandFile:values['--command-file'],allowLocal};
}
export function setupCredentialInstallerConfiguration(raw,{allowLocal=false}={}){
  if(!exact(raw,['version','environment','business','directory','resourceBudgetFile','resourceBudgetSha256','businessDatabaseId',
    'consumerId','replicas','releaseTrustFile','target','publisher'])||raw.version!==1
    ||!['local','staging','production'].includes(raw.environment)||raw.environment==='local'&&!allowLocal
    ||!database(raw.business)||!database(raw.directory)||!path(raw.resourceBudgetFile)||!digest(raw.resourceBudgetSha256)
    ||!path(raw.releaseTrustFile)||!ref(raw.businessDatabaseId)
    ||!['setup-credential-issuer','setup-credential-installer','setup-credential-rotation'].includes(raw.consumerId)
    ||!Number.isSafeInteger(raw.replicas)||raw.replicas<1||raw.replicas>2
    ||!exact(raw.target,['cluster','expected','approval']))fail('SETUP_INSTALLER_CONFIG_INVALID');
  const c=raw.target.cluster;
  if(!exact(c,['id','hostId','inventoryRef','credentialRef','url','internalUrl','approvedAddresses'])
    ||![c.id,c.hostId,c.inventoryRef,c.credentialRef].every(ref)||c.id.length>40)fail('SETUP_INSTALLER_TARGET_INVALID');
  for(const origin of [c.url,c.internalUrl??c.url]){
    let url;try{url=new URL(origin)}catch{fail('SETUP_INSTALLER_TARGET_INVALID')}
    if(url.origin!==origin||url.username||url.password||url.protocol!=='https:'&&!(raw.environment==='local'
      &&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))fail('SETUP_INSTALLER_TARGET_INVALID');
  }
  releaseExpectation(raw.target.expected);
  if(raw.target.expected.clusterId!==c.id)fail('SETUP_INSTALLER_TARGET_INVALID');
  const issuer=raw.consumerId!=='setup-credential-installer',p=raw.publisher;
  if(issuer){
    if(!exact(p,['signer','publishableKeyFile','outputFile'])||!path(p.publishableKeyFile)||!path(p.outputFile)
      ||!exact(p.signer,['algorithm','fingerprint','keyFile','keyId'])||!['HS256','RS256','ES256'].includes(p.signer.algorithm)
      ||!digest(p.signer.fingerprint)||!path(p.signer.keyFile)
      ||p.signer.keyId!==null&&(typeof p.signer.keyId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(p.signer.keyId)))fail('SETUP_INSTALLER_CONFIG_INVALID');
    // Runtime sees the entire output directory after atomic rename. Never put
    // configuration, signer, DSN or journal inputs in that directory/subtree.
    for(const input of [p.signer.keyFile,p.publishableKeyFile,raw.business.dsnFile,raw.directory.dsnFile,raw.releaseTrustFile,raw.resourceBudgetFile]){
      const rel=relative(dirname(p.outputFile),input);
      if(rel===''||!rel.startsWith('..')&&!isAbsolute(rel))fail('SETUP_INSTALLER_OUTPUT_ISOLATION');
    }
  }else if(p!==null)fail('SETUP_INSTALLER_CONFIG_INVALID');
  if(raw.business.expected.role===raw.directory.expected.role)fail('SETUP_INSTALLER_CONFIG_INVALID');
  return structuredClone(raw);
}
export function assertSetupCredentialBudget(config,context,kind){
  if(!context||context.budgetSha256!==config.resourceBudgetSha256)fail('SETUP_INSTALLER_BUDGET_INVALID');
  const d=context.budget.databases.find(d=>d.kind===kind&&d.id===context.databaseId),c=d?.consumers.find(c=>c.id===config.consumerId);
  if(!d||!c||c.replicas!==config.replicas||c.fixedConnectionsPerReplica!==0||c.poolMax!==1||c.pools.length!==1||c.pools[0].max!==1)
    fail('SETUP_INSTALLER_BUDGET_INVALID');
  return d;
}
export async function loadSetupCredentialInstaller(file,{allowLocal=false,commandFile}={}){
  try{
    const files=new Map(),read=async(p,max)=>{const value=await readSetupBackfillFile(p,max);files.set(p,{max,hash:hash(value)});return value};
    const config=setupCredentialInstallerConfiguration(JSON.parse(await read(file,131072)),{allowLocal});
    if(config.publisher){for(const input of [file,commandFile])if(input){
      const rel=relative(dirname(config.publisher.outputFile),input);
      if(rel===''||!rel.startsWith('..')&&!isAbsolute(rel))fail('SETUP_INSTALLER_OUTPUT_ISOLATION');
    }}
    const trust=new ReleaseApprovalTrust(JSON.parse(await read(config.releaseTrustFile,65536)),{maximumValidityMs:86400000});
    const env={ROOMQC_RESOURCE_ENVIRONMENT:config.environment,ROOMQC_RESOURCE_BUDGET_FILE:config.resourceBudgetFile};
    await read(config.resourceBudgetFile,131072);
    const contexts={business:loadRuntimeResourceContext({...env,ROOMQC_RESOURCE_DATABASE_ID:config.businessDatabaseId},{kind:'business'}),
      directory:loadRuntimeResourceContext(env,{kind:'directory'})};
    for(const kind of ['business','directory'])assertSetupCredentialBudget(config,contexts[kind],kind);
    const connections={};
    for(const kind of ['business','directory'])connections[kind]=resourceDatabaseConnection((await read(config[kind].dsnFile,8192)).trim(),config[kind],config.environment);
    // Complete all private input reads before opening either connection.
    if(config.publisher){await read(config.publisher.signer.keyFile,16384);await read(config.publisher.publishableKeyFile,16001);
      await assertSetupBackfillAccess(dirname(config.publisher.outputFile),{directory:true})}
    const current=()=>setupCredentialInstallerApproval(config.target,trust,config.environment);
    const approval=current();
    return {config,contexts,connections,files,trust,approval,current,async assertFiles(){
      for(const [path,item]of files)if(hash(await readSetupBackfillFile(path,item.max))!==item.hash)fail('SETUP_INSTALLER_FILES_CHANGED');
    }};
  }catch(error){if(/^SETUP_INSTALLER_/.test(error?.code??''))throw error;fail('SETUP_INSTALLER_CONFIG_INVALID')}
}

export function setupCredentialInstallerApproval(target,trust,environment,options){
  const approved=setupTargetApproval(target,trust,environment,options);
  if(releaseExpectationFingerprint(target.expected)!==approved.expectationFingerprint)
    fail('SETUP_INSTALLER_RELEASE_MISMATCH');
  return approved;
}

export function setupCredentialInstallerFailure(error,command,dispatched){
  const databaseCodes={'42501':'SETUP_INSTALLER_DATABASE_PRIVILEGES_DENIED','42883':'SETUP_INSTALLER_SCHEMA_UNAVAILABLE',
    '3F000':'SETUP_INSTALLER_SCHEMA_UNAVAILABLE','42P01':'SETUP_INSTALLER_SCHEMA_UNAVAILABLE',
    '53300':'SETUP_INSTALLER_CONNECTION_LIMIT','57014':'SETUP_INSTALLER_DEADLINE'};
  // This exact server-side refusal is raised before effects by the immutable
  // caller/key/body guard. Other PostgreSQL failures after dispatch stay
  // unknown; never infer rollback from transport loss or a generic SQL error.
  const refusedCommands={SETUP_CREDENTIAL_KEY_CONFLICT:'SETUP_INSTALLER_COMMAND_CONFLICT',
    SETUP_CREDENTIAL_VERSION_CONFLICT:'SETUP_INSTALLER_VERSION_CONFLICT',
    SETUP_CREDENTIAL_PREDECESSOR_CONFLICT:'SETUP_INSTALLER_PREDECESSOR_CONFLICT',
    SETUP_CREDENTIAL_OVERLAP_BUSY:'SETUP_INSTALLER_OVERLAP_BUSY',SETUP_CREDENTIAL_TARGET_CONFLICT:'SETUP_INSTALLER_TARGET_CONFLICT',
    SETUP_CREDENTIAL_ROTATION_HEAD_UNREADY:'SETUP_INSTALLER_ROTATION_HEAD_UNREADY'};
  const refusal=dispatched&&error?.code==='P0001'&&Object.hasOwn(refusedCommands,error.message)?refusedCommands[error.message]:null;
  const code=refusal??(/^SETUP_INSTALLER_[A-Z_]{1,64}$/.test(error?.code??'')?error.code
    :/^SETUP_PUBLICATION_[A-Z_]{1,64}$/.test(error?.code??'')?error.code
    :dispatched?'SETUP_INSTALLER_OUTCOME_UNKNOWN':Object.hasOwn(databaseCodes,error?.code)?databaseCodes[error.code]:'SETUP_INSTALLER_UNAVAILABLE');
  const safe=Object.assign(new Error(code),{code});
  // Replaying the original command preserves caller/key/body and lets the DB
  // return its immutable receipt before CAS. Bind/revoke cannot publish a file.
  if(command?.key&&['bind','issue','publish','revoke'].includes(command.operation))
    safe.recovery={operation:command.operation,key:command.key,sameCommandRequired:true};
  return safe;
}

// Safe maintenance metadata for the rotator, with no signer, DSN or bearer.
// An observation is not permission for a later write; issue rechecks live CAS,
// caller, target, physical identities and release at its own fences.
export function setupCredentialInstallerObservation(raw,binding){
  const keys=['contractVersion','version','clusterId','bindingSha256','releaseSha256','observedAt','ready','reasonCode','historicalResult','credential'];
  const reasons=['UNBOUND','CREDENTIAL_MISSING','CREDENTIAL_TARGET_MISMATCH','CREDENTIAL_REVOKED',
    'CREDENTIAL_NOT_YET_VALID','CREDENTIAL_EXPIRED','CREDENTIAL_RETIRED'];
  if(!exact(raw,keys)||raw.contractVersion!==1||raw.historicalResult!==false
    ||!Number.isSafeInteger(raw.version)||raw.version<0||raw.version>=9007199254740990
    ||typeof raw.observedAt!=='string'||!Number.isFinite(Date.parse(raw.observedAt))
    ||typeof raw.ready!=='boolean'||(raw.ready?raw.reasonCode!==null:!reasons.includes(raw.reasonCode)))
    fail('SETUP_INSTALLER_STATUS_INVALID');
  if(raw.reasonCode==='UNBOUND'){
    if(raw.ready||raw.clusterId!==null||raw.bindingSha256!==null||raw.releaseSha256!==null||raw.credential!==null)
      fail('SETUP_INSTALLER_STATUS_INVALID');
  }else if(raw.clusterId!==binding.clusterId||raw.bindingSha256!==binding.bindingHash||raw.releaseSha256!==binding.releaseFingerprint)
    fail('SETUP_INSTALLER_TARGET_CHANGED');
  const c=raw.credential;
  if(c!==null){
    if(!exact(c,['id','notBefore','expiresAt','revokedAt','retireAfter'])||!uuid(c.id)
      ||['notBefore','expiresAt'].some(k=>typeof c[k]!=='string'||!Number.isFinite(Date.parse(c[k])))
      ||['revokedAt','retireAfter'].some(k=>c[k]!==null&&(typeof c[k]!=='string'||!Number.isFinite(Date.parse(c[k]))))
      ||Date.parse(c.expiresAt)<=Date.parse(c.notBefore)||Date.parse(c.expiresAt)-Date.parse(c.notBefore)>3600000)
      fail('SETUP_INSTALLER_STATUS_INVALID');
  }
  if(raw.ready&&(!c||c.revokedAt!==null||Date.parse(c.notBefore)>Date.parse(raw.observedAt)
    ||Date.parse(c.expiresAt)<=Date.parse(raw.observedAt)||c.retireAfter!==null&&Date.parse(c.retireAfter)<=Date.parse(raw.observedAt)))
    fail('SETUP_INSTALLER_STATUS_INVALID');
  return Object.freeze(structuredClone(raw));
}

export function setupCredentialInstallerCommand(raw,binding,capability){
  const op=raw?.operation;
  if(op==='check'){if(!exact(raw,['version','operation'])||raw.version!==1)fail('SETUP_INSTALLER_COMMAND_INVALID');return structuredClone(raw)}
  if(op==='publish'){
    if(!exact(raw,['version','operation','key'])||raw.version!==1||!uuid(raw.key)||capability!=='issuer')fail('SETUP_INSTALLER_COMMAND_INVALID');
    return structuredClone(raw);
  }
  const common=['version','operation','key','requestId','reason','expectedVersion','clusterId','bindingSha256','releaseSha256'];
  const fields=op==='issue'?['predecessorId','ttlSeconds','overlapSeconds','signerAlgorithm','signerFingerprint']
    :op==='bind'?['expectedClusterId','expectedBindingSha256']:op==='revoke'?['credentialId']:null;
  if(!fields||!exact(raw,[...common,...fields])||raw.version!==1||!uuid(raw.key)||!uuid(raw.requestId)
    ||typeof raw.reason!=='string'||raw.reason.trim()!==raw.reason||raw.reason.length<5||raw.reason.length>1000
    ||!Number.isSafeInteger(raw.expectedVersion)||raw.expectedVersion<0||raw.expectedVersion>=9007199254740990
    ||raw.clusterId!==binding.clusterId||raw.bindingSha256!==binding.bindingHash||raw.releaseSha256!==binding.releaseFingerprint
    ||(op==='issue')!==(capability==='issuer'))fail('SETUP_INSTALLER_COMMAND_INVALID');
  if(op==='issue'&&(raw.predecessorId!==null&&!uuid(raw.predecessorId)||!Number.isSafeInteger(raw.ttlSeconds)||raw.ttlSeconds<120||raw.ttlSeconds>3600
    ||!Number.isSafeInteger(raw.overlapSeconds)||raw.overlapSeconds<10||raw.overlapSeconds>60
    ||!['HS256','RS256','ES256'].includes(raw.signerAlgorithm)||!digest(raw.signerFingerprint)))fail('SETUP_INSTALLER_COMMAND_INVALID');
  if(op==='revoke'&&!uuid(raw.credentialId)||op==='bind'&&(raw.expectedClusterId!==null&&!ref(raw.expectedClusterId)
    ||raw.expectedBindingSha256!==null&&!digest(raw.expectedBindingSha256)
    ||(raw.expectedClusterId===null)!==(raw.expectedBindingSha256===null)))fail('SETUP_INSTALLER_COMMAND_INVALID');
  return structuredClone(raw);
}

const directoryIdentity=`SELECT s.system_identifier::text AS "systemIdentifier",d.oid::text AS "databaseOid",d.datname AS "databaseName",
 session_user::text AS role,current_user=session_user AS "actualLogin",r.rolconnlimit AS "roleConnectionLimit",
 current_setting('transaction_read_only')='on' AS "readOnly",pg_is_in_recovery() AS "inRecovery",
 current_setting('max_connections')::int AS "maxConnections",current_setting('superuser_reserved_connections')::int
  +coalesce(current_setting('reserved_connections',true),'0')::int AS "reservedConnections",
 (SELECT array_agg(p.rolname::text ORDER BY p.rolname) FROM pg_roles p WHERE pg_has_role(session_user,p.oid,'MEMBER') AND p.oid<>r.oid) AS memberships,
 r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls AS elevated
 FROM pg_control_system() s JOIN pg_database d ON d.datname=current_database() JOIN pg_roles r ON r.rolname=session_user`;
export function assertSetupInstallerIdentity(value,expected,budget){
  if(!value||Object.entries(expected).some(([k,v])=>value[k]!==v)||value.inRecovery!==false||value.readOnly!==true||value.roleConnectionLimit!==1
    ||!Number.isSafeInteger(value.maxConnections)||value.maxConnections<budget.maxConnections
    ||!Number.isSafeInteger(value.reservedConnections)||value.reservedConnections>budget.reservedConnections)
    fail('SETUP_INSTALLER_DATABASE_MISMATCH');
}
export async function setupCredentialBusinessPreflight(client,loaded,capability){
  const {config,contexts}=loaded,expected=config.target.expected;
  const value=(await client.query('SELECT roomqc_setup_admin.preflight() AS value')).rows[0]?.value;
  assertSetupInstallerIdentity(value,config.business.expected,assertSetupCredentialBudget(config,contexts.business,'business'));
  const m=value.manifest;
  if(value.capability!==capability||value.memberships!==1||value.schemaFingerprintVersion!==3||value.schemaManifestHash!==expected.schemaManifestHash
    ||!m||m.contractVersion!==3||m.schemaFingerprintVersion!==3||m.expectedSchemaManifestHash!==expected.schemaManifestHash
    ||Object.entries(expected).some(([key,v])=>key!=='schemaManifestHash'&&m[key]!==v))fail('SETUP_INSTALLER_RELEASE_MISMATCH');
  return value;
}

export async function runSetupCredentialInstaller(args,{env=process.env,expectedConfigSha256=null}={}){
  const parsed=setupCredentialInstallerArguments(args);if(parsed.help)return {help:true};
  const allowLocal=parsed.allowLocal&&env.NODE_ENV!=='production';
  if(process.platform!=='linux'&&!allowLocal)fail('SETUP_INSTALLER_PLATFORM_UNSUPPORTED');
  let business,directory,loaded,command,dispatched=false,timer;
  try{
    loaded=await loadSetupCredentialInstaller(parsed.configFile,{allowLocal,commandFile:parsed.commandFile});
    if(expectedConfigSha256!==null&&(!digest(expectedConfigSha256)||loaded.files.get(parsed.configFile)?.hash!==expectedConfigSha256))
      fail('SETUP_INSTALLER_FILES_CHANGED');
    const {config}=loaded,capability=config.consumerId==='setup-credential-installer'?'installer':'issuer';
    const binding=recoveryBinding(config.target.cluster,config.target.expected);
    const commandText=await readSetupBackfillFile(parsed.commandFile,16384);
    command=setupCredentialInstallerCommand(JSON.parse(commandText),binding,capability);
    if(command.operation==='issue'&&(command.signerAlgorithm!==config.publisher.signer.algorithm||command.signerFingerprint!==config.publisher.signer.fingerprint))
      fail('SETUP_INSTALLER_SIGNER_MISMATCH');
    const clients={};
    for(const kind of ['directory','business']){
      clients[kind]=new pg.Client({...loaded.connections[kind],application_name:'roomqc-'+config.consumerId+'-'+kind});
      clients[kind].on('error',()=>{});
    }
    directory=clients.directory;business=clients.business;
    timer=setTimeout(()=>{directory.connection?.stream?.destroy();business.connection?.stream?.destroy()},45000);timer.unref();
    await directory.connect();
    const identity=(await directory.query(directoryIdentity)).rows[0];
    assertSetupInstallerIdentity(identity,config.directory.expected,assertSetupCredentialBudget(config,loaded.contexts.directory,'directory'));
    if(identity.actualLogin!==true||identity.elevated!==false
      ||credentialCanonical(identity.memberships)!==credentialCanonical(['roomqc_control_setup_credential_observer']))fail('SETUP_INSTALLER_PRIVILEGES_UNSAFE');
    if(!(await directory.query('SELECT pg_try_advisory_lock_shared(727000) AS locked')).rows[0]?.locked)fail('SETUP_INSTALLER_MIGRATION_BUSY');
    const manifest=await migrationManifest();if(await verifyHistory(directory,manifest)!==manifest.length)fail('SETUP_INSTALLER_SCHEMA_PENDING');
    if(!(await directory.query('SELECT pg_try_advisory_lock_shared(727001) AS locked')).rows[0]?.locked)fail('SETUP_INSTALLER_AUTHORITY_BUSY');
    const authority=async()=>{
      await loaded.assertFiles();
      if(hash(await readSetupBackfillFile(parsed.commandFile,16384))!==hash(commandText))fail('SETUP_INSTALLER_FILES_CHANGED');
      const approved=loaded.current(),row=(await directory.query(releaseAuthoritySelect,[binding.clusterId])).rows[0];
      if(!releaseAuthorityMatches(row,approved))fail('SETUP_INSTALLER_AUTHORITY_CHANGED');
      const cluster=(await directory.query('SELECT api_url,credential_ref FROM roomqc_control.clusters WHERE id=$1',[binding.clusterId])).rows[0];
      if(cluster?.api_url!==binding.url||cluster.credential_ref!==binding.credentialRef){
        process.stderr.write(JSON.stringify({event:'setup_installer_target_mismatch',clusterApiUrl:cluster?.api_url??null,bindingUrl:binding.url??null,clusterCredentialRef:cluster?.credential_ref??null,bindingCredentialRef:binding.credentialRef??null})+'\n');
        fail('SETUP_INSTALLER_TARGET_CHANGED');
      }
    };
    await authority();await business.connect();
    if(!(await business.query('SELECT pg_try_advisory_lock(727012) AS locked')).rows[0]?.locked)fail('SETUP_INSTALLER_BUSY');
    await setupCredentialBusinessPreflight(business,loaded,capability);
    const fence=async()=>{await authority();await setupCredentialBusinessPreflight(business,loaded,capability)};
    if(command.operation==='check'){
      const state=(await business.query('SELECT roomqc_setup_admin.status() AS value')).rows[0].value;await fence();
      let observation;
      try{observation=setupCredentialInstallerObservation(state,binding)}catch(error){
        process.stderr.write(JSON.stringify({event:'setup_installer_status_observation_mismatch',code:error.code??error.message,
          raw:{contractVersion:state?.contractVersion??null,version:state?.version??null,clusterId:state?.clusterId??null,
            bindingSha256:state?.bindingSha256??null,releaseSha256:state?.releaseSha256??null,observedAt:state?.observedAt??null,
            ready:state?.ready??null,reasonCode:state?.reasonCode??null,historicalResult:state?.historicalResult??null,
            credential:state?.credential??null},expected:{clusterId:binding.clusterId,bindingSha256:binding.bindingHash,releaseSha256:binding.releaseFingerprint}})+'\n');
        throw error;
      }
      return {ok:true,operation:'check',preflightVerified:true,credentialReady:state.ready===true,reasonCode:state.reasonCode,
        stateVersion:state.version,capability,observation};
    }
    let result;
    if(command.operation==='publish')result=(await business.query('SELECT roomqc_setup_admin.receipt($1::uuid) AS value',[command.key])).rows[0].value;
    else{
      if(command.operation==='issue'){
        const now=Math.floor(Date.now()/1000),synthetic={commandId:command.key,operation:'issue',version:command.expectedVersion+1,
          clusterId:binding.clusterId,bindingSha256:binding.bindingHash,releaseSha256:binding.releaseFingerprint,
          credentialId:command.key,affectedIds:[command.key],historicalResult:true,predecessorId:command.predecessorId,
          overlapDeadline:command.predecessorId===null?null:new Date(Date.now()+command.overlapSeconds*1000).toISOString(),iat:now,exp:now+command.ttlSeconds,
          signerAlgorithm:command.signerAlgorithm,signerFingerprint:command.signerFingerprint};
        // Preflight the signer without minting a JWT or persisting synthetic claims.
        await loadCredentialReceiptSigner(config.publisher.signer,synthetic);
      }
      await fence();await business.query('SET default_transaction_read_only=off');dispatched=true;
      const operation=command.operation==='issue'&&config.consumerId==='setup-credential-rotation'?'rotate':command.operation;
      result=(await business.query('SELECT roomqc_setup_admin.'+operation+'($1::jsonb) AS value',[command])).rows[0].value;
      await business.query('SET default_transaction_read_only=on');
    }
    await fence();
    if(['issue','publish'].includes(command.operation)){
      credentialIssueReceipt(result,binding);
      const publication=await publishSetupCredential({client:business,target:{...config.target,allowLocal:config.environment==='local'},
        receipt:result,...config.publisher,assertAuthority:fence,allowWindowsLocal:allowLocal});
      return {ok:true,operation:command.operation,commandId:result.commandId,credentialId:result.credentialId,
        expiresAt:publication.expiresAt,filePublished:publication.filePublished,nativeRpcVerified:publication.nativeRpcVerified,
        historicalResult:false,preflightVerified:true};
    }
    return {ok:true,operation:command.operation,commandId:result.commandId,stateVersion:result.version,historicalResult:true,currentCredentialReady:false};
  }catch(error){
    throw setupCredentialInstallerFailure(error,command,dispatched);
  }finally{
    clearTimeout(timer);
    // Discard dedicated sessions; no lock-bearing client returns to a pool.
    await Promise.allSettled([business,directory].filter(Boolean).map(async client=>{
      client.connection?.stream?.destroy();await client.end();
    }));
  }
}
