import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {applyBusinessMigrations,businessMigrationManifest,businessMigrationPlan,businessMigrationReceipt,initializeBusinessMigrationHistory,migrationSqlInOwnedTransaction,validateBusinessDatabaseUrl} from './business-migrate.mjs';
import {businessMigrateMain} from './business-migrate-cli.mjs';

const manifest={sha256:'a'.repeat(64),count:2,migrations:[
  {version:'20261001000000',name:'first',file:'20261001000000_first.sql'},
  {version:'20261002000000',name:'second',file:'20261002000000_second.sql'}]};

test('business migration plan requires an exact ordered history prefix',()=>{
  assert.deepEqual(businessMigrationPlan(manifest,[]),{migrationSetSha256:'a'.repeat(64),appliedCount:0,totalCount:2,pending:['20261001000000_first.sql','20261002000000_second.sql'],complete:false});
  assert.equal(businessMigrationPlan(manifest,[{version:'20261001000000',name:'first'}]).pending[0],'20261002000000_second.sql');
  assert.throws(()=>businessMigrationPlan(manifest,[{version:'20261002000000',name:'second'}]),{code:'BUSINESS_MIGRATION_HISTORY_DIVERGED'});
  assert.throws(()=>businessMigrationPlan(manifest,[{version:'20261001000000',name:'wrong'}]),{code:'BUSINESS_MIGRATION_HISTORY_DIVERGED'});
});

test('owned transaction normalizes the one legacy outer wrapper and rejects nested controls',()=>{
  const sql='-- header\nBEGIN;\nCREATE TABLE demo(id int);\nCOMMIT;\n';
  assert.equal(migrationSqlInOwnedTransaction(sql),'CREATE TABLE demo(id int);\n');
  assert.throws(()=>migrationSqlInOwnedTransaction('CREATE TABLE demo(id int); SAVEPOINT x;'),{code:'BUSINESS_MIGRATION_TRANSACTION_CONTROL'});
  for(const sql of ['BEGIN; SELECT 1;','SELECT 1; COMMIT;', 'SELECT 1; START TRANSACTION;',
    'BEGIN; SELECT 1; END;', 'SELECT 1; PREPARE TRANSACTION \'x\';'])
    assert.throws(()=>migrationSqlInOwnedTransaction(sql),{code:'BUSINESS_MIGRATION_TRANSACTION_CONTROL'});
  const quoted="/* outer /* nested */ 🚀 */ DO $body$ BEGIN RAISE NOTICE 'COMMIT;'; END; $body$; SELECT 'BEGIN;', E'escaped\\\'COMMIT;', \"ROLLBACK;\"; -- COMMIT;\n";
  assert.equal(migrationSqlInOwnedTransaction(quoted),quoted);
  assert.throws(()=>migrationSqlInOwnedTransaction('SELECT $body$unterminated'),{code:'BUSINESS_MIGRATION_SQL_INVALID'});
});

test('all shipped migration SQL is compatible with the owned transaction runner',async()=>{
  const manifest=await businessMigrationManifest();
  for(const migration of manifest.migrations)assert.doesNotThrow(()=>migrationSqlInOwnedTransaction(migration.sql),migration.file);
});

test('business database URLs require TLS except explicit local rehearsal',()=>{
  assert.equal(validateBusinessDatabaseUrl('postgresql://u:p@db.example/roomqc?sslmode=verify-full'),'postgresql://u:p@db.example/roomqc?sslmode=verify-full');
  assert.throws(()=>validateBusinessDatabaseUrl('postgresql://u:p@db.example/roomqc'),{code:'BUSINESS_DATABASE_TLS_REQUIRED'});
  assert.equal(validateBusinessDatabaseUrl('postgresql://u:p@127.0.0.1/roomqc',{allowLocal:true}),'postgresql://u:p@127.0.0.1/roomqc');
  assert.throws(()=>validateBusinessDatabaseUrl('postgresql://u:p@127.0.0.1/roomqc?sslmode=disable'),{code:'BUSINESS_DATABASE_TLS_REQUIRED'});
  assert.throws(()=>validateBusinessDatabaseUrl('postgresql://u:p@db.example/roomqc?sslmode=verify-full&sslmode=disable'),{code:'BUSINESS_DATABASE_URL_INVALID'});
});

