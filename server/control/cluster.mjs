import { ControlError, uuidPattern } from './store.mjs';

export class ClusterGateway {
  constructor(config, fetcher = fetch) { this.config = config; this.fetcher = fetcher; }
  cluster(workspace) {
    const cluster = this.config.clusters.find(c => c.id === workspace.cluster_id && c.url === workspace.api_url);
    if (!cluster) throw new ControlError(503,'CLUSTER_UNAVAILABLE','Cụm dữ liệu chưa sẵn sàng.');
    return cluster;
  }
  async request(cluster,path,{ token, body, method = 'POST' } = {}) {
    let response;
    try {
      response = await this.fetcher(`${cluster.internalUrl || cluster.url}${path}`, { method, redirect: 'error',
        signal: AbortSignal.timeout(20000), headers: { apikey: token ? cluster.publishableKey : cluster.serviceKey,
          ...(token || !cluster.serviceKey.startsWith('sb_secret_') ? {Authorization: `Bearer ${token || cluster.serviceKey}`} : {}), 'Content-Type':'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new ControlError(503,'CLUSTER_UNAVAILABLE','Không thể kết nối cụm dữ liệu. Vui lòng thử lại; không đăng ký lại doanh nghiệp.'); }
    if (!response.ok) throw new ControlError(response.status === 401 || response.status === 403 ? 401 : 503,
      'CLUSTER_REQUEST_FAILED', 'Không thể xác nhận phiên đăng nhập hoặc thiết lập. Vui lòng thử lại.');
    return response.json();
  }
  async user(workspace, token) {
    if (!token || token.length > 16000) throw new ControlError(401,'LOGIN_REQUIRED','Vui lòng đăng nhập.');
    const user = await this.request(this.cluster(workspace),'/auth/v1/user',{token,method:'GET'});
    if (!user.id || !user.email || !user.email_confirmed_at) throw new ControlError(403,'EMAIL_NOT_VERIFIED','Hãy xác thực email trước khi thiết lập.');
    return user;
  }
  async supportActor(token) {
    const cluster = this.config.clusters.find(c => c.id === this.config.supportClusterId);
    if (!cluster) throw new ControlError(503,'SUPPORT_DISABLED','Công cụ hỗ trợ chưa được cấu hình.');
    if (!token || token.length > 16000) throw new ControlError(401,'LOGIN_REQUIRED','Vui lòng đăng nhập quản trị.');
    // This RPC checks live role, lock and auth.sessions in the canonical cluster.
    // Never let the caller choose an authority or authorize from user_metadata.
    const actor = await this.request(cluster,'/rest/v1/rpc/platform_support_actor',{token,body:{}});
    if (typeof actor !== 'string' || !uuidPattern.test(actor)) {
      throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Cần quyền quản trị nền tảng đang hoạt động.');
    }
    return { id:actor, clusterId:cluster.id };
  }
  async binding(workspace) {
    return this.request(this.cluster(workspace),'/rest/v1/rpc/get_workspace_provisioning', { body:{p_workspace_id:workspace.id} });
  }
  async provision(workspace,user,fields) {
    return this.request(this.cluster(workspace),'/rest/v1/rpc/provision_workspace_registration', {
      body:{p_workspace_id:workspace.id,p_owner_id:user.id,p_fields:{...fields,workspaceSlug:workspace.slug}} });
  }
}
