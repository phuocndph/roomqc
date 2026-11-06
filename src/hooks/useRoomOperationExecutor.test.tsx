import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useRoomOperationExecutor } from './useRoomOperationExecutor'
import { emailActor as actor, emailOther as room, emailSession as sid, emailTenant as tenant, emailToken } from '@/test/email-auth-fixture'
const mocks=vi.hoisted(()=>({actor:'',token:'',tenant:'',runtime:'A',profileId:'',status:'active',locked:false,submit:vi.fn()}))
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:mocks.actor},session:{user:{id:mocks.actor},access_token:mocks.token}})}))
vi.mock('./useUser',()=>({useUser:()=>({user:{id:mocks.profileId,tenant_id:mocks.tenant,status:mocks.status,account_locked:mocks.locked}})}))
vi.mock('@/lib/room-transition-client',()=>({roomCommandRuntimeScope:()=>mocks.runtime}))
vi.mock('@/lib/room-operation-client',()=>({submitRoomOperation:(...args:unknown[])=>mocks.submit(...args)}))
beforeEach(()=>{vi.clearAllMocks(); mocks.actor=actor; mocks.profileId=actor; mocks.token=emailToken(actor,sid); mocks.tenant=tenant; mocks.runtime='A'; mocks.status='active'; mocks.locked=false})
afterEach(cleanup)
const args={p_booking_id:room,p_room_id:room,p_early_checkin_charge:0}
it('passes room resources and aborts an active request on unmount',async()=>{
  let finish!:(value:unknown)=>void
  mocks.submit.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  const hook=renderHook(()=>useRoomOperationExecutor('view-A')); let pending!:Promise<unknown>
  act(()=>{pending=hook.result.current('perform_checkin',args,[room])})
  const options=mocks.submit.mock.calls[0][2]
  expect(options.roomIds).toEqual([room]); expect(options.isCurrent()).toBe(true)
  hook.unmount(); expect(options.signal.aborted).toBe(true); expect(options.isCurrent()).toBe(false)
  await act(async()=>{finish({}); await pending})
})
it.each(['runtime','view'])('fences an away/back response after %s changes',async mode=>{
  let finish!:(value:unknown)=>void
  mocks.submit.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  const hook=renderHook(({view})=>useRoomOperationExecutor(view),{initialProps:{view:'A'}}); let pending!:Promise<unknown>
  act(()=>{pending=hook.result.current('perform_checkin',args)})
  const options=mocks.submit.mock.calls[0][2]
  if(mode==='runtime') { mocks.runtime='B'; hook.rerender({view:'A'}); mocks.runtime='A'; hook.rerender({view:'A'}) }
  else { hook.rerender({view:'B'}); hook.rerender({view:'A'}) }
  expect(options.signal.aborted).toBe(true); expect(options.isCurrent()).toBe(false)
  await act(async()=>{finish({}); await pending})
})
it.each(['token','profile','inactive','locked'])('does not dispatch an incoherent or inactive identity (%s)',async mode=>{
  if(mode==='token') mocks.token='invalid'
  if(mode==='profile') mocks.profileId=room
  if(mode==='inactive') mocks.status='inactive'
  if(mode==='locked') mocks.locked=true
  const hook=renderHook(()=>useRoomOperationExecutor())
  await expect(hook.result.current('perform_checkin',args)).rejects.toMatchObject({code:'identity_changed'})
  expect(mocks.submit).not.toHaveBeenCalled()
})
