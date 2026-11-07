// pg_dump omits extension members created by Supabase bootstrap hooks, while
// retaining their ACLs. Restore their snapshot definitions before those ACLs.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const extensionMemberInventorySQL = `
SELECT jsonb_build_object('kind','extension_function','name',n.nspname||'.'||p.proname,
  'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
  'extension',e.extname,'extension_version',e.extversion,
  'acl',(SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(p.proacl) a),
  'definition',pg_get_functiondef(p.oid))::text
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_depend d ON d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e'
JOIN pg_extension e ON e.oid=d.refobjid
WHERE n.nspname='graphql_public' AND p.prokind='f'
ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid);
`;
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const identifier = value => '"' + value.replaceAll('"', '""') + '"';

function schemaGrantSql(expected) {
  const schemas = expected.filter(row => row.kind === 'schema' && ['graphql', 'graphql_public'].includes(row.name));
  if (!schemas.length) return null;
  assert.deepEqual(schemas.map(row => row.name).sort(), ['graphql', 'graphql_public'], 'GraphQL schema permission snapshots required');
  let sql = '';
  for (const schema of schemas) {
    assert.equal(schema.owner, 'supabase_admin');
    assert.ok(Array.isArray(schema.privileges) && schema.privileges.length > 0);
    sql += `DO $roomqc$ BEGIN IF EXISTS(SELECT 1 FROM pg_namespace n,
      LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      WHERE n.nspname=${literal(schema.name)} AND a.grantee NOT IN (0,n.nspowner))
      THEN RAISE EXCEPTION 'Unexpected bootstrap schema grant'; END IF; END $roomqc$;\n`;
    sql += `REVOKE ALL ON SCHEMA ${identifier(schema.name)} FROM PUBLIC, ${identifier(schema.owner)};\n`;
    for (const grant of schema.privileges) {
      assert.equal(grant.grantor, schema.owner, 'Unsupported schema grantor');
      assert.ok(['USAGE', 'CREATE'].includes(grant.privilege));
      assert.equal(typeof grant.grantable, 'boolean');
      assert.equal(typeof grant.grantee, 'string');
      sql += `GRANT ${grant.privilege} ON SCHEMA ${identifier(schema.name)} TO ${grant.grantee === 'PUBLIC' ? 'PUBLIC' : identifier(grant.grantee)}${grant.grantable ? ' WITH GRANT OPTION' : ''};\n`;
    }
  }
  return sql;
}

function extensionDefaultAclSql(expected) {
  // The Supabase PostgreSQL image can create pgmq defaults while the source
  // image has none. Remove only the known bootstrap grants when the source
  // inventory explicitly proves they are absent.
  const hasPgmq = expected.some(row => row.kind === 'default_acl' && row.name?.includes('.pgmq.'));
  if (hasPgmq) return '';
  return ['postgres','supabase_admin'].flatMap(role => [
    `ALTER DEFAULT PRIVILEGES FOR ROLE "${role}" IN SCHEMA "pgmq" REVOKE ALL PRIVILEGES ON TABLES FROM "pg_monitor";`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE "${role}" IN SCHEMA "pgmq" REVOKE SELECT ON TABLES FROM "pg_monitor";`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE "${role}" IN SCHEMA "pgmq" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "pg_monitor";`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE "${role}" IN SCHEMA "pgmq" REVOKE SELECT ON SEQUENCES FROM "pg_monitor";`,
  ]).join('\n')+'\n';
}

