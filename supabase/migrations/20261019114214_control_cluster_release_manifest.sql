-- Deployment identity is written by the release installer, never a browser.
-- The probe role can read only this metadata and catalog-derived schema hashes.
DO $role$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='roomqc_control_probe') THEN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='roomqc_control_probe'
        AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolconfig IS NOT NULL))
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m
        WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='roomqc_control_probe')
          OR (m.roleid=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='roomqc_control_probe')
            AND (m.member<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='authenticator') OR m.admin_option))) THEN
      RAISE EXCEPTION 'Existing probe role has unexpected privileges or membership';
    END IF;
  ELSE
    CREATE ROLE roomqc_control_probe NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB
      NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$role$;
GRANT roomqc_control_probe TO authenticator;
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA public, private, supabase_migrations TO roomqc_control_probe;
GRANT SELECT(version) ON supabase_migrations.schema_migrations TO roomqc_control_probe;

CREATE TABLE private.roomqc_release_manifest (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  cluster_id text NOT NULL CHECK (cluster_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  release_id text NOT NULL CHECK (release_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$'),
  contract_version integer NOT NULL CHECK (contract_version=3),
  schema_fingerprint_version integer NOT NULL CHECK (schema_fingerprint_version=1),
  artifact_digest text NOT NULL CHECK (artifact_digest ~ '^[a-f0-9]{64}$'),
  frontend_artifact_digest text NOT NULL CHECK (frontend_artifact_digest ~ '^[a-f0-9]{64}$'),
  migration_set_hash text NOT NULL CHECK (migration_set_hash ~ '^[a-f0-9]{64}$'),
  expected_schema_hash text NOT NULL CHECK (expected_schema_hash ~ '^[a-f0-9]{64}$'),
  installed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.roomqc_release_manifest ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.roomqc_release_manifest FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON private.roomqc_release_manifest TO roomqc_control_probe;
CREATE POLICY roomqc_probe_release_read ON private.roomqc_release_manifest
  FOR SELECT TO roomqc_control_probe USING (singleton);

CREATE FUNCTION private.roomqc_sorted_acl(p_acl aclitem[])
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog
AS $function$
  SELECT coalesce(jsonb_agg(v::text ORDER BY v::text COLLATE "C"),'[]'::jsonb)
  FROM unnest(p_acl) AS v
$function$;
REVOKE ALL ON FUNCTION private.roomqc_sorted_acl(aclitem[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.roomqc_sorted_acl(aclitem[]) TO roomqc_control_probe;

-- Canonical fingerprint v1: app and service namespaces, relation/column/type definitions,
-- constraints, indexes, functions, policies, triggers, publication membership,
-- effective ACLs/default ACLs, connected API role graph and migration versions.
-- Data, OIDs, comments, extension-owned objects and installation time are excluded.
-- The PostgreSQL major version is included: cross-major upgrades need a new build proof.
CREATE FUNCTION private.roomqc_schema_fingerprint()
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $function$
WITH RECURSIVE
app_namespaces AS (
  SELECT * FROM pg_namespace WHERE nspname IN ('public','private','auth','storage','realtime')
),
app_relations AS (
  SELECT c.*,n.nspname FROM pg_class c JOIN app_namespaces n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','S','f','c')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass
      AND d.objid=c.oid AND d.deptype='e')
),
app_types AS (
  SELECT t.*,n.nspname FROM pg_type t JOIN app_namespaces n ON n.oid=t.typnamespace
  WHERE t.typelem=0 AND (t.typrelid=0 OR EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=t.typrelid AND c.relkind='c'))
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass
      AND d.objid=t.oid AND d.deptype='e')
),
api_role_graph(role_id) AS (
  SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator','roomqc_control_probe')
  UNION
  SELECT CASE WHEN m.roleid=g.role_id THEN m.member ELSE m.roleid END
  FROM api_role_graph g JOIN pg_auth_members m ON m.member=g.role_id OR m.roleid=g.role_id
),
parts AS (
  SELECT 'namespace' AS kind,n.nspname::text AS identity,jsonb_build_object('owner',r.rolname,
    'acl',private.roomqc_sorted_acl(coalesce(n.nspacl,acldefault('n',n.nspowner)))) AS definition
  FROM app_namespaces n JOIN pg_roles r ON r.oid=n.nspowner
  UNION ALL
  SELECT 'relation',c.nspname||'.'||c.relname,jsonb_build_object('kind',c.relkind,'persistence',c.relpersistence,
    'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'replicaIdentity',c.relreplident,'owner',r.rolname,'options',c.reloptions,
    'acl',private.roomqc_sorted_acl(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))),
    'view',CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,false) END,
    'partitionKey',CASE WHEN c.relkind='p' THEN pg_get_partkeydef(c.oid) END,
    'partitionBound',pg_get_expr(c.relpartbound,c.oid,false),
    'parents',(SELECT jsonb_agg(np.nspname||'.'||p.relname ORDER BY i.inhseqno)
      FROM pg_inherits i JOIN pg_class p ON p.oid=i.inhparent JOIN pg_namespace np ON np.oid=p.relnamespace WHERE i.inhrelid=c.oid))
  FROM app_relations c JOIN pg_roles r ON r.oid=c.relowner
  UNION ALL
  SELECT 'column',c.nspname||'.'||c.relname||'.'||a.attname,jsonb_build_object('position',a.attnum,
    'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,'identity',a.attidentity,
    'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid,false),
    'collation',CASE WHEN a.attcollation<>0 THEN cn.nspname||'.'||co.collname END,
    'acl',private.roomqc_sorted_acl(a.attacl))
  FROM app_relations c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
  LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace
  UNION ALL
  SELECT 'sequence',c.nspname||'.'||c.relname,to_jsonb(s)-'seqrelid'-'seqtypid'||jsonb_build_object('type',format_type(s.seqtypid,NULL))
  FROM app_relations c JOIN pg_sequence s ON s.seqrelid=c.oid
  UNION ALL
  SELECT 'constraint',coalesce(c.nspname||'.'||c.relname,t.nspname||'.'||t.typname)||'.'||k.conname,
    jsonb_build_object('definition',pg_get_constraintdef(k.oid,false),'validated',k.convalidated)
  FROM pg_constraint k LEFT JOIN app_relations c ON c.oid=k.conrelid LEFT JOIN app_types t ON t.oid=k.contypid
  WHERE c.oid IS NOT NULL OR t.oid IS NOT NULL
  UNION ALL
  SELECT 'index',c.nspname||'.'||c.relname||'.'||i.relname,jsonb_build_object('definition',pg_get_indexdef(i.oid,0,false),
    'valid',x.indisvalid,'ready',x.indisready,'replicaIdentity',x.indisreplident)
  FROM app_relations c JOIN pg_index x ON x.indrelid=c.oid JOIN pg_class i ON i.oid=x.indexrelid
  UNION ALL
  SELECT 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
    jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',r.rolname,
      'acl',private.roomqc_sorted_acl(coalesce(p.proacl,acldefault('f',p.proowner))))
  FROM pg_proc p JOIN app_namespaces n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
  WHERE p.prokind IN ('f','p','w') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
  UNION ALL
  SELECT 'type',t.nspname||'.'||t.typname,jsonb_build_object('kind',t.typtype,'owner',r.rolname,
    'baseType',format_type(t.typbasetype,t.typtypmod),'notNull',t.typnotnull,'default',t.typdefault,
    'acl',private.roomqc_sorted_acl(coalesce(t.typacl,acldefault('T',t.typowner))),
    'enum',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid))
  FROM app_types t JOIN pg_roles r ON r.oid=t.typowner
  UNION ALL
  SELECT 'policy',c.nspname||'.'||c.relname||'.'||p.polname,jsonb_build_object('command',p.polcmd,
    'permissive',p.polpermissive,'using',pg_get_expr(p.polqual,p.polrelid,false),'check',pg_get_expr(p.polwithcheck,p.polrelid,false),
    'roles',(SELECT jsonb_agg(CASE WHEN v=0 THEN 'PUBLIC' ELSE r.rolname END ORDER BY CASE WHEN v=0 THEN 'PUBLIC' ELSE r.rolname END COLLATE "C")
      FROM unnest(p.polroles) v LEFT JOIN pg_roles r ON r.oid=v))
  FROM app_relations c JOIN pg_policy p ON p.polrelid=c.oid
  UNION ALL
  SELECT 'trigger',c.nspname||'.'||c.relname||'.'||t.tgname,jsonb_build_object('definition',pg_get_triggerdef(t.oid,false),'enabled',t.tgenabled)
  FROM app_relations c JOIN pg_trigger t ON t.tgrelid=c.oid WHERE NOT t.tgisinternal
  UNION ALL
  SELECT 'defaultAcl',coalesce(n.nspname,'*')||'.'||r.rolname||'.'||d.defaclobjtype::text,
    private.roomqc_sorted_acl(d.defaclacl)
  FROM pg_default_acl d LEFT JOIN app_namespaces n ON n.oid=d.defaclnamespace JOIN pg_roles r ON r.oid=d.defaclrole
  WHERE d.defaclnamespace=0 OR n.oid IS NOT NULL
  UNION ALL
  SELECT 'publication',p.pubname::text,jsonb_build_object('owner',r.rolname,
    'allTables',p.puballtables,'insert',p.pubinsert,'update',p.pubupdate,'delete',p.pubdelete,'truncate',p.pubtruncate,'viaRoot',p.pubviaroot)
  FROM pg_publication p JOIN pg_roles r ON r.oid=p.pubowner
  UNION ALL
  SELECT 'publicationMember',p.pubname||'.'||c.nspname||'.'||c.relname,
    jsonb_build_object(
      'columns',(SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM pg_publication_rel pr
        JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=ANY(pr.prattrs) WHERE pr.prpubid=p.oid AND pr.prrelid=c.oid),
      'filter',(SELECT pg_get_expr(pr.prqual,c.oid,false) FROM pg_publication_rel pr WHERE pr.prpubid=p.oid AND pr.prrelid=c.oid))
  FROM pg_publication p CROSS JOIN app_relations c
  WHERE p.puballtables OR EXISTS(SELECT 1 FROM pg_publication_rel pr WHERE pr.prpubid=p.oid AND pr.prrelid=c.oid)
    OR EXISTS(SELECT 1 FROM pg_publication_namespace pn WHERE pn.pnpubid=p.oid AND pn.pnnspid=c.relnamespace)
  UNION ALL
  SELECT 'apiRole',r.rolname,jsonb_build_object('inherit',r.rolinherit,'superuser',r.rolsuper,'bypassRls',r.rolbypassrls,
    'createRole',r.rolcreaterole,'createDb',r.rolcreatedb,'replication',r.rolreplication,'login',r.rolcanlogin,'config',r.rolconfig)
  FROM api_role_graph g JOIN pg_roles r ON r.oid=g.role_id
  UNION ALL
  SELECT 'apiRoleGrant',r.rolname||'.'||m.rolname||'.'||grantor.rolname,jsonb_build_object('admin',a.admin_option,'inherit',a.inherit_option,'set',a.set_option)
  FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member
  JOIN pg_roles grantor ON grantor.oid=a.grantor
  WHERE a.roleid IN(SELECT role_id FROM api_role_graph) OR a.member IN(SELECT role_id FROM api_role_graph)
)
SELECT encode(sha256(convert_to(jsonb_build_object('version',1,
  'postgresMajor',current_setting('server_version_num')::integer/10000,
  'migrations',(SELECT coalesce(jsonb_agg(version ORDER BY version COLLATE "C"),'[]'::jsonb) FROM supabase_migrations.schema_migrations),
  'parts',(SELECT jsonb_agg(jsonb_build_array(kind,identity,definition) ORDER BY kind COLLATE "C",identity COLLATE "C",definition::text COLLATE "C") FROM parts))::text,'UTF8')),'hex')
