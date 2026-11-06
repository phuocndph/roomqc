-- pg_net grants PUBLIC access independently of NOINHERIT. PostgreSQL has no
-- per-role DENY, so replace PUBLIC's net ACLs with explicit existing-role ACLs.
-- Preserve every effective privilege of every other existing role, including
-- NOINHERIT roles and column-only grants. A mismatch aborts this whole migration.
-- New roles need explicit net grants. Extension upgrades must recheck this
-- boundary; no global default privileges or unrelated schemas are changed.
-- Apply using the extension owner's maintenance session (supabase_admin in the
-- pinned self-hosted bundle), never by widening the runtime/migration role.
DO $boundary$
DECLARE
  v_recovery oid;
  v_net oid;
  v_object record;
  v_grant record;
  v_actual boolean;
  v_target text;
BEGIN
  SELECT oid INTO STRICT v_recovery FROM pg_catalog.pg_roles
    WHERE rolname='roomqc_setup_recovery';
  SELECT oid INTO v_net FROM pg_catalog.pg_namespace WHERE nspname='net';
  IF v_net IS NULL THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper)
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE oid=v_net
      AND nspowner<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)) THEN
    RAISE EXCEPTION 'SETUP_RECOVERY_NET_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE oid=v_recovery AND
      (rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls OR rolinherit))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=v_recovery)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE oid=v_net AND nspowner=v_recovery)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace=v_net AND relowner=v_recovery)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace=v_net AND proowner=v_recovery) THEN
    RAISE EXCEPTION 'UNSAFE_SETUP_RECOVERY_NET_ROLE';
  END IF;

  CREATE TEMP TABLE roomqc_net_boundary_objects ON COMMIT DROP AS
    SELECT 'schema'::text AS kind,n.oid,0::smallint AS subid,
      pg_catalog.format('%I',n.nspname) AS identity,NULL::text AS column_name,
      ARRAY['USAGE','CREATE']::text[] AS privileges,0 AS restore_order
      FROM pg_catalog.pg_namespace n WHERE n.oid=v_net
    UNION ALL
    SELECT 'routine',p.oid,0::smallint,
      pg_catalog.format('%I.%I(%s)',n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid)),
      NULL,ARRAY['EXECUTE'],1
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.oid=v_net
    UNION ALL
    SELECT CASE WHEN c.relkind='S' THEN 'sequence' ELSE 'table' END,c.oid,0::smallint,
      pg_catalog.format('%I.%I',n.nspname,c.relname),NULL,
      CASE WHEN c.relkind='S' THEN ARRAY['USAGE','SELECT','UPDATE']
        ELSE ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] END,1
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.oid=v_net AND c.relkind IN ('r','p','v','m','f','S')
    UNION ALL
    SELECT 'column',c.oid,a.attnum,pg_catalog.format('%I.%I',n.nspname,c.relname),a.attname,
      ARRAY['SELECT','INSERT','UPDATE','REFERENCES'],2
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
      WHERE n.oid=v_net AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped;

  CREATE TEMP TABLE roomqc_net_boundary_before ON COMMIT DROP AS
    SELECT o.*,r.oid AS role_oid,r.rolname,privilege,
      CASE o.kind
        WHEN 'schema' THEN pg_catalog.has_schema_privilege(r.oid,o.oid,privilege)
        WHEN 'routine' THEN pg_catalog.has_function_privilege(r.oid,o.oid,privilege)
        WHEN 'table' THEN pg_catalog.has_table_privilege(r.oid,o.oid,privilege)
        WHEN 'sequence' THEN pg_catalog.has_sequence_privilege(r.oid,o.oid,privilege)
        WHEN 'column' THEN pg_catalog.has_column_privilege(r.oid,o.oid,o.subid,privilege)
      END AS allowed
      FROM pg_temp.roomqc_net_boundary_objects o CROSS JOIN pg_catalog.pg_roles r
      CROSS JOIN LATERAL pg_catalog.unnest(o.privileges) AS privilege;

  FOR v_object IN SELECT * FROM pg_temp.roomqc_net_boundary_objects
    ORDER BY restore_order,kind,identity,subid
  LOOP
    IF v_object.kind='column' THEN
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES (%I) ON TABLE %s FROM PUBLIC,roomqc_setup_recovery',
        v_object.column_name,v_object.identity);
    ELSE
      v_target:=CASE v_object.kind WHEN 'schema' THEN 'SCHEMA' WHEN 'routine' THEN 'ROUTINE'
        WHEN 'sequence' THEN 'SEQUENCE' ELSE 'TABLE' END;
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON %s %s FROM PUBLIC,roomqc_setup_recovery',v_target,v_object.identity);
    END IF;
  END LOOP;

  -- Table privileges must be restored before columns: has_column_privilege also
  -- includes table-wide grants. Restore only bits that were present and lost.
  FOR v_grant IN SELECT * FROM pg_temp.roomqc_net_boundary_before
    WHERE role_oid<>v_recovery AND allowed
    ORDER BY restore_order,kind,identity,subid,rolname,privilege
  LOOP
    v_actual:=CASE v_grant.kind
      WHEN 'schema' THEN pg_catalog.has_schema_privilege(v_grant.role_oid,v_grant.oid,v_grant.privilege)
      WHEN 'routine' THEN pg_catalog.has_function_privilege(v_grant.role_oid,v_grant.oid,v_grant.privilege)
      WHEN 'table' THEN pg_catalog.has_table_privilege(v_grant.role_oid,v_grant.oid,v_grant.privilege)
      WHEN 'sequence' THEN pg_catalog.has_sequence_privilege(v_grant.role_oid,v_grant.oid,v_grant.privilege)
      WHEN 'column' THEN pg_catalog.has_column_privilege(v_grant.role_oid,v_grant.oid,v_grant.subid,v_grant.privilege)
    END;
    IF NOT v_actual THEN
      IF v_grant.kind='column' THEN
        EXECUTE pg_catalog.format('GRANT %s (%I) ON TABLE %s TO %I',v_grant.privilege,
          v_grant.column_name,v_grant.identity,v_grant.rolname);
      ELSE
        v_target:=CASE v_grant.kind WHEN 'schema' THEN 'SCHEMA' WHEN 'routine' THEN 'ROUTINE'
          WHEN 'sequence' THEN 'SEQUENCE' ELSE 'TABLE' END;
        EXECUTE pg_catalog.format('GRANT %s ON %s %s TO %I',v_grant.privilege,v_target,v_grant.identity,v_grant.rolname);
      END IF;
    END IF;
  END LOOP;

  FOR v_grant IN SELECT * FROM pg_temp.roomqc_net_boundary_before LOOP
    v_actual:=CASE v_grant.kind
      WHEN 'schema' THEN pg_catalog.has_schema_privilege(v_grant.role_oid,v_grant.oid,v_grant.privilege)
      WHEN 'routine' THEN pg_catalog.has_function_privilege(v_grant.role_oid,v_grant.oid,v_grant.privilege)
      WHEN 'table' THEN pg_catalog.has_table_privilege(v_grant.role_oid,v_grant.oid,v_grant.privilege)
      WHEN 'sequence' THEN pg_catalog.has_sequence_privilege(v_grant.role_oid,v_grant.oid,v_grant.privilege)
      WHEN 'column' THEN pg_catalog.has_column_privilege(v_grant.role_oid,v_grant.oid,v_grant.subid,v_grant.privilege)
    END;
    IF (v_grant.role_oid=v_recovery AND v_actual)
      OR (v_grant.role_oid<>v_recovery AND v_actual IS DISTINCT FROM v_grant.allowed) THEN
      RAISE EXCEPTION 'SETUP_RECOVERY_NET_BOUNDARY_MISMATCH';
    END IF;
  END LOOP;
  DROP TABLE pg_temp.roomqc_net_boundary_before;
  DROP TABLE pg_temp.roomqc_net_boundary_objects;
END;
$boundary$;
