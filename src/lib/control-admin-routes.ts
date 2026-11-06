/** Native reads share the configured public control origin; never accept arbitrary URLs. */
export function isControlAdminReadPath(path: string): boolean {
  const [pathname, query, extra] = path.split('?')
  if (extra !== undefined || path.includes('#') || path.includes('\\') || Array.from(path).some(c => c.charCodeAt(0) <= 32)) return false
  if (pathname === '/admin/overview') return query === undefined
  const alertResult = /^\/admin\/alerts\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\/acknowledgement-result$/.test(pathname)
  if (alertResult) return query === undefined
  if (/^\/admin\/workspaces\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\/tenant-summary$/.test(pathname)) return query === undefined
  if (/^\/admin\/workspaces\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\/recheck-result$/.test(pathname)) return query === undefined
  if (/^\/admin\/clusters\/[a-z][a-z0-9-]{1,39}\/command-result$/.test(pathname)) {
    const params = new URLSearchParams(query)
    return [...params.keys()].length === 1 && params.getAll('operation').length === 1
      && ['close_admission', 'open_admission', 'set_draining', 'set_serving', 'update_policy', 'set_host_maintenance', 'set_host_active', 'queue_deployment', 'register_cluster'].includes(params.get('operation') ?? '')
  }
  const alerts = pathname === '/admin/alerts'
  const backups = pathname === '/admin/backups'
  const deployments = pathname === '/admin/deployments' || pathname === '/admin/deployment-jobs'
  const specs = pathname === '/admin/deployment-specs'
  const hosts = pathname === '/admin/hosts', candidates = pathname === '/admin/cluster-candidates'
  if (!alerts && !backups && !deployments && !specs && !hosts && !candidates && !/^\/admin\/(?:overview|clusters(?:\/[a-z][a-z0-9-]{1,39})?|workspaces(?:\/[a-f0-9-]{36})?)$/.test(pathname)) return false
  if (query === undefined) return true
  const params = new URLSearchParams(query), keys = [...params.keys()]
  return new Set(keys).size === keys.length && keys.every(key => (alerts ? ['limit', 'cursor', 'state', 'severity']
    : backups ? ['limit', 'cursor', 'clusterId', 'scope', 'verificationState'] : deployments ? ['limit', 'cursor', 'clusterId', 'state'] : specs ? ['limit', 'cursor', 'clusterId'] : hosts ? ['limit', 'cursor', 'environment', 'status']
      : candidates ? ['limit', 'cursor'] : ['limit', 'cursor', 'status', 'clusterId', 'search']).includes(key))
    && [...params.values()].every(value => value.length <= 1024)
}

export function isControlAlertWritePath(path: string): boolean {
  return /^\/admin\/alerts\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\/acknowledge$/.test(path)
}
export function isControlClusterWritePath(path: string): boolean {
  return path === '/admin/clusters/register' || /^\/admin\/clusters\/[a-z][a-z0-9-]{1,39}\/commands$/.test(path)
}
export function isControlRecheckWritePath(path: string): boolean {
  return /^\/admin\/workspaces\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\/recheck$/.test(path)
}