export function planExtensionMemberRestore(toc, expected) {
  const members = expected.filter(row => row.kind === 'extension_function');
  if (!members.length) return null;
  // This compatibility path is deliberately narrow. Unknown vendor objects
  // require a reviewed restore strategy rather than a guessed replacement.
  assert.equal(members.length, 1, 'Unsupported extension members');
  const member = members[0];
  assert.equal(member.name, 'graphql_public.graphql');
  assert.equal(member.signature, 'graphql_public.graphql(text,text,jsonb,jsonb)');
  assert.equal(member.extension, 'pg_graphql');
  assert.match(member.extension_version, /^\d+\.\d+\.\d+$/);
  assert.equal(member.owner, 'supabase_admin');
  assert.match(member.definition, /^CREATE OR REPLACE FUNCTION graphql_public\.graphql\(/);
  const lines = toc.split('\n');
  const indexes = lines.map((line, index) => /^\d+; .* EXTENSION - pg_graphql\s*$/.test(line) ? index : -1).filter(index => index >= 0);
  assert.equal(indexes.length, 1, 'Exactly one GraphQL extension archive item required');
  const split = indexes[0] + 1;
  assert.ok(lines.slice(0, split).some(line => / SCHEMA - graphql_public supabase_admin\s*$/.test(line)));
  assert.ok(!lines.slice(0, split).some(line => / ACL graphql_public FUNCTION graphql\(/.test(line)));
  assert.ok(!lines.some(line => / FUNCTION graphql_public graphql\(/.test(line)), 'Wrapper must be an omitted extension member');
  const prefix = lines.slice(0, split).join('\n') + '\n';
  const remaining = lines.slice(split).join('\n') + '\n';
  const ids = value => value.split('\n').filter(line => /^\d+;/.test(line)).map(line => line.split(';')[0]);
  assert.deepEqual([...ids(prefix), ...ids(remaining)], ids(toc), 'Every archive item must be restored exactly once');
  const schemas = expected.filter(row => row.kind === 'schema' && ['graphql', 'graphql_public'].includes(row.name));
  assert.deepEqual(schemas.map(row => row.name).sort(), ['graphql', 'graphql_public'], 'GraphQL schema permission snapshots required');
  const schemaGrants = schemaGrantSql(expected);
  const bootstrap = `DO $roomqc$ BEGIN
    IF (SELECT extversion FROM pg_extension WHERE extname='pg_graphql') IS DISTINCT FROM ${literal(member.extension_version)}
      THEN RAISE EXCEPTION 'GraphQL extension version mismatch'; END IF;
    IF to_regprocedure(${literal(member.signature)}) IS NOT NULL
      THEN RAISE EXCEPTION 'Unexpected pre-existing GraphQL wrapper'; END IF;
  END $roomqc$;
${member.definition};
ALTER FUNCTION ${member.signature} OWNER TO ${identifier(member.owner)};
ALTER EXTENSION pg_graphql ADD FUNCTION ${member.signature};
${schemaGrants}
`;
  return { prefix, remaining, bootstrap, schemaGrantsSql: schemaGrants, members: members.length, schemaGrants: schemas.length, archiveItems: ids(toc).length };
}

export async function restoreArchiveWithExtensionMembers({ docker, target, archive, expected, directory }) {
  const toc = docker(['exec', target, 'pg_restore', '--list', archive]);
  const plan = planExtensionMemberRestore(toc, expected);
  if (!plan) {
    docker(['exec', target, 'pg_restore', '-U', 'supabase_admin', '-d', 'postgres',
      '--exit-on-error', '--single-transaction', archive], undefined, 120000);
    if (schemaGrantSql(expected)) {
      const grantsPath = join(directory, 'restore-schema-grants.sql');
      await writeFile(grantsPath, schemaGrantSql(expected), { mode: 0o600 });
      docker(['cp', grantsPath, target + ':/tmp/roomqc-restore-schema-grants.sql']);
      docker(['exec', target, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q',
        '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', '/tmp/roomqc-restore-schema-grants.sql'], undefined, 30000);
      const defaultsPath = join(directory, 'restore-extension-default-acls.sql');
      await writeFile(defaultsPath, extensionDefaultAclSql(expected), { mode: 0o600 });
      docker(['cp', defaultsPath, target + ':/tmp/roomqc-restore-extension-default-acls.sql']);
      docker(['exec', target, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
        '--single-transaction', '-f', '/tmp/roomqc-restore-extension-default-acls.sql'], undefined, 30000);
      return { extensionMembers: 0, schemaGrants: 2, defaultAclSql: extensionDefaultAclSql(expected), singleTransaction: true };
    }
    return { extensionMembers: 0, defaultAclSql: extensionDefaultAclSql(expected), singleTransaction: true };
  }
  for (const [name, content] of [['prefix.list', plan.prefix], ['remaining.list', plan.remaining], ['members.sql', plan.bootstrap]]) {
    const path = join(directory, 'restore-' + name);
    await writeFile(path, content, { mode: 0o600 });
    docker(['cp', path, target + ':/tmp/roomqc-restore-' + name]);
  }
  for (const part of ['prefix', 'remaining']) {
    docker(['exec', target, 'pg_restore', '--exit-on-error', '--use-list=/tmp/roomqc-restore-' + part + '.list',
      '--file=/tmp/roomqc-restore-' + part + '.sql', archive], undefined, 120000);
  }
  docker(['exec', target, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q',
    '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', '/tmp/roomqc-restore-prefix.sql',
    '-f', '/tmp/roomqc-restore-members.sql', '-f', '/tmp/roomqc-restore-remaining.sql'], undefined, 120000);
  // pg_restore may replay an extension-owned schema ACL after the extension
  // member is recreated. Apply the reviewed snapshot once more at the end so
  // the restored privilege state matches the source exactly.
  const grantsPath = join(directory, 'restore-schema-grants.sql');
  await writeFile(grantsPath, plan.schemaGrantsSql, { mode: 0o600 });
  docker(['cp', grantsPath, target + ':/tmp/roomqc-restore-schema-grants.sql']);
  docker(['exec', target, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q',
    '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', '/tmp/roomqc-restore-schema-grants.sql'], undefined, 30000);
  const defaultsPath = join(directory, 'restore-extension-default-acls.sql');
  await writeFile(defaultsPath, extensionDefaultAclSql(expected), { mode: 0o600 });
  docker(['cp', defaultsPath, target + ':/tmp/roomqc-restore-extension-default-acls.sql']);
  docker(['exec', target, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
    '--single-transaction', '-f', '/tmp/roomqc-restore-extension-default-acls.sql'], undefined, 30000);
  return { extensionMembers: plan.members, schemaGrants: plan.schemaGrants, archiveItems: plan.archiveItems,
    defaultAclSql: extensionDefaultAclSql(expected), singleTransaction: true };
}
