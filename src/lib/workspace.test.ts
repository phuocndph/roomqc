import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateBootstrap, workspaceBase, workspacePath, workspaceSlug, workspaceNext } from './workspace'
import { configureWorkspace, runtimeConfig, scopedStorageKey } from './runtime-config'

const bootstrap = {
  version: 1 as const,
  workspace: {id:'11111111-1111-4111-8111-111111111111',slug:'anthuy',displayName:'An Thủy',tenantId:'22222222-2222-4222-8222-222222222222',status:'active' as const,routingVersion:1},
  cluster: {id:'cluster-a',url:'https://a.supabase.co',publishableKey:'sb_publishable_test',vapidPublicKey:'public'},
}
const initial = {...runtimeConfig}
afterEach(() => { Object.assign(runtimeConfig,initial); vi.unstubAllGlobals() })

describe('workspace bootstrap and routing', () => {
  it('normalizes callback destinations without duplicating a router basename', () => {
    expect(workspaceNext('/app/anthuy/oauth/consent?id=123', '/app/anthuy/auth/login')).toBe('/oauth/consent?id=123')
    expect(workspaceNext('/rooms', '/app/anthuy/auth/login')).toBe('/rooms')
    expect(workspaceNext('/app/other/rooms', '/app/anthuy/auth/login')).toBeNull()
    expect(workspaceNext('//external.invalid', '/app/anthuy/auth/login')).toBeNull()
    expect(workspaceNext(null, '/auth/login')).toBeNull()
  })
  it('scopes deep links and keeps legacy URLs compatible', () => {
    expect(workspaceSlug('/app/anthuy/rooms/123')).toBe('anthuy')
    expect(workspaceBase('/app/anthuy')).toBe('/app/anthuy')
    expect(workspacePath('/rooms?floor=2','/app/anthuy/')).toBe('/app/anthuy/rooms?floor=2')
    expect(workspacePath('/auth/login','/auth/login')).toBe('/auth/login')
    expect(workspacePath('/app/anthuy/rooms','/app/anthuy/')).toBe('/app/anthuy/rooms')
  })
  it.each(['/app/','/app/Abc/','/app/a--b/','/app/abc-/'])('rejects malformed workspace URLs %s', path => {
    expect(()=>workspaceSlug(path)).toThrow()
  })
  it('does not turn external or cross-workspace links into internal redirects', () => {
    for(const path of ['//evil.invalid','https://evil.invalid','/\\evil.invalid','/app/other/rooms','/../other','/%2e%2e/other','/%5cother','/%00','/%xx']) {
      expect(()=>workspacePath(path,'/app/anthuy/')).toThrow()
    }
  })
  it('rejects unknown cluster origins and wrong workspace responses', () => {
    expect(validateBootstrap(bootstrap,'anthuy',['https://a.supabase.co'])).toBe(bootstrap)
    expect(()=>validateBootstrap(bootstrap,'other',['https://a.supabase.co'])).toThrow()
    expect(()=>validateBootstrap(bootstrap,'anthuy',['https://b.supabase.co'])).toThrow()
    expect(()=>validateBootstrap({...bootstrap,workspace:{...bootstrap.workspace,tenantId:null}},'anthuy',['https://a.supabase.co'])).toThrow()
  })
  it('namespaces sessions/preferences by stable workspace identity', () => {
    configureWorkspace(bootstrap)
    const keyA=scopedStorageKey('selected_hotel_id','user-A')
    expect(runtimeConfig.supabaseUrl).toBe('https://a.supabase.co')
    configureWorkspace({...bootstrap,workspace:{...bootstrap.workspace,id:'33333333-3333-4333-8333-333333333333',slug:'other'}})
    expect(scopedStorageKey('selected_hotel_id','user-A')).not.toBe(keyA)
    expect(scopedStorageKey('selected_hotel_id','user-B')).not.toBe(scopedStorageKey('selected_hotel_id','user-A'))
  })
  it('accepts a server deadline but rejects malformed deadlines and expired status',()=>{
    const value={...bootstrap,workspace:{...bootstrap.workspace,status:'reserved',tenantId:null,reservationExpiresAt:'2026-10-16T12:00:00Z'}}
    expect(validateBootstrap(value,'anthuy',['https://a.supabase.co']).workspace.reservationExpiresAt).toBe(value.workspace.reservationExpiresAt)
    for(const reservationExpiresAt of [42,'invalid',{},''])expect(()=>validateBootstrap({...value,workspace:{...value.workspace,reservationExpiresAt}},'anthuy',['https://a.supabase.co'])).toThrow()
    expect(()=>validateBootstrap({...value,workspace:{...value.workspace,status:'expired'}},'anthuy',['https://a.supabase.co'])).toThrow()
  })
  it('never accepts a service credential from directory bootstrap', () => {
    expect(()=>configureWorkspace({...bootstrap,cluster:{...bootstrap.cluster,publishableKey:'sb_secret_not_public'}})).toThrow()
  })
})
