// Canonical logical-backup catalog used for both source snapshots and offline restores.
import {extensionMemberInventorySQL} from './roomqc-restore-extension-members.mjs';
export const inventorySQL = `
SET LOCAL search_path='';
SELECT jsonb_build_object('kind','table','name',n.nspname||'.'||c.relname,
  'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'owner',pg_get_userbyid(c.relowner),
  'acl',(SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(coalesce(c.relacl,acldefault('r',c.relowner))) a))::text
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','auth','private','storage','supabase_migrations') ORDER BY n.nspname,c.relname;
SELECT jsonb_build_object('kind','policy','table',schemaname||'.'||tablename,'name',policyname,
  'roles',roles,'cmd',cmd,'permissive',permissive,'qual',qual,'check',with_check)::text FROM pg_policies
WHERE schemaname IN ('public','auth','private','storage') ORDER BY schemaname,tablename,policyname;
SELECT jsonb_build_object('kind','constraint','table',n.nspname||'.'||c.relname,'name',k.conname,
  'definition',pg_get_constraintdef(k.oid),'valid',k.convalidated)::text
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','auth','private','storage') ORDER BY n.nspname,c.relname,k.conname;
SELECT jsonb_build_object('kind','function','name',n.nspname||'.'||p.proname,
  'args',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),
  'acl',(SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(p.proacl) a),
  'definition_hash',md5(pg_get_functiondef(p.oid)))::text
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f'
  AND n.nspname IN ('public','auth','private') ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid);
${extensionMemberInventorySQL}
SELECT jsonb_build_object('kind','schema','name',n.nspname,'owner',pg_get_userbyid(n.nspowner),
  'acl',(SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(coalesce(n.nspacl,acldefault('n',n.nspowner))) a),
  'privileges',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
    ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) COLLATE "C",a.privilege_type,a.is_grantable)
    FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a))::text
FROM pg_namespace n WHERE n.nspname IN ('public','auth','private','storage','graphql','graphql_public','supabase_migrations','pgmq') ORDER BY n.nspname;
SELECT jsonb_build_object('kind','sequence','name',n.nspname||'.'||c.relname,'owner',pg_get_userbyid(c.relowner),
  'acl',(SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(coalesce(c.relacl,acldefault('s',c.relowner))) a))::text
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S'
  AND n.nspname IN ('public','auth','private','storage') ORDER BY n.nspname,c.relname;
SELECT jsonb_build_object('kind','default_acl','name',pg_get_userbyid(d.defaclrole)||'.'||coalesce(n.nspname,'*')||'.'||d.defaclobjtype::text,
  'acl',(SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(d.defaclacl) a))::text
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
-- pgmq's extension bootstrap creates pg_monitor defaults on the restore image;
-- they are vendor-managed and are intentionally excluded from the application
-- privilege manifest. Application schemas and database-wide defaults remain
-- compared exactly.
WHERE n.nspname IN ('public','auth','private','storage','graphql','graphql_public') OR d.defaclnamespace=0
ORDER BY pg_get_userbyid(d.defaclrole),coalesce(n.nspname,'*'),d.defaclobjtype;
SELECT jsonb_build_object('kind','trigger','table',n.nspname||'.'||c.relname,'name',t.tgname,
  'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid))::text
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth','private','storage') ORDER BY n.nspname,c.relname,t.tgname;
SELECT jsonb_build_object('kind','role','name',rolname,'superuser',rolsuper,'inherit',rolinherit,
  'create_role',rolcreaterole,'create_db',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,
  'bypass_rls',rolbypassrls,'connection_limit',rolconnlimit,'config',rolconfig,
  'valid_until',extract(epoch FROM rolvaliduntil))::text FROM pg_roles ORDER BY rolname;
SELECT jsonb_build_object('kind','role_membership','name',pg_get_userbyid(roleid)||':'||pg_get_userbyid(member)||':'||pg_get_userbyid(grantor),
  'admin',admin_option,'inherit',inherit_option,'set',set_option)::text FROM pg_auth_members
ORDER BY pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor);
SELECT format('SELECT jsonb_build_object(''kind'',''data'',''name'',%L,''count'',count(*),''hash'',md5(coalesce(string_agg(row_text,E''\\n'' ORDER BY row_text COLLATE "C"),'''')))::text FROM (SELECT to_jsonb(t)::text AS row_text FROM %I.%I t) r;',
  n.nspname||'.'||c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='r' AND n.nspname IN ('public','auth','private','storage','supabase_migrations')
ORDER BY n.nspname,c.relname;
\\gexec
`;
export const inventory = raw => raw.trim().split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));

// PostgreSQL 17 deparses BETWEEN as a nested AND, then flattens that AND when
// pg_restore parses the dumped CHECK. Accept only this reviewed pair on this
// exact object. Never strip arbitrary parentheses or discard constraint fields.
export const supportTargetCheckDefinitions = Object.freeze([
  "CHECK ((((length(target) >= 2) AND (length(target) <= 48)) AND (target ~ '^[a-z0-9][a-z0-9-]*$'::text)))",
  "CHECK (((length(target) >= 2) AND (length(target) <= 48) AND (target ~ '^[a-z0-9][a-z0-9-]*$'::text)))",
]);
const reviewedConstraint = row => row?.kind === 'constraint' && row.table === 'private.platform_support_acceptances'
  && row.name === 'platform_support_acceptances_target_check' && supportTargetCheckDefinitions.includes(row.definition);
export function compareBackupInventories(expected, restored) {
  if (!Array.isArray(expected) || !Array.isArray(restored) || expected.length !== restored.length)
    return {matches: false, reviewedDeparserDeltas: []};
  const deltas = [];
  for (let i = 0; i < expected.length; i++) {
    const before = expected[i], after = restored[i];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (!reviewedConstraint(before) || !reviewedConstraint(after)
      || JSON.stringify({...before, definition: null}) !== JSON.stringify({...after, definition: null}))
      return {matches: false, reviewedDeparserDeltas: []};
    deltas.push({rule: 'postgres17-support-target-and-flattening-v1', table: before.table,
      name: before.name, sourceDefinition: before.definition, restoredDefinition: after.definition});
  }
  return {matches: true, reviewedDeparserDeltas: deltas};
}
