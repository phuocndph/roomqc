import {controlRequest} from './workspace'

export interface WorkspaceSetupStatus {
  workspaceId: string
  routingVersion: number
  step: 'waiting_email' | 'ready_to_setup' | 'provisioning' | 'waiting_owner' | 'needs_review' | 'retry' | 'active'
  nextAction: 'verify_email' | 'continue_setup' | 'wait' | 'contact_support' | 'open_workspace'
  lastErrorCode: string | null
  retryAfter: number | null
  requestId: string
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function validateWorkspaceSetupStatus(raw: unknown,workspaceId: string,routingVersion: number): WorkspaceSetupStatus {
  const v=raw as WorkspaceSetupStatus
  const actions: Record<WorkspaceSetupStatus['step'],WorkspaceSetupStatus['nextAction']>={waiting_email:'verify_email',ready_to_setup:'continue_setup',
    provisioning:'wait',waiting_owner:'continue_setup',needs_review:'contact_support',retry:'wait',active:'open_workspace'}
  if(!v||v.workspaceId!==workspaceId||!uuid.test(v.workspaceId)||!Number.isSafeInteger(v.routingVersion)||v.routingVersion<1
    ||v.routingVersion!==routingVersion||!Object.prototype.hasOwnProperty.call(actions,v.step)
    ||v.nextAction!==actions[v.step]||!uuid.test(v.requestId)
    ||!(v.lastErrorCode===null||typeof v.lastErrorCode==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(v.lastErrorCode))
    ||(v.nextAction==='wait'? !Number.isInteger(v.retryAfter)||Number(v.retryAfter)<1||Number(v.retryAfter)>60:v.retryAfter!==null)){
    throw new Error('Tiến độ thiết lập chưa được xác nhận. Vui lòng kiểm tra lại.')
  }
  // Project only the public DTO; never retain arbitrary server fields.
  return {workspaceId:v.workspaceId,routingVersion:v.routingVersion,step:v.step,nextAction:v.nextAction,
    lastErrorCode:v.lastErrorCode,retryAfter:v.retryAfter,requestId:v.requestId}
}
export async function loadWorkspaceSetupStatus({slug,workspaceId,routingVersion,token,signal}:{slug:string;workspaceId:string;routingVersion:number;token:string;signal:AbortSignal}) {
  if(!/^[a-z][a-z0-9-]{2,47}$/.test(slug)||slug.includes('--')||slug.endsWith('-')||!token)throw new Error('Vui lòng đăng nhập lại để xem tiến độ.')
  return validateWorkspaceSetupStatus(await controlRequest(`/workspaces/${slug}/setup-status`,{method:'GET',
    headers:{Authorization:`Bearer ${token}`},signal}),workspaceId,routingVersion)
}
