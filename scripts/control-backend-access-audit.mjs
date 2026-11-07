// Catalog-only defensive inventory. Source bodies are kept in the fixture's
// private directory; the public summary contains names/counts, never bodies.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildAccessCandidateGraph} from './control-backend-access-graph.mjs';

export const accessCatalogSql=`WITH audit_targets AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','private') AND c.relkind='r' AND c.relrowsecurity
    AND NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)
) SELECT json_build_object(
  'checkedAt',clock_timestamp(),
  'noPolicyTables',(SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'name',c.relname,
    'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
    'privileges',(SELECT json_agg(json_build_object('role',r.rolname,'schemaUsage',has_schema_privilege(r.oid,n.oid,'USAGE'),
      'table',has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
      'column',has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')) ORDER BY r.rolname)
      FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role','roomqc_control_probe')))
    ORDER BY n.nspname,c.relname),'[]'::json)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','private') AND c.relkind='r' AND c.relrowsecurity
      AND NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)),
  'functions',(SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'name',p.proname,
    'identity',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'language',l.lanname,'returnType',p.prorettype::regtype::text,
    'definer',p.prosecdef,'config',coalesce(p.proconfig,ARRAY[]::text[]),'source',p.prosrc,
    'dependencies',(SELECT coalesce(json_agg(x.value ORDER BY x.value::text),'[]'::json) FROM (
      SELECT DISTINCT jsonb_build_object('kind','function','schema',dn.nspname,'name',dp.proname,
        'identity',dp.oid::regprocedure::text) AS value
      FROM pg_depend d JOIN pg_proc dp ON d.refclassid='pg_proc'::regclass AND d.refobjid=dp.oid
      JOIN pg_namespace dn ON dn.oid=dp.pronamespace
      WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND dn.nspname IN ('public','private')
      UNION
      SELECT DISTINCT jsonb_build_object('kind','relation','schema',dn.nspname,'name',dc.relname)
      FROM pg_depend d JOIN pg_class dc ON d.refclassid='pg_class'::regclass AND d.refobjid=dc.oid
      JOIN pg_namespace dn ON dn.oid=dc.relnamespace
      WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND dn.nspname IN ('public','private')
    ) x),
    'execute',(SELECT json_agg(json_build_object('role',r.rolname,'allowed',has_function_privilege(r.oid,p.oid,'EXECUTE'),
      'schemaUsage',has_schema_privilege(r.oid,n.oid,'USAGE')) ORDER BY r.rolname)
      FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role','roomqc_control_probe')))
    ORDER BY n.nspname,p.proname,p.oid::regprocedure::text),'[]'::json)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname IN ('public','private') AND p.prokind='f'),
  'views',(SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),
    'kind',c.relkind,'options',coalesce(c.reloptions,ARRAY[]::text[]),'definition',pg_get_viewdef(c.oid,true),
    'dependencies',(SELECT coalesce(json_agg(DISTINCT jsonb_build_object('schema',rn.nspname,'name',rc.relname)),'[]'::json)
      FROM pg_rewrite rw JOIN pg_depend d ON d.classid='pg_rewrite'::regclass AND d.objid=rw.oid
      JOIN pg_class rc ON d.refclassid='pg_class'::regclass AND d.refobjid=rc.oid
      JOIN pg_namespace rn ON rn.oid=rc.relnamespace WHERE rw.ev_class=c.oid AND rc.oid<>c.oid),
    'functionDependencies',(SELECT coalesce(json_agg(DISTINCT jsonb_build_object('schema',fn.nspname,
      'name',fp.proname,'identity',fp.oid::regprocedure::text)),'[]'::json)
      FROM pg_rewrite rw JOIN pg_depend d ON d.classid='pg_rewrite'::regclass AND d.objid=rw.oid
      JOIN pg_proc fp ON d.refclassid='pg_proc'::regclass AND d.refobjid=fp.oid
      JOIN pg_namespace fn ON fn.oid=fp.pronamespace
      WHERE rw.ev_class=c.oid AND fn.nspname IN ('public','private')),
    'privileges',(SELECT json_agg(json_build_object('role',r.rolname,'table',has_table_privilege(r.oid,c.oid,'SELECT'),
      'column',has_any_column_privilege(r.oid,c.oid,'SELECT'),'schemaUsage',has_schema_privilege(r.oid,n.oid,'USAGE')) ORDER BY r.rolname)
      FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role','roomqc_control_probe')))
    ORDER BY n.nspname,c.relname),'[]'::json)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('v','m')),
  'policies',(SELECT coalesce(json_agg(json_build_object('schema',schemaname,'table',tablename,'name',policyname,
    'permissive',permissive,'roles',roles,'operation',cmd,'using',qual,'check',with_check)
    ORDER BY schemaname,tablename,policyname),'[]'::json) FROM pg_policies WHERE schemaname IN ('public','private')),
  'triggers',(SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,
    'enabled',t.tgenabled,'eventMask',t.tgtype,'functionSchema',fn.nspname,'functionIdentity',fp.oid::regprocedure::text,
    'privileges',(SELECT json_agg(json_build_object('role',r.rolname,'schemaUsage',has_schema_privilege(r.oid,n.oid,'USAGE'),
      'insert',has_table_privilege(r.oid,c.oid,'INSERT') OR has_any_column_privilege(r.oid,c.oid,'INSERT'),
      'update',has_table_privilege(r.oid,c.oid,'UPDATE') OR has_any_column_privilege(r.oid,c.oid,'UPDATE'),
      'delete',has_table_privilege(r.oid,c.oid,'DELETE'),'truncate',has_table_privilege(r.oid,c.oid,'TRUNCATE')) ORDER BY r.rolname)
      FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role','roomqc_control_probe')))
    ORDER BY n.nspname,c.relname,t.tgname),'[]'::json)
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc fp ON fp.oid=t.tgfoid JOIN pg_namespace fn ON fn.oid=fp.pronamespace
    WHERE NOT t.tgisinternal AND (n.nspname IN ('public','private') OR fn.nspname IN ('public','private'))),
  'targetForeignKeys',(SELECT coalesce(json_agg(json_build_object(
    'schema',n.nspname,'table',c.relname,'name',k.conname,
    'referencedSchema',rn.nspname,'referencedTable',rc.relname,
    'sourceIsTarget',k.conrelid IN (SELECT oid FROM audit_targets),
    'referencedIsTarget',k.confrelid IN (SELECT oid FROM audit_targets),
    'definition',pg_get_constraintdef(k.oid),'deleteAction',k.confdeltype,'updateAction',k.confupdtype,
    'deferrable',k.condeferrable,'initiallyDeferred',k.condeferred,
    'sourcePrivileges',(SELECT json_agg(json_build_object('role',r.rolname,
      'schemaUsage',has_schema_privilege(r.oid,n.oid,'USAGE'),
      'insert',has_table_privilege(r.oid,c.oid,'INSERT') OR has_any_column_privilege(r.oid,c.oid,'INSERT'),
      'update',has_table_privilege(r.oid,c.oid,'UPDATE') OR has_any_column_privilege(r.oid,c.oid,'UPDATE'),
      'delete',has_table_privilege(r.oid,c.oid,'DELETE')) ORDER BY r.rolname)
      FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role','roomqc_control_probe')),
    'referencedPrivileges',(SELECT json_agg(json_build_object('role',r.rolname,
      'schemaUsage',has_schema_privilege(r.oid,rn.oid,'USAGE'),
      'update',has_table_privilege(r.oid,rc.oid,'UPDATE') OR has_any_column_privilege(r.oid,rc.oid,'UPDATE'),
      'delete',has_table_privilege(r.oid,rc.oid,'DELETE')) ORDER BY r.rolname)
      FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role','roomqc_control_probe'))
    ) ORDER BY n.nspname,c.relname,k.conname),'[]'::json)
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_class rc ON rc.oid=k.confrelid JOIN pg_namespace rn ON rn.oid=rc.relnamespace
    WHERE k.contype='f' AND (k.conrelid IN (SELECT oid FROM audit_targets) OR k.confrelid IN (SELECT oid FROM audit_targets))),
  'authorityRoles',(SELECT json_agg(json_build_object('name',r.rolname,'superuser',r.rolsuper,
    'bypassRls',r.rolbypassrls,'inherit',r.rolinherit) ORDER BY r.rolname)
    FROM pg_roles r WHERE r.rolname IN ('postgres','anon','authenticated','service_role','roomqc_control_probe')),
  'foreignKeys',(SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',k.conname,
    'definition',pg_get_constraintdef(k.oid),'columns',(SELECT json_agg(a.attname ORDER BY key.ordinality)
      FROM unnest(k.conkey) WITH ORDINALITY key(num,ordinality) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=key.num),
    'indexes',(SELECT coalesce(json_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text),'[]'::json)
      FROM pg_index i WHERE i.indrelid=c.oid)) ORDER BY n.nspname,c.relname,k.conname),'[]'::json)
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE k.contype='f' AND ((n.nspname='private' AND c.relname IN ('hotel_room_setup','subscription_status_job_runs','workspace_provisioning'))
      OR (n.nspname='public' AND c.relname='staff_invitations')))
);`;

