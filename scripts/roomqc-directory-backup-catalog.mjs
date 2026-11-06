// Snapshot projection for the independent control-plane database. All row
// values stay inside the dump; inventory contains hashes and catalog metadata.
export const directoryInventorySQL = `
SET LOCAL search_path=pg_catalog;
SELECT jsonb_build_object('kind','table','name',n.nspname||'.'||c.relname,'rls',c.relrowsecurity,
 'force_rls',c.relforcerowsecurity,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl)::text
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='roomqc_control' AND c.relkind IN ('r','p') ORDER BY c.relname;
SELECT jsonb_build_object('kind','column','table',n.nspname||'.'||c.relname,'name',a.attname,'position',a.attnum,
 'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
 'default',pg_get_expr(d.adbin,d.adrelid,false),'acl',a.attacl)::text
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE n.nspname='roomqc_control' AND c.relkind IN ('r','p') ORDER BY c.relname,a.attnum;
SELECT jsonb_build_object('kind','constraint','table',n.nspname||'.'||c.relname,'name',k.conname,
 'valid',k.convalidated,'definition',pg_get_constraintdef(k.oid,false))::text
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='roomqc_control' ORDER BY c.relname,k.conname;
SELECT jsonb_build_object('kind','index','table',n.nspname||'.'||c.relname,'name',i.relname,
 'definition',pg_get_indexdef(i.oid,0,false),'valid',x.indisvalid,'ready',x.indisready)::text
 FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='roomqc_control' ORDER BY c.relname,i.relname;
SELECT jsonb_build_object('kind','function','name',n.nspname||'.'||p.proname,'args',pg_get_function_identity_arguments(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'definition_hash',md5(pg_get_functiondef(p.oid)))::text
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='roomqc_control' AND p.prokind IN ('f','p')
 ORDER BY p.proname,pg_get_function_identity_arguments(p.oid);
SELECT jsonb_build_object('kind','policy','table',schemaname||'.'||tablename,'name',policyname,'roles',roles,
 'cmd',cmd,'permissive',permissive,'qual',qual,'check',with_check)::text FROM pg_policies
 WHERE schemaname='roomqc_control' ORDER BY tablename,policyname;
SELECT jsonb_build_object('kind','trigger','table',n.nspname||'.'||c.relname,'name',t.tgname,
 'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid))::text FROM pg_trigger t
 JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='roomqc_control' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname;
SELECT jsonb_build_object('kind','schema','name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl)::text
 FROM pg_namespace n WHERE n.nspname='roomqc_control';
SELECT jsonb_build_object('kind','role','name',rolname,'superuser',rolsuper,'inherit',rolinherit,'create_role',rolcreaterole,
 'create_db',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypass_rls',rolbypassrls,
 'connection_limit',rolconnlimit,'config',rolconfig,'valid_until',extract(epoch FROM rolvaliduntil))::text FROM pg_roles ORDER BY rolname;
SELECT jsonb_build_object('kind','role_membership','name',pg_get_userbyid(roleid)||':'||pg_get_userbyid(member)||':'||pg_get_userbyid(grantor),
 'admin',admin_option,'inherit',inherit_option,'set',set_option)::text FROM pg_auth_members
 ORDER BY pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor);
SELECT format('SELECT jsonb_build_object(''kind'',''data'',''name'',%L,''count'',count(*),''hash'',md5(coalesce(string_agg(row_text,E''\\n'' ORDER BY row_text COLLATE "C"),'''')))::text FROM (SELECT to_jsonb(t)::text AS row_text FROM %I.%I t) r;',
 n.nspname||'.'||c.relname,n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='roomqc_control' AND c.relkind='r' ORDER BY c.relname;
\\gexec
`;

// ACL arrays are unordered grant sets. NULL on a table is the PostgreSQL
// default (owner ALL, no PUBLIC grant), not an empty grant set. pg_dump omits
// an explicitly stored ACL equal to that default. Do not equate [] with NULL.
export function compareDirectoryInventories(expected, restored) {
  const normalized = rows => rows.map(row => {
    if (!Object.hasOwn(row,'acl')) return row;
    if (row.acl === null) {
      if (row.kind !== 'table') return row;
      if (typeof row.owner !== 'string' || !/^[a-z_][a-z0-9_]*$/.test(row.owner))
        throw new Error('DIRECTORY_BACKUP_ACL_OWNER_UNSUPPORTED');
      return {...row,acl:[row.owner+'=arwdDxt/'+row.owner]};
    }
    if (!Array.isArray(row.acl) || row.acl.some(value => typeof value !== 'string'))
      throw new Error('DIRECTORY_BACKUP_ACL_INVALID');
    return {...row,acl:[...row.acl].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)))};
  });
  return JSON.stringify(normalized(expected)) === JSON.stringify(normalized(restored));
}
