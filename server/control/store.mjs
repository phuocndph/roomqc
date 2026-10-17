import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

export class ControlError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    this.config = config;
    this.pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5,
      connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 8000 });
    this.pool.on('error', () => console.error('Control database idle connection failed'));
  }
  hashEmail(email) { return createHmac('sha256', this.config.emailKey).update(email.trim().toLowerCase()).digest('hex'); }
  async migrate() {
    await this.pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
    for (const cluster of this.config.clusters) {
      // Never silently redirect existing workspaces to a different backend.
      const existing = await this.pool.query('SELECT api_url FROM roomqc_control.clusters WHERE id=$1', [cluster.id]);
      if (existing.rows[0] && existing.rows[0].api_url !== cluster.url) throw new Error('Cluster endpoint changed; explicit migration is required');
      await this.pool.query(`INSERT INTO roomqc_control.clusters(id,api_url,publishable_key,vapid_public_key,max_workspaces)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET
        publishable_key=excluded.publishable_key,vapid_public_key=excluded.vapid_public_key,max_workspaces=excluded.max_workspaces`,
      [cluster.id, cluster.url, cluster.publishableKey, cluster.vapidPublicKey, cluster.maxWorkspaces]);
    }
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
      const eligibleIds = this.config.clusters.map(c => c.id);
      const selected = await client.query(`SELECT c.id FROM roomqc_control.clusters c
        LEFT JOIN roomqc_control.workspaces w ON w.cluster_id=c.id AND w.status<>'expired'
        WHERE c.status='active' AND c.schema_version=1 AND c.id=ANY($1::text[])
        GROUP BY c.id HAVING count(w.id)<c.max_workspaces
        ORDER BY count(w.id)::numeric/c.max_workspaces,c.id LIMIT 1`, [eligibleIds]);
      if (!selected.rowCount) throw new ControlError(503, 'NO_CAPACITY', 'Hệ thống đang tạm dừng nhận đăng ký mới. Vui lòng thử lại sau.');
      const { rows } = await client.query(`INSERT INTO roomqc_control.workspaces(id,slug,display_name,email_hash,cluster_id,expires_at)
        VALUES($1,$2,$3,$4,$5,now()+make_interval(mins=>$6)) RETURNING *`, [randomUUID(),slug,displayName.trim(),emailHash,selected.rows[0].id,this.config.reservationMinutes??1440]);
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
    if (!this.config.clusters.some(c => c.id === row.cluster_id && c.url === row.api_url) || row.cluster_status === 'offline') {
      throw new ControlError(503, 'CLUSTER_UNAVAILABLE', 'Cụm dữ liệu đang tạm thời không khả dụng. Vui lòng thử lại sau.');
    }
    if (['suspended','migrating'].includes(row.status)) throw new ControlError(503, 'WORKSPACE_UNAVAILABLE', 'Doanh nghiệp đang tạm ngưng hoặc bảo trì.');
    return row;
  }
  async activate(workspace, binding, requestId, supportActionId=null) {
    if(!bindingMatches(workspace,binding)) throw new ControlError(409,'BINDING_CONFLICT','Receipt không khớp đăng ký; cần đối soát kỹ thuật.');
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
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
          after_state=$2::jsonb,finished_at=now() WHERE id=$1 AND workspace_id=$3 AND outcome='started'`,
        [supportActionId,JSON.stringify(supportSnapshot(rows[0])),workspace.id]);
        if(audit.rowCount!==1) throw new ControlError(409,'SUPPORT_AUDIT_CONFLICT','Không thể ghi nhật ký hỗ trợ.');
      }
      await client.query('COMMIT');
      return { ...workspace, ...rows[0] };
    } catch(error) {await client.query('ROLLBACK');throw error} finally {client.release()}
  }
  async recordFailure(workspaceId,requestId,code) {
    // Late failures must not overwrite an already active binding. Retain the
    // attempt even if a concurrent successful request cleared the error state.
    await this.pool.query(`WITH changed AS (
      UPDATE roomqc_control.workspaces SET last_error_code=$3,updated_at=now()
      WHERE id=$1 AND status IN ('reserved','provisioning') RETURNING id
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
  async startSupportAction(workspace,actor,reason,requestId) {
    const id=randomUUID();
    await this.pool.query(`INSERT INTO roomqc_control.support_actions
      (id,request_id,workspace_id,actor_id,authority_cluster_id,reason,before_state) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [id,requestId,workspace.id,actor.id,actor.clusterId,reason,JSON.stringify(supportSnapshot(workspace))]);
    return id;
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