const identifier=/^[a-z_][a-z0-9_]*$/;
const browser=['anon','authenticated'];
const callable=(fn,role)=>fn.execute.some(p=>p.role===role&&p.allowed&&p.schemaUsage);
function validate(input){
  assert.ok(input&&typeof input==='object');
  for(const field of ['noPolicyTables','functions','views','policies','foreignKeys'])assert.ok(Array.isArray(input[field]),'Missing catalog group '+field);
  for(const table of input.noPolicyTables){assert.ok(identifier.test(table.schema)&&identifier.test(table.name));assert.ok(Array.isArray(table.privileges));assert.equal(table.rls,true)}
  for(const fn of input.functions){assert.ok(identifier.test(fn.schema)&&identifier.test(fn.name));assert.equal(typeof fn.source,'string');
    assert.equal(typeof fn.identity,'string');assert.equal(typeof fn.definer,'boolean');assert.ok(Array.isArray(fn.execute)&&Array.isArray(fn.config))}
  for(const view of input.views)assert.ok(identifier.test(view.schema)&&identifier.test(view.name)&&Array.isArray(view.dependencies)&&Array.isArray(view.privileges));
  if(input.targetForeignKeys!==undefined){
    assert.ok(Array.isArray(input.targetForeignKeys));const seen=new Set();
    for(const fk of input.targetForeignKeys){
      for(const field of ['schema','table','name','referencedSchema','referencedTable'])assert.ok(identifier.test(fk[field]));
      const id=fk.schema+'.'+fk.table+':'+fk.name;assert.ok(!seen.has(id));seen.add(id);
      assert.ok(fk.sourceIsTarget===true||fk.referencedIsTarget===true);
      for(const action of [fk.deleteAction,fk.updateAction])assert.ok(['a','r','c','n','d'].includes(action));
      for(const field of ['sourcePrivileges','referencedPrivileges']){
        assert.ok(Array.isArray(fk[field]));for(const p of fk[field]){
          assert.ok(identifier.test(p.role));for(const field of ['schemaUsage','update','delete'])assert.equal(typeof p[field],'boolean');
        }
      }
    }
  }
  if(input.authorityRoles!==undefined){assert.ok(Array.isArray(input.authorityRoles));
    for(const role of input.authorityRoles){assert.ok(identifier.test(role.name));
      for(const field of ['superuser','bypassRls','inherit'])assert.equal(typeof role[field],'boolean');}}
}
export function summarizeAccessCatalog(input){
  validate(input);
  const directPrivileges=input.noPolicyTables.flatMap(t=>t.privileges.filter(p=>browser.includes(p.role)&&(p.table||p.column))
    .map(p=>({table:t.schema+'.'+t.name,role:p.role})));
  // Text matches discover review candidates only. PL/pgSQL/dynamic SQL are not
  // fully represented in pg_depend; absence here can NEVER prove non-reachability.
  const tableCandidates=input.noPolicyTables.map(table=>{
    const expression=new RegExp('\\b'+table.name+'\\b','i');
    const functions=input.functions.filter(fn=>expression.test(fn.source)).map(fn=>({identity:fn.identity,definer:fn.definer,
      browserRoles:browser.filter(role=>callable(fn,role)),searchPath:fn.config.filter(c=>c.startsWith('search_path='))}));
    const views=input.views.filter(v=>v.dependencies.some(d=>d.schema===table.schema&&d.name===table.name))
      .map(v=>({name:v.schema+'.'+v.name,browserRoles:v.privileges.filter(p=>browser.includes(p.role)&&(p.table||p.column)).map(p=>p.role),options:v.options}));
    return {table:table.schema+'.'+table.name,directFunctionCandidates:functions,directViewCandidates:views,status:'requires_explicit_caller_review'};
  });
  const candidateGraph=buildAccessCandidateGraph(input);
  return {contractVersion:3,checkedAt:input.checkedAt,counts:{noPolicyTables:input.noPolicyTables.length,functions:input.functions.length,
    views:input.views.length,policies:input.policies.length,foreignKeys:input.foreignKeys.length,
    targetForeignKeys:input.targetForeignKeys?.length??null,authorityRoles:input.authorityRoles?.length??null,
    externalSchemaTriggers:input.triggers?.filter(t=>!['public','private'].includes(t.schema)).length??null},directPrivileges,tableCandidates,
    targetForeignKeys:input.targetForeignKeys?.map(fk=>({...fk,status:'requires_parent_row_policy_and_runtime_review'}))??null,
    authorityRoles:input.authorityRoles??null,
    inventoryLimitations:{missingTargetForeignKeys:input.targetForeignKeys===undefined,
      missingAuthorityRoles:input.authorityRoles===undefined,foreignKeyEffectsProven:false},
    candidateGraph,
    staticCandidateDiscoveryOnly:true,transitiveReachabilityProven:false,allSafe:false};
}
export async function captureAccessCatalog({state,sql}){
  const raw=await sql(state,accessCatalogSql),parsed=JSON.parse(raw),summary=summarizeAccessCatalog(parsed);
  const bytes=Buffer.from(raw);await writeFile(join(state.root,'access-catalog-private.json'),bytes,{mode:0o600});
  await writeFile(join(state.root,'access-catalog-summary.json'),JSON.stringify(summary,null,2),{mode:0o600});
  assert.ok(Array.isArray(parsed.targetForeignKeys)&&Array.isArray(parsed.authorityRoles),'Current captures require expanded authority/FK inventory');
  return {contractVersion:3,checkedAt:parsed.checkedAt,sha256:createHash('sha256').update(bytes).digest('hex'),counts:summary.counts,
    inventoryLimitations:summary.inventoryLimitations,
    candidateGraph:{counts:summary.candidateGraph.counts,limitations:summary.candidateGraph.limitations},
    browserDirectGrantViolations:summary.directPrivileges.length,transitiveReachabilityProven:false,allSafe:false};
}
