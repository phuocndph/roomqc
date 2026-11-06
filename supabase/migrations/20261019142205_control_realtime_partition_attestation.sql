-- Fingerprint v2: retain every static schema/security object; normalize only
-- validated daily children of realtime.messages for pinned Realtime v2.143.3.
-- Vendor source d46540b3a4a79113f40301d5e5cb690f41150b9b creates today-1..today+3
-- and drops dates older than today-3. A one-day cleanup grace is deliberate.
-- No metadata is approved here: installed v1 expectations remain v1 and fail
-- closed until the trusted installer writes a newly reviewed v2 expectation.
ALTER TABLE private.roomqc_release_manifest
  DROP CONSTRAINT roomqc_release_manifest_schema_fingerprint_version_check;
ALTER TABLE private.roomqc_release_manifest
  ADD CONSTRAINT roomqc_release_manifest_schema_fingerprint_version_check
  CHECK (schema_fingerprint_version IN (1,2));

CREATE FUNCTION private.roomqc_partition_column_shape(p_relation oid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $function$
  -- The vendor upgraded the parent by dropping id/uuid. Fresh children do not
  -- retain those physical attnum gaps; only live logical order must match.
  SELECT coalesce(jsonb_agg(jsonb_build_object('position',a.logical_position,'name',a.attname,
    'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,
    'identity',a.attidentity,'generated',a.attgenerated,'storage',a.attstorage,
    'compression',a.attcompression,'statistics',a.attstattarget,
    'default',pg_get_expr(d.adbin,d.adrelid,false),'collation',a.attcollation,
    'acl',private.roomqc_sorted_acl(a.attacl)) ORDER BY a.attnum),'[]'::jsonb)
  FROM (SELECT a.*,row_number() OVER(ORDER BY a.attnum) AS logical_position
    FROM pg_attribute a WHERE a.attrelid=p_relation AND a.attnum>0 AND NOT a.attisdropped) a
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
$function$;
REVOKE ALL ON FUNCTION private.roomqc_partition_column_shape(oid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.roomqc_partition_column_shape(oid) TO roomqc_control_probe;

CREATE FUNCTION private.roomqc_partition_index_shape(p_index oid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $function$
  SELECT jsonb_build_object('unique',x.indisunique,'primary',x.indisprimary,
    'exclusion',x.indisexclusion,'immediate',x.indimmediate,'valid',x.indisvalid,
    'ready',x.indisready,'live',x.indislive,'replicaIdentity',x.indisreplident,
    'attributes',x.indnatts,'keys',x.indnkeyatts,
    -- Map each key/include attnum to the live column name on its own relation.
    -- Null represents an expression slot, attested separately by expressions.
    'keyColumns',(SELECT jsonb_agg(a.attname ORDER BY k.position)
      FROM unnest(x.indkey) WITH ORDINALITY k(attnum,position)
      LEFT JOIN pg_attribute a ON a.attrelid=x.indrelid AND a.attnum=k.attnum AND NOT a.attisdropped),
    'classes',x.indclass::text,'collations',x.indcollation::text,'options',x.indoption::text,
    'expressions',pg_get_expr(x.indexprs,x.indrelid,false),'predicate',pg_get_expr(x.indpred,x.indrelid,false),
    'accessMethod',c.relam,'relationOptions',c.reloptions)
  FROM pg_index x JOIN pg_class c ON c.oid=x.indexrelid WHERE x.indexrelid=p_index
$function$;
REVOKE ALL ON FUNCTION private.roomqc_partition_index_shape(oid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.roomqc_partition_index_shape(oid) TO roomqc_control_probe;

CREATE FUNCTION private.roomqc_managed_realtime_partition_ids()
RETURNS oid[] LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $function$
DECLARE
  parent_oid oid:=to_regclass('realtime.messages');
  owner_oid oid; creator_oid oid; namespace_oid oid; utc_day date:=(statement_timestamp() AT TIME ZONE 'UTC')::date;
  partition_day date; child record; idx record; ids oid[]:='{}'::oid[];
  expected_acl jsonb; actual_acl jsonb; parent_columns jsonb;
  dates date[]:='{}'::date[];
BEGIN
  -- Minimal app-only fixtures may not contain the vendor schema. Its absence or
  -- presence remains represented by the static schema fingerprint.
  IF parent_oid IS NULL THEN RETURN ids; END IF;
  SELECT oid INTO owner_oid FROM pg_roles WHERE rolname='supabase_realtime_admin';
  SELECT oid INTO creator_oid FROM pg_roles WHERE rolname='supabase_admin';
  SELECT relnamespace INTO namespace_oid FROM pg_class WHERE oid=parent_oid;
  IF owner_oid IS NULL OR creator_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=parent_oid
      AND relkind='p' AND relowner=owner_oid AND pg_get_partkeydef(oid)='RANGE (inserted_at)') THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='REALTIME_PARTITION_PARENT_INVALID';
  END IF;
  parent_columns:=private.roomqc_partition_column_shape(parent_oid);

  -- Pinned vendor connects as supabase_admin, creates the child, then ALTERs
  -- OWNER to supabase_realtime_admin. Defaults belong to the CREATOR, not the
  -- final owner; ALTER OWNER rewrites creator grantor/grantee identities.
  -- Global defaults plus schema additions are independently statically attested.
  WITH grants AS (
    SELECT e.* FROM aclexplode(coalesce((SELECT defaclacl FROM pg_default_acl
      WHERE defaclrole=creator_oid AND defaclnamespace=0 AND defaclobjtype='r'),acldefault('r',creator_oid))) e
    UNION ALL
    SELECT e.* FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) e
      WHERE d.defaclrole=creator_oid AND d.defaclnamespace=namespace_oid AND d.defaclobjtype='r'
  ), transferred AS (
    SELECT CASE WHEN grantor=creator_oid THEN owner_oid ELSE grantor END AS grantor,
      CASE WHEN grantee=creator_oid THEN owner_oid ELSE grantee END AS grantee,
      privilege_type,is_grantable FROM grants
  ), merged AS (
    SELECT grantor,grantee,privilege_type,bool_or(is_grantable) AS grantable
    FROM transferred GROUP BY grantor,grantee,privilege_type
  )
  SELECT coalesce(jsonb_agg(jsonb_build_array(grantor,grantee,privilege_type,grantable)
    ORDER BY grantor,grantee,privilege_type COLLATE "C"),'[]'::jsonb) INTO expected_acl FROM merged;

  FOR child IN SELECT c.* FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid
    WHERE i.inhparent=parent_oid ORDER BY c.relname
  LOOP
    IF child.relname !~ '^messages_[0-9]{4}_[0-9]{2}_[0-9]{2}$'
      OR child.relnamespace<>namespace_oid OR child.relowner<>owner_oid
      OR child.relkind<>'r' OR NOT child.relispartition OR child.relpersistence<>'p'
      OR child.relrowsecurity OR child.relforcerowsecurity OR child.relreplident<>'d'
      OR child.reloptions IS NOT NULL OR child.relhasrules
      OR (SELECT amname FROM pg_am WHERE oid=child.relam) IS DISTINCT FROM 'heap'
      OR (SELECT count(*) FROM pg_inherits WHERE inhrelid=child.oid)<>1 THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='REALTIME_PARTITION_METADATA_INVALID';
    END IF;
    BEGIN
      partition_day:=to_date(substring(child.relname FROM 10),'YYYY_MM_DD');
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='REALTIME_PARTITION_DATE_INVALID';
    END;
    IF to_char(partition_day,'YYYY_MM_DD')<>substring(child.relname FROM 10)
      OR partition_day<utc_day-4 OR partition_day>utc_day+3
      OR pg_get_expr(child.relpartbound,child.oid,false) IS DISTINCT FROM
        format('FOR VALUES FROM (%L) TO (%L)',to_char(partition_day,'YYYY-MM-DD')||' 00:00:00',
          to_char(partition_day+1,'YYYY-MM-DD')||' 00:00:00') THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='REALTIME_PARTITION_BOUNDS_INVALID';
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_array(grantor,grantee,privilege_type,is_grantable)
      ORDER BY grantor,grantee,privilege_type COLLATE "C"),'[]'::jsonb)
      INTO actual_acl FROM aclexplode(coalesce(child.relacl,acldefault('r',owner_oid)));
    IF actual_acl IS DISTINCT FROM expected_acl
      OR private.roomqc_partition_column_shape(child.oid) IS DISTINCT FROM parent_columns
      OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=child.oid AND attnum>0
        AND NOT attisdropped AND (attislocal OR attinhcount<>1)) THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='REALTIME_PARTITION_COLUMNS_OR_ACL_INVALID';
    END IF;
    -- Constraint names contain dates; their definitions and inheritance cannot
    -- be ignored. Vendor CHECKs are validated on fresh children even when the
    -- parent was introduced NOT VALID.
    IF (SELECT count(*) FROM pg_constraint WHERE conrelid=child.oid)<>
        (SELECT count(*) FROM pg_constraint WHERE conrelid=parent_oid)
      OR EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=child.oid AND
        (NOT k.convalidated OR k.conislocal OR k.coninhcount<>1 OR NOT EXISTS(
          SELECT 1 FROM pg_constraint p WHERE p.conrelid=parent_oid AND p.contype=k.contype
            AND regexp_replace(pg_get_constraintdef(p.oid,false),' NOT VALID$','')=pg_get_constraintdef(k.oid,false)
            AND p.condeferrable=k.condeferrable AND p.condeferred=k.condeferred
            AND ((k.contype='c' AND p.connoinherit=k.connoinherit)
              OR (k.contype<>'c' AND NOT k.connoinherit AND k.conparentid=p.oid))))) THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='REALTIME_PARTITION_CONSTRAINTS_INVALID';
    END IF;
    IF (SELECT count(*) FROM pg_index WHERE indrelid=child.oid)<>
        (SELECT count(*) FROM pg_index WHERE indrelid=parent_oid) THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='REALTIME_PARTITION_INDEX_COUNT_INVALID';
    END IF;
    FOR idx IN SELECT x.indexrelid,c.relowner,c.relnamespace,c.relkind,c.relpersistence,c.relacl
      FROM pg_index x JOIN pg_class c ON c.oid=x.indexrelid WHERE x.indrelid=child.oid
    LOOP
      IF idx.relowner<>owner_oid OR idx.relnamespace<>namespace_oid OR idx.relkind<>'i'
        OR idx.relpersistence<>'p' OR idx.relacl IS NOT NULL
        OR (SELECT count(*) FROM pg_inherits WHERE inhrelid=idx.indexrelid)<>1
        OR NOT EXISTS(SELECT 1 FROM pg_inherits i JOIN pg_index p ON p.indexrelid=i.inhparent
          WHERE i.inhrelid=idx.indexrelid AND p.indrelid=parent_oid
            AND private.roomqc_partition_index_shape(p.indexrelid)=private.roomqc_partition_index_shape(idx.indexrelid)) THEN
        RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='REALTIME_PARTITION_INDEX_INVALID';
      END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=child.oid)
      OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=child.oid)
      OR EXISTS(SELECT 1 FROM pg_publication_rel WHERE prrelid=child.oid) THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='REALTIME_PARTITION_OBJECTS_INVALID';
    END IF;
    ids:=array_append(ids,child.oid);dates:=array_append(dates,partition_day);
  END LOOP;
  -- Verify useful coverage, not only a correctly named but empty partition set.
  IF NOT (utc_day=ANY(dates) AND (utc_day+1)=ANY(dates)) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='REALTIME_PARTITION_COVERAGE_INVALID';
  END IF;
  RETURN ids;
