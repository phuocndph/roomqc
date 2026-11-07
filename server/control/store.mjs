import { createHmac, createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrateDirectory, importInitialRegistry, migrationManifest, verifyHistory } from './migrate.mjs';
import { ControlError,uuidPattern } from './errors.mjs';
import {AdminDirectory,clusterSelect,withCredential} from './admin.mjs';
import {admissionDecision} from './health-policy.mjs';
import {resolveCredential,registryConfiguration} from './registry.mjs';
import {releaseValidationContext} from './release-validation.mjs';
import {ReleaseApprovalStore,assertReleaseAuthority} from './release-authority.mjs';
import {AlertCommands} from './alert-commands.mjs';
import {assertControlResources} from './resource-runtime.mjs';
import {SetupDispatchStore} from './setup-dispatch.mjs';
import {WorkspaceRecheckStore} from './setup-recheck.mjs';
import {assertLiveSupportAuthority} from './support-authority.mjs';
import {currentSupportIntent} from './support-intents.mjs';
export {ControlError,uuidPattern} from './errors.mjs';

export function bindingMatches(workspace,binding) {
  return !!binding && ['tenant_id','hotel_id','owner_id'].every(k=>uuidPattern.test(binding[k] || ''))
    && binding.workspace_id===workspace.id
    && ['tenant_id','hotel_id','owner_id'].every(k=>!workspace[k] || workspace[k]===binding[k]);
}
export function supportSnapshot(w) {
  return Object.fromEntries(['id','slug','display_name','cluster_id','tenant_id','hotel_id','owner_id',
    'status','routing_version','last_error_code','expires_at','created_at','updated_at'].map(k=>[k,w[k] ?? null]));
}

const reserved = new Set(['admin','api','app','auth','assets','settings','support','roomqc','www','start','login','register','super-admin']);
export function validateSlug(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{2,47}$/.test(value) || value.includes('--') || value.endsWith('-') || reserved.has(value)) {
    throw new ControlError(400, 'INVALID_SLUG', 'Địa chỉ cần 3–48 ký tự chữ thường không dấu, số hoặc dấu gạch ngang; bắt đầu bằng chữ.');
  }
  return value;
}