test('business migration receipt is deterministic and only complete history can gate a release',()=>{
  const pending=businessMigrationPlan(manifest,[]);
  assert.deepEqual(businessMigrationReceipt(pending,{expectedHash:manifest.sha256,expectedCount:2}),{
    version:1,status:'pending',migrationSetSha256:'a'.repeat(64),totalCount:2,appliedCount:0,pending:pending.pending,complete:false});
  const complete=businessMigrationPlan(manifest,[{version:'20261001000000',name:'first'},{version:'20261002000000',name:'second'}]);
  assert.deepEqual(businessMigrationReceipt(complete,{expectedHash:manifest.sha256,expectedCount:2}),{
    version:1,status:'complete',migrationSetSha256:'a'.repeat(64),totalCount:2,appliedCount:2,pending:[],complete:true});
  assert.equal(businessMigrationReceipt({...complete,complete:false},{expectedHash:manifest.sha256}).status,'pending');
  assert.throws(()=>businessMigrationReceipt(complete,{expectedHash:'b'.repeat(64)}),{code:'BUSINESS_MIGRATION_SOURCE_MISMATCH'});
});

class FakePool{
  constructor({failOn,authority={superuser:true,postgres_role:true,maintenance_role:true}}={}){
    this.history=[];this.failOn=failOn;this.committedSql=[];this.inTransaction=false;this.authority=authority;
  }
  async connect(){
    const owner=this;
    return {query:async(sql,params=[])=>{
      const text=String(sql);
      if(text.startsWith('SELECT to_regnamespace'))return {rows:[{auth_schema:true,migrations_schema:true,tenants_table:true,history_table:true}]};
      if(text.startsWith('SELECT version,name FROM'))return {rows:owner.history.map(row=>({...row}))};
      if(text.includes('AS postgres_role'))return {rows:[owner.authority]};
      if(text.startsWith('SELECT pg_advisory_lock')||text.startsWith('SELECT pg_advisory_unlock'))return {rows:[]};
      if(text==='BEGIN'){owner.inTransaction=true;return {rows:[]}}
      if(text.startsWith('SET LOCAL'))return {rows:[]};
      if(text==='COMMIT'){owner.inTransaction=false;return {rows:[]}}
      if(text==='ROLLBACK'){owner.inTransaction=false;return {rows:[]}}
      if(text.startsWith('INSERT INTO supabase_migrations')){owner.history.push({version:params[0],name:params[1]});return {rows:[]}}
      if(text.includes('CREATE TABLE')||text.includes('ALTER TABLE')){
        if(owner.failOn&&text.includes(owner.failOn))throw new Error('fixture failure');
        owner.committedSql.push(text);return {rows:[]}
      }
      throw new Error('unexpected fake SQL: '+text.slice(0,80));
    },release:()=>{if(owner.inTransaction)throw new Error('transaction leaked')}};
  }
}

test('apply runs each pending file atomically and records the exact history row',async()=>{
  const root=await mkdtemp(join(tmpdir(),'roomqc-business-migrate-'));
  try{
    await writeFile(join(root,'20261001000000_first.sql'),'BEGIN;\nCREATE TABLE first(id int);\nCOMMIT;\n');
    await writeFile(join(root,'20261002000000_second.sql'),'CREATE TABLE second(id int);\n');
    const pool=new FakePool(),manifest=await businessMigrationManifest(new URL('file:///'+root.replaceAll('\\','/')+'/'));
    const result=await applyBusinessMigrations(pool,{location:new URL('file:///'+root.replaceAll('\\','/')+'/'),expectedHash:manifest.sha256,expectedCount:2});
    assert.equal(result.complete,true);assert.deepEqual(pool.history,[
      {version:'20261001000000',name:'first'},{version:'20261002000000',name:'second'}]);
    assert.equal(pool.committedSql.length,2);
  }finally{await rm(root,{recursive:true,force:true})}
});

test('CLI pending verification and receipt fail closed while planning remains read only',async()=>{
  const root=await mkdtemp(join(tmpdir(),'roomqc-business-cli-'));
  try{
    const dsn=join(root,'business.dsn');await writeFile(dsn,'postgresql://u:private-marker@127.0.0.1/roomqc',{mode:0o600});
    await writeFile(join(root,'20261001000000_first.sql'),'CREATE TABLE first(id int);');
    class Pool extends FakePool{async end(){}}
    for(const mode of ['plan','verify','receipt']){
      let text='';const code=await businessMigrateMain(['--mode',mode,'--database-url-file',dsn,
        '--migration-directory',root,'--allow-local'],{Pool,output:{write:s=>text+=s}});
      const result=JSON.parse(text);assert.equal(code,mode==='plan'?0:2);
      assert.equal(result.ok,mode==='plan');assert.equal(result.complete,false);
      if(mode==='receipt')assert.equal(result.receipt.status,'pending');
      assert.equal(text.includes('private-marker'),false);
    }
    for(const extra of [['--mode','receipt'],['--expected-count','9007199254740992'],['--help']]){
      let text='';assert.equal(await businessMigrateMain(['--mode','plan','--database-url-file',dsn,...extra],
        {Pool,output:{write:s=>text+=s}}),1);assert.equal(JSON.parse(text).code,'BUSINESS_MIGRATION_ARGUMENTS_INVALID');
    }
  }finally{await rm(root,{recursive:true,force:true})}
});

