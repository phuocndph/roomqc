-- PostgreSQL pg_dump restores attached primary constraints with connoinherit=true,
-- while CREATE TABLE PARTITION OF produces connoinherit=false. Both retain the
-- same validated inherited key, parent constraint and attached primary index.
-- Accept that exact PK representation only when its parent is also NO INHERIT.
-- CHECK inheritance, parent binding, definitions, flags, indexes, ACLs and all
-- remaining partition checks stay mandatory. Existing approvals are not changed:
-- this function definition changes the static fingerprint and requires reapproval.
CREATE OR REPLACE FUNCTION private.roomqc_managed_realtime_partition_ids()
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
              OR (k.contype<>'c' AND k.conparentid=p.oid AND (NOT k.connoinherit OR (k.contype='p' AND p.connoinherit))))))) THEN
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