END
$function$;
REVOKE ALL ON FUNCTION private.roomqc_managed_realtime_partition_ids() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.roomqc_managed_realtime_partition_ids() TO roomqc_control_probe;

CREATE OR REPLACE FUNCTION private.roomqc_schema_fingerprint()
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $function$
WITH RECURSIVE
managed_partitions AS MATERIALIZED (
  SELECT private.roomqc_managed_realtime_partition_ids() AS ids
),
app_namespaces AS (
  SELECT * FROM pg_namespace WHERE nspname IN ('public','private','auth','storage','realtime')
),
app_relations AS (
  SELECT c.*,n.nspname FROM pg_class c JOIN app_namespaces n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','S','f','c')
    AND NOT c.oid=ANY((SELECT ids FROM managed_partitions)::oid[])
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
SELECT encode(sha256(convert_to(jsonb_build_object('version',2,'managedRealtimePartitionSpec',1,
  'postgresMajor',current_setting('server_version_num')::integer/10000,
  'migrations',(SELECT coalesce(jsonb_agg(version ORDER BY version COLLATE "C"),'[]'::jsonb) FROM supabase_migrations.schema_migrations),
  'parts',(SELECT jsonb_agg(jsonb_build_array(kind,identity,definition) ORDER BY kind COLLATE "C",identity COLLATE "C",definition::text COLLATE "C") FROM parts))::text,'UTF8')),'hex')
$function$;
REVOKE ALL ON FUNCTION private.roomqc_schema_fingerprint() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.roomqc_schema_fingerprint() TO roomqc_control_probe;

CREATE OR REPLACE FUNCTION public.control_cluster_manifest(p_challenge text)
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
  IF m.schema_fingerprint_version<>2 THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Fingerprint v2 requires a newly approved release manifest';
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