test('a failed file rolls back its history row while preserving earlier committed files',async()=>{
  const root=await mkdtemp(join(tmpdir(),'roomqc-business-migrate-'));
  try{
    await writeFile(join(root,'20261001000000_first.sql'),'CREATE TABLE first(id int);\n');
    await writeFile(join(root,'20261002000000_second.sql'),'CREATE TABLE second(id int);\n');
    const pool=new FakePool({failOn:'second'});
    await assert.rejects(()=>applyBusinessMigrations(pool,{location:new URL('file:///'+root.replaceAll('\\','/')+'/')}),error=>error.code==='BUSINESS_MIGRATION_APPLY_FAILED'&&error.migration==='20261002000000_second.sql');
    assert.deepEqual(pool.history,[{version:'20261001000000',name:'first'}]);
  }finally{await rm(root,{recursive:true,force:true})}
});

test('missing maintenance authority or invalid later SQL prevents all pending DDL',async()=>{
  const root=await mkdtemp(join(tmpdir(),'roomqc-business-preflight-'));
  try{
    const location=new URL('file:///'+root.replaceAll('\\','/')+'/');
    await writeFile(join(root,'20261001000000_first.sql'),'CREATE TABLE first(id int);');
    await writeFile(join(root,'20261028082314_maintenance.sql'),'CREATE TABLE maintenance(id int);');
    const pool=new FakePool({authority:{superuser:false,postgres_role:true,maintenance_role:true}});
    await assert.rejects(()=>applyBusinessMigrations(pool,{location}),{code:'BUSINESS_MIGRATION_AUTHORITY_REQUIRED'});
    assert.deepEqual(pool.committedSql,[]);assert.deepEqual(pool.history,[]);
    await writeFile(join(root,'20261028082314_maintenance.sql'),'SAVEPOINT outside_runner;');
    await assert.rejects(()=>applyBusinessMigrations(pool,{location}),{code:'BUSINESS_MIGRATION_TRANSACTION_CONTROL'});
    assert.deepEqual(pool.committedSql,[]);assert.deepEqual(pool.history,[]);
    await writeFile(join(root,'20261001000000_duplicate.sql'),'SELECT 1;');
    await assert.rejects(()=>businessMigrationManifest(location),{code:'BUSINESS_MIGRATION_NAME_INVALID'});
  }finally{await rm(root,{recursive:true,force:true})}
});

test('first installation initializes only an empty vendor database and never adopts business or directory data',async()=>{
  const root=await mkdtemp(join(tmpdir(),'roomqc-business-initialize-'));
  try{
    await writeFile(join(root,'20261001000000_first.sql'),'CREATE TABLE first(id int);');
    const location=new URL('file:///'+root.replaceAll('\\','/')+'/'),manifest=await businessMigrationManifest(location);
    const options={location,expectedHash:manifest.sha256,expectedCount:manifest.count};
    const empty={vendor_tables:true,directory_schema:false,history_table:false,postgres_role:true,business_objects:0};
    class Pool extends FakePool{
      constructor(target){super();this.target=target}
      async connect(){const client=await super.connect();return {...client,query:(text,params)=>String(text).includes('AS business_objects')
        ?Promise.resolve({rows:[this.target]}):client.query(text,params)}}
    }
    const fresh=new Pool(empty);assert.equal((await initializeBusinessMigrationHistory(fresh,options)).initialized,true);
    assert.equal(fresh.committedSql.length,1);
    for(const patch of [{vendor_tables:false},{directory_schema:true},{business_objects:1},{postgres_role:false}]){
      const pool=new Pool({...empty,...patch});await assert.rejects(()=>initializeBusinessMigrationHistory(pool,options),{code:'BUSINESS_MIGRATION_INITIALIZATION_DENIED'});
      assert.deepEqual(pool.committedSql,[]);
    }
    const populated=new Pool({...empty,history_table:true});populated.history=[{version:'20261001000000',name:'first'}];
    await assert.rejects(()=>initializeBusinessMigrationHistory(populated,options),{code:'BUSINESS_MIGRATION_INITIALIZATION_DENIED'});
    assert.deepEqual(populated.committedSql,[]);
    await assert.rejects(()=>initializeBusinessMigrationHistory(new Pool(empty),{location}),{code:'BUSINESS_MIGRATION_SOURCE_MISMATCH'});
  }finally{await rm(root,{recursive:true,force:true})}
});