export class ControlStore {
  constructor(config) {
    assertControlResources(config);
    // Programmatic test/CLI callers use the same registry resolver as loadConfig.
    if(!config.credentials||!config.inventory)Object.assign(config,registryConfiguration({},config.clusters,!config.production&&config.allowLocal!==false));
    this.config = config;
    this.pool = new pg.Pool({ connectionString: config.databaseUrl, max: config.poolMax ?? 5,
      connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000, statement_timeout: 8000,
      idle_in_transaction_session_timeout:10000,application_name:'roomqc-control' });
    this.pool.on('error', () => console.error('Control database idle connection failed'));
    this.admin=new AdminDirectory(this);
    this.alerts=new AlertCommands(this);
    this.setup=new SetupDispatchStore(this);
    this.rechecks=new WorkspaceRecheckStore(this);
  }
  hashEmail(email) { return createHmac('sha256', this.config.emailKey).update(email.trim().toLowerCase()).digest('hex'); }
  async authorizeRelease(row){
    return new ReleaseApprovalStore(this.pool).transaction(async client=>{
      const current=(await client.query('SELECT c.*,floor(extract(epoch FROM clock_timestamp())*1000) AS now_ms FROM roomqc_control.clusters c WHERE id=$1',[row.id])).rows[0];
      if(!current)throw new ControlError(404,'CLUSTER_NOT_FOUND','Không tìm thấy cụm.');
      const context=releaseValidationContext(this.config,current,{now:Number(current.now_ms)});
      await assertReleaseAuthority(client,context.approval);return context;
    });
  }
  async migrate() {
    const result=await migrateDirectory(this.pool);
    await importInitialRegistry(this.pool,this.config.clusters);
    return result;
  }
  async readiness() {
    if(this.config.resourceBudget){
      const budget=this.config.resourceBudget.databases.find(d=>d.kind==='directory');
      const actual=(await this.pool.query(`SELECT current_setting('max_connections')::integer AS maximum,
        current_setting('superuser_reserved_connections')::integer+coalesce(current_setting('reserved_connections',true),'0')::integer AS reserved`)).rows[0];
      if(budget.maxConnections>actual.maximum||budget.reservedConnections<actual.reserved)
        throw new ControlError(503,'RESOURCE_DATABASE_MISMATCH','Ngân sách không khớp giới hạn kết nối database thực tế.');
    }
    this.manifest ??= migrationManifest();
    const manifest=await this.manifest;
    if(await verifyHistory(this.pool,manifest)!==manifest.length) throw new ControlError(503,'CONTROL_SCHEMA_PENDING','Database điều phối chưa hoàn tất nâng cấp.');
    const shape=await this.pool.query(`SELECT count(*)::integer AS present FROM unnest($1::text[]) AS expected(name)
      WHERE to_regclass('roomqc_control.'||name) IS NOT NULL`,[[
      'hosts','clusters','workspaces','attempts','support_actions','cluster_policies','cluster_health_current',
      'cluster_admission_current','control_commands','cluster_events','provisioning_jobs','signup_affinities',
      'signup_affinity_conflicts','alerts','backup_runs','probe_credentials','release_approvals','release_authority','release_commands','release_key_revocations',
      'alert_events','alert_outbox','alert_delivery_attempts','setup_dispatches',
    ]]);
    if(shape.rows[0].present!==24)throw new ControlError(503,'CONTROL_SCHEMA_INCOMPLETE','Cấu trúc database điều phối chưa đầy đủ.');
    const {rows}=await this.pool.query(`SELECT id,api_url,inventory_ref,credential_ref FROM roomqc_control.clusters WHERE id=ANY($1::text[])`,[this.config.clusters.map(c=>c.id)]);
    if(this.config.clusters.some(c=>!rows.some(r=>r.id===c.id&&r.api_url===c.url))) {
      throw new ControlError(503,'CONTROL_REGISTRY_MISMATCH','Cấu hình cụm chưa được đồng bộ.');
    }
    const privilege=await this.pool.query(`SELECT r.rolsuper OR r.rolcreatedb OR r.rolcreaterole
      OR has_schema_privilege(current_user,'roomqc_control','CREATE')
      OR has_table_privilege(current_user,'roomqc_control.schema_migrations','INSERT,UPDATE,DELETE')
      OR has_table_privilege(current_user,'roomqc_control.attempts','UPDATE,DELETE')
      OR has_table_privilege(current_user,'roomqc_control.cluster_events','UPDATE,DELETE') AS excessive
      FROM pg_roles r WHERE r.rolname=current_user`);
    if(privilege.rows[0].excessive) throw new ControlError(503,'CONTROL_RUNTIME_PRIVILEGES','Dịch vụ phải dùng tài khoản database runtime riêng.');
    return {status:'ready',schemaVersion:manifest.at(-1).version};
  }
  async clusterCredential(workspace){
    const {rows}=await this.pool.query('SELECT * FROM roomqc_control.clusters WHERE id=$1',[workspace.cluster_id]);
    const row=rows[0];
    if(!row||(workspace.api_url&&row.api_url!==workspace.api_url)||row.status==='offline')throw new ControlError(503,'CLUSTER_UNAVAILABLE','Cụm dữ liệu chưa sẵn sàng.');
    return resolveCredential(this.config,row);
  }
  async reserve({ slug, email, displayName }, requestId) {
    validateSlug(slug);
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ControlError(400, 'INVALID_EMAIL', 'Email không hợp lệ.');
    if (typeof displayName !== 'string' || displayName.trim().length < 2 || displayName.trim().length > 120) throw new ControlError(400, 'INVALID_NAME', 'Tên doanh nghiệp cần 2–120 ký tự.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // One short allocation lock; never hold it while contacting a cluster.
      await client.query("SELECT pg_advisory_xact_lock(727001)");
      const emailHash = this.hashEmail(email);
      // Atomic with allocation. Never release provisioning/active rows by age:
      // a remote commit can exist even when no receipt has reached directory.
      await this.expireReservations(client,requestId);
      const duplicate = await client.query("SELECT * FROM roomqc_control.workspaces WHERE status<>'expired' AND (slug=$1 OR email_hash=$2)", [slug, emailHash]);
      if (duplicate.rowCount) {
        if (duplicate.rows.length === 1 && duplicate.rows[0].slug === slug && duplicate.rows[0].email_hash === emailHash) {
          await client.query('COMMIT'); return duplicate.rows[0];
        }
        throw new ControlError(409, 'RESERVATION_CONFLICT', 'Địa chỉ hoặc email đã có đăng ký. Hãy đăng nhập để tiếp tục hoặc liên hệ hỗ trợ.');
      }
      const budget=await client.query(`SELECT
        (SELECT count(*) FROM roomqc_control.workspaces WHERE created_at>now()-interval '1 hour') AS hourly,
        (SELECT count(*) FROM roomqc_control.workspaces WHERE email_hash=$1 AND created_at>now()-interval '1 day') AS email_daily`,[emailHash]);
      if(Number(budget.rows[0].hourly)>=(this.config.signupHourLimit??100) || Number(budget.rows[0].email_daily)>=(this.config.emailDayLimit??3)) {
        throw new ControlError(429,'SIGNUP_LIMIT','Đã đạt giới hạn đăng ký tạm thời. Hãy tiếp tục đăng ký đã có hoặc thử lại sau.');
      }
      const conflict=await client.query('SELECT 1 FROM roomqc_control.signup_affinity_conflicts WHERE email_hash=$1',[emailHash]);
      if(conflict.rowCount)throw new ControlError(409,'AFFINITY_REVIEW_REQUIRED','Đăng ký cần hỗ trợ đối soát. Vui lòng dùng tài khoản đã có; không tạo doanh nghiệp khác.');
      const affinity=await client.query('SELECT cluster_id FROM roomqc_control.signup_affinities WHERE email_hash=$1',[emailHash]);
      const clusters=await client.query(clusterSelect+(affinity.rowCount?' WHERE c.id=$1':''),affinity.rowCount?[affinity.rows[0].cluster_id]:[]);
      const selected=clusters.rows.map(row=>withCredential(this.config,row)).filter(row=>admissionDecision(row).decision==='open')
        .sort((a,b)=>a.allocated_count/a.tenant_limit-b.allocated_count/b.tenant_limit||a.id.localeCompare(b.id))[0];
      if(!selected)throw new ControlError(503,affinity.rowCount?'AFFINITY_CLUSTER_BLOCKED':'NO_CAPACITY',
        affinity.rowCount?'Cụm đã gán đang tạm ngừng nhận thiết lập mới. Hãy tiếp tục đăng ký cũ hoặc liên hệ hỗ trợ.':'Hệ thống đang tạm dừng nhận đăng ký mới. Vui lòng thử lại sau.');
      const { rows } = await client.query(`INSERT INTO roomqc_control.workspaces(id,slug,display_name,email_hash,cluster_id,expires_at)
        VALUES($1,$2,$3,$4,$5,now()+make_interval(mins=>$6)) RETURNING *`, [randomUUID(),slug,displayName.trim(),emailHash,selected.id,this.config.reservationMinutes??1440]);
      await client.query(`UPDATE roomqc_control.workspaces SET admission_policy_version=$2,admission_health_generation=$3 WHERE id=$1`,[rows[0].id,selected.policy_version,selected.source_generation]);
      await client.query(`INSERT INTO roomqc_control.signup_affinities(email_hash,cluster_id,policy_version) VALUES($1,$2,$3)
        ON CONFLICT(email_hash) DO NOTHING`,[emailHash,selected.id,selected.policy_version]);
      await client.query('INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES($1,$2,$3)', [requestId,rows[0].id,'reserved']);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async expireReservations(client,requestId) {
    return client.query(`WITH expired AS (
      UPDATE roomqc_control.workspaces SET status='expired',updated_at=now()
      WHERE status='reserved' AND expires_at<=now() AND owner_id IS NULL AND tenant_id IS NULL
      RETURNING id
    ) INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome)
      SELECT $1,id,'reservation_expired' FROM expired`,[requestId]);
  }
  async sweepReservations(requestId=randomUUID()) {
    // reserve() also performs cleanup, so no background scheduler is required
    // for capacity reclamation. This method serves the explicit maintenance CLI.
    return this.expireReservations(this.pool,requestId);
  }
  async beginProvision(workspace,user,requestId) {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(727001)');
      const current=(await client.query('SELECT * FROM roomqc_control.workspaces WHERE id=$1 FOR UPDATE',[workspace.id])).rows[0];
      if((await client.query('SELECT 1 FROM roomqc_control.setup_dispatches WHERE workspace_id=$1 LIMIT 1',[workspace.id])).rowCount)
        throw new ControlError(409,'SETUP_DISPATCH_REQUIRED','Đăng ký phải tiếp tục qua giao thức cấp phát hiện hành.');
      if(['reserved','provisioning','active'].includes(current?.status)){
        const cluster=await this.admin.cluster(current.cluster_id,client),gate=admissionDecision(cluster,{ignoreCapacity:true});
        if(gate.decision!=='open')throw new ControlError(503,'PROVISIONING_WAIT','Cụm đang tạm ngừng thiết lập mới. Đăng ký được giữ nguyên; vui lòng thử lại sau.');
      }
      const {rows}=await client.query(`UPDATE roomqc_control.workspaces SET status=CASE WHEN status='reserved' THEN 'provisioning' ELSE status END,
        owner_id=$2,expires_at=NULL,updated_at=now()
        WHERE id=$1 AND email_hash=$3 AND (owner_id IS NULL OR owner_id=$2)
          AND status IN ('reserved','provisioning','active')
          AND (status<>'reserved' OR expires_at IS NULL OR expires_at>now()) RETURNING *`,
      [workspace.id,user.id,this.hashEmail(user.email)]);
      if(!rows[0])throw new ControlError(409,'RESERVATION_CHANGED','Đăng ký đã hết hạn hoặc thay đổi. Hãy mở lại trang đăng ký để kiểm tra.');
      await client.query('INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES($1,$2,$3)',[requestId,workspace.id,'provisioning_started']);
      await client.query('COMMIT');
      return {...workspace,...rows[0]};
    }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  }
  async workspace(slug) {
    validateSlug(slug);
    const { rows } = await this.pool.query(`SELECT w.*,c.api_url,c.publishable_key,c.vapid_public_key,c.status AS cluster_status
      FROM roomqc_control.workspaces w JOIN roomqc_control.clusters c ON c.id=w.cluster_id WHERE w.slug=$1 AND w.status<>'expired'`, [slug]);
    if (!rows[0]) throw new ControlError(404, 'WORKSPACE_NOT_FOUND', 'Không tìm thấy doanh nghiệp. Hãy kiểm tra lại địa chỉ.');
    const row = rows[0];
    if(row.status==='reserved' && row.expires_at && new Date(row.expires_at)<=new Date()) {
      throw new ControlError(410,'RESERVATION_EXPIRED','Đăng ký đã hết hạn giữ chỗ. Hãy mở trang đăng ký để tiếp tục; tài khoản đã tạo vẫn được giữ nguyên.');
    }
    if (row.cluster_status === 'offline') {
      throw new ControlError(503, 'CLUSTER_UNAVAILABLE', 'Cụm dữ liệu đang tạm thời không khả dụng. Vui lòng thử lại sau.');
    }
    const credential=await this.clusterCredential(row);
    row.publishable_key=credential.publishableKey;row.vapid_public_key=credential.vapidPublicKey;
    if (['suspended','migrating'].includes(row.status)) throw new ControlError(503, 'WORKSPACE_UNAVAILABLE', 'Doanh nghiệp đang tạm ngưng hoặc bảo trì.');
    return row;
  }
  async setupStatusSnapshot(workspace,user) {
    const {rows}=await this.pool.query(`SELECT w.*,clock_timestamp() AS checked_at,
      CASE WHEN j.id IS NULL THEN NULL ELSE jsonb_build_object('id',j.id,'state',j.state,
        'routingVersion',j.expected_routing_version,'nextAttemptAt',j.next_attempt_at,'leaseUntil',j.lease_until,
        'closureVerified',j.closure_verified) END AS setup_job
      FROM roomqc_control.workspaces w LEFT JOIN LATERAL (
        SELECT j.id,j.state,j.expected_routing_version,j.next_attempt_at,j.lease_until,
          COALESCE(j.state='waiting_owner' AND d.terminal_state='closed' AND d.workspace_id=w.id
            AND d.cluster_id=w.cluster_id AND d.owner_id=w.owner_id AND d.routing_version=w.routing_version
            AND j.expected_routing_version=d.routing_version,false) AS closure_verified
        FROM roomqc_control.provisioning_jobs j LEFT JOIN roomqc_control.setup_dispatches d ON d.id=j.dispatch_id
        WHERE j.workspace_id=w.id ORDER BY j.created_at DESC,j.id DESC LIMIT 1
      ) j ON true WHERE w.id=$1 AND w.cluster_id=$2 AND w.routing_version=$3 AND w.email_hash=$4
        AND (w.owner_id IS NULL OR w.owner_id=$5) AND w.status IN ('reserved','provisioning','active')
        AND (w.status<>'reserved' OR w.expires_at IS NULL OR w.expires_at>clock_timestamp())`,
      [workspace.id,workspace.cluster_id,workspace.routing_version,this.hashEmail(user.email),user.id]);
    if(!rows[0])throw new ControlError(409,'SETUP_STATUS_CHANGED','Đăng ký vừa thay đổi hoặc hết hạn. Vui lòng mở lại trang đăng ký.');
    return {...workspace,...rows[0]};
  }
  async activate(workspace, binding, requestId, supportActionId=null, supportAuthority=null) {
    // Support must use the durable coordinator and its checked-out client.
    // Retain this entry point for owner/bootstrap only; never nest pool leases.
    if(supportActionId)throw new ControlError(503,'SUPPORT_INTENT_REQUIRED','Cần đối soát bằng mã lệnh hỗ trợ bền vững.');
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const result=await this.activateInTransaction(client,workspace,binding,requestId);
      await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
  }
  async activateInTransaction(client,workspace,binding,requestId,supportActionId=null,supportAuthority=null) {
    if(!bindingMatches(workspace,binding)) throw new ControlError(409,'BINDING_CONFLICT','Receipt không khớp đăng ký; cần đối soát kỹ thuật.');
    if(supportActionId){
      const intent=currentSupportIntent(client);
      if(!intent||intent.context.kind!=='support'||intent.context.target!==workspace.id
        ||intent.context.actorId!==supportAuthority?.actor?.id?.toLowerCase()
        ||intent.context.authorityClusterId!==supportAuthority?.actor?.clusterId)
        throw new ControlError(503,'SUPPORT_INTENT_REQUIRED','Chưa xác nhận được mã lệnh hỗ trợ.');
      await assertLiveSupportAuthority(supportAuthority.actor,supportAuthority.authorize);
    }
      // An adopted workspace must settle its actual dispatch and job together.
      // Legacy bootstrap/support must not activate it through a weaker path.
      await client.query('SELECT id FROM roomqc_control.workspaces WHERE id=$1 FOR UPDATE',[workspace.id]);
      if(supportActionId)await assertLiveSupportAuthority(supportAuthority.actor,supportAuthority.authorize);
      if((await client.query('SELECT 1 FROM roomqc_control.setup_dispatches WHERE workspace_id=$1 LIMIT 1',[workspace.id])).rowCount)
        throw new ControlError(409,'SETUP_DISPATCH_RECOVERY_REQUIRED','Cần đối soát dispatch trước khi mở khách sạn.');
      const { rows } = await client.query(`UPDATE roomqc_control.workspaces SET tenant_id=$2,hotel_id=$3,owner_id=$4,
        status='active',expires_at=NULL,last_error_code=NULL,updated_at=now() WHERE id=$1 AND status IN ('reserved','provisioning','active')
        AND (status<>'reserved' OR expires_at IS NULL OR expires_at>now())
        AND cluster_id=$5 AND routing_version=$6
        AND (tenant_id IS NULL OR tenant_id=$2) AND (hotel_id IS NULL OR hotel_id=$3)
        AND (owner_id IS NULL OR owner_id=$4) RETURNING *`,
      [workspace.id,binding.tenant_id,binding.hotel_id,binding.owner_id,workspace.cluster_id,workspace.routing_version]);
      if (!rows[0]) throw new ControlError(409, 'BINDING_CONFLICT', 'Thiết lập đã thay đổi hoặc có xung đột. Hãy tra cứu lại.');
      await client.query('INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES($1,$2,$3)',[requestId,workspace.id,'active']);
      if(supportActionId) {
        const audit=await client.query(`UPDATE roomqc_control.support_actions SET outcome='reconciled',
            after_state=$2::jsonb,error_code=NULL,finished_at=now() WHERE id=$1 AND workspace_id=$3 AND outcome IN ('started','failed')`,
        [supportActionId,JSON.stringify(supportSnapshot(rows[0])),workspace.id]);
        if(audit.rowCount!==1) throw new ControlError(409,'SUPPORT_AUDIT_CONFLICT','Không thể ghi nhật ký hỗ trợ.');
      }
      return { ...workspace, ...rows[0] };
  }
  async recordFailure(workspaceId,requestId,code) {
    // Late failures must not overwrite an already active binding. Retain the
    // attempt even if a concurrent successful request cleared the error state.
    await this.pool.query(`WITH changed AS (
      UPDATE roomqc_control.workspaces w SET last_error_code=$3,updated_at=now()
      WHERE w.id=$1 AND w.status IN ('reserved','provisioning')
        AND NOT EXISTS(SELECT 1 FROM roomqc_control.setup_dispatches d WHERE d.workspace_id=w.id) RETURNING w.id
    ) INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES($2,$1,$3)`,[workspaceId,requestId,code]);
  }
  async supportFind(query) {
    if(typeof query!=='string' || query.length>48) throw new ControlError(400,'INVALID_LOOKUP','Nhập slug hoặc mã hỗ trợ hợp lệ.');
    const isRequest=uuidPattern.test(query);
    if(!isRequest) validateSlug(query);
    const {rows}=await this.pool.query(`SELECT w.*,c.api_url,c.status AS cluster_status
      FROM roomqc_control.workspaces w JOIN roomqc_control.clusters c ON c.id=w.cluster_id
      WHERE ${isRequest ? `w.id IN (SELECT workspace_id FROM roomqc_control.attempts WHERE request_id=$1::uuid
        UNION SELECT workspace_id FROM roomqc_control.support_actions WHERE request_id=$1::uuid)` : 'w.slug=$1'}
      ORDER BY w.created_at DESC LIMIT 1`,[query]);
    if(!rows[0]) throw new ControlError(404,'WORKSPACE_NOT_FOUND','Không tìm thấy đăng ký theo slug/mã hỗ trợ này.');
    return rows[0];
  }
  async supportHistory(workspaceId) {
    const attempts=await this.pool.query(`SELECT request_id,outcome,created_at FROM roomqc_control.attempts
      WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20`,[workspaceId]);
    const actions=await this.pool.query(`SELECT id,request_id,actor_id,authority_cluster_id,reason,outcome,error_code,
      before_state,after_state,created_at,finished_at FROM roomqc_control.support_actions
      WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20`,[workspaceId]);
    return {attempts:attempts.rows,actions:actions.rows};
  }
  async supportCommandAction(actor,workspaceId,key,client=this.pool) {
    const {rows}=await client.query(`SELECT * FROM roomqc_control.support_actions WHERE actor_id=$1 AND authority_cluster_id=$2
      AND workspace_id=$3 AND command_key=$4 LIMIT 2`,[actor.id,actor.clusterId,workspaceId,key]);
    if(rows.length>1)throw new ControlError(409,'SUPPORT_RESULT_UNAVAILABLE','Có lịch sử hỗ trợ cần đối soát. Giữ nguyên mã lệnh.');
    return rows[0]??null;
  }
  async startSupportAction(workspace,actor,reason,requestId,command) {
    if(!command||!uuidPattern.test(command.key??'')||!(/^[a-f0-9]{64}$/).test(command.payloadHash??''))
      throw new ControlError(400,'SUPPORT_COMMAND_KEY_REQUIRED','Cần mã lệnh hỗ trợ cố định.');
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      // All legacy callers serialize action creation on the actual workspace.
      // Release this lease before acquiring the coordinator's command fence.
      await client.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='5s'");
      await client.query('SELECT id FROM roomqc_control.workspaces WHERE id=$1 FOR UPDATE',[workspace.id]);
      const previous=await this.supportCommandAction(actor,workspace.id,command.key,client);
      if(previous){
        if(previous.payload_hash!==command.payloadHash)throw new ControlError(409,'IDEMPOTENCY_CONFLICT','Mã lệnh đã dùng cho nội dung khác.');
        await client.query('COMMIT');return previous.id;
      }
      const id=randomUUID();
      await client.query(`INSERT INTO roomqc_control.support_actions
      (id,request_id,workspace_id,actor_id,authority_cluster_id,reason,before_state,command_key,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
      [id,requestId,workspace.id,actor.id,actor.clusterId,reason,JSON.stringify(supportSnapshot(workspace)),command.key,command.payloadHash]);
      await client.query('COMMIT');return id;
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
  }
  async failSupportAction(id,code) {
    await this.pool.query(`UPDATE roomqc_control.support_actions SET outcome='failed',error_code=$2,finished_at=now()
      WHERE id=$1 AND outcome='started'`,[id,code]);
  }
  async audit(workspaceId,requestId,outcome) {
    await this.pool.query('INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES($1,$2,$3)', [requestId,workspaceId,outcome]);
  }
  async close() { await this.pool.end(); }
}