$function$;
REVOKE ALL ON FUNCTION private.roomqc_schema_fingerprint() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.roomqc_schema_fingerprint() TO roomqc_control_probe;

CREATE FUNCTION public.control_cluster_manifest(p_challenge text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $function$
DECLARE m private.roomqc_release_manifest%ROWTYPE; current_hash text;
BEGIN
  IF p_challenge IS NULL OR p_challenge !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid manifest challenge';
  END IF;
  SELECT * INTO m FROM private.roomqc_release_manifest WHERE singleton;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Release manifest not installed';
  END IF;
  current_hash:=private.roomqc_schema_fingerprint();
  RETURN jsonb_build_object('contractVersion',m.contract_version,'schemaFingerprintVersion',m.schema_fingerprint_version,
    'clusterId',m.cluster_id,'releaseId',m.release_id,'artifactDigest',m.artifact_digest,
    'frontendArtifactDigest',m.frontend_artifact_digest,'migrationSetHash',m.migration_set_hash,
    'schemaManifestHash',current_hash,'expectedSchemaManifestHash',m.expected_schema_hash,
    'challenge',p_challenge,'checkedAt',statement_timestamp());
END
$function$;
REVOKE ALL ON FUNCTION public.control_cluster_manifest(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.control_cluster_manifest(text) TO roomqc_control_probe;
NOTIFY pgrst, 'reload schema';
