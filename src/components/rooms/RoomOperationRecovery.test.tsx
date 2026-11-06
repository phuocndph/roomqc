import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RoomOperationRecovery } from './RoomOperationRecovery'
import { RoomCommandError } from '@/lib/room-transition-command'
import type { PendingRoomOperation } from '@/lib/room-operation-command'
import { emailActor as actor, emailOther as other, emailSession as sid, emailTenant as tenant, emailHotel as room, emailOperation as command, emailToken } from '@/test/email-auth-fixture'
const mocks=vi.hoisted(()=>({actor:'',runtime:'A',tenant:'',items:[] as PendingRoomOperation[],running:false,storageFails:false,
  recover:vi.fn(),cancel:vi.fn(),success:vi.fn(),info:vi.fn(),error:vi.fn()}))
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:mocks.actor},session:{user:{id:mocks.actor},access_token:emailToken(mocks.actor,sid)}})}))
vi.mock('@/hooks/useUser',()=>({useUser:()=>({user:{id:mocks.actor,tenant_id:mocks.tenant,status:'active'}})}))
vi.mock('@/lib/room-transition-client',()=>({roomCommandRuntimeScope:()=>mocks.runtime}))
vi.mock('@/lib/room-operation-client',()=>({roomOperationPendingEvent:'owned-operation-event', isRoomOperationRunning:()=>mocks.running,
  roomOperationClient:()=>({pending:(c:{actorId:string;tenantId:string;runtime:string})=>{
    if(mocks.storageFails) throw new Error('private storage')
    return mocks.items.filter(p=>p.actorId===c.actorId&&p.tenantId===c.tenantId&&p.runtime===c.runtime)
  }}), recoverRoomOperation:(...args:unknown[])=>mocks.recover(...args),cancelRoomOperation:(...args:unknown[])=>mocks.cancel(...args),
  roomOperationErrorMessage:()=> 'Chưa xác nhận được kết quả. Kiểm tra lại thao tác đang chờ.' }))
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({in:()=>({abortSignal:async()=>({data:[{id:room,room_number:'101'}],error:null})})})})}}))
vi.mock('sonner',()=>({toast:{success:(...args:unknown[])=>mocks.success(...args),info:(...args:unknown[])=>mocks.info(...args),error:(...args:unknown[])=>mocks.error(...args)}}))
function fixture(){
  const cache=new QueryClient({defaultOptions:{queries:{retry:false}}}),invalidate=vi.spyOn(cache,'invalidateQueries')
  const element=()=> <MemoryRouter><QueryClientProvider client={cache}><RoomOperationRecovery/></QueryClientProvider></MemoryRouter>
  const view=render(element()); return {...view,refresh:()=>view.rerender(element()),invalidate}
}
beforeEach(()=>{
  vi.clearAllMocks(); mocks.actor=actor; mocks.tenant=tenant; mocks.runtime='A'; mocks.running=false; mocks.storageFails=false
  mocks.items=[{version:1,actorId:actor,tenantId:tenant,runtime:'A',id:command,rpc:'perform_checkout',request:{booking_id:other,room_id:room},roomIds:[room]}]
})
afterEach(cleanup)
it('shows an identifiable request and links to its module',async()=>{
  fixture(); await screen.findByText('Trả phòng · 101')
  expect(screen.getByRole('link',{name:'Xem danh sách'})).toHaveAttribute('href','/bookings')
  expect(screen.getByRole('button',{name:'Dừng yêu cầu chưa ghi'})).toBeEnabled()
})
it('does not display a recurring prompt without unresolved commands',()=>{
  mocks.items=[]; fixture(); expect(screen.queryByRole('region')).not.toBeInTheDocument()
})
it('recovers the exact key and distinguishes core confirmation from invoice completion',async()=>{
  mocks.recover.mockResolvedValue({}); const view=fixture()
  fireEvent.click(await screen.findByRole('button',{name:'Kiểm tra và tiếp tục'}))
  await waitFor(()=>expect(mocks.success).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({description:expect.stringContaining('Kiểm tra riêng hóa đơn')})))
  expect(mocks.recover).toHaveBeenCalledWith(command,expect.objectContaining({signal:expect.any(AbortSignal),isCurrent:expect.any(Function)}))
  expect(view.invalidate).toHaveBeenCalled()
})
it('does not call a committed transaction cancelled when cancellation returns its receipt',async()=>{
  mocks.cancel.mockResolvedValue({}); fixture()
  fireEvent.click(await screen.findByRole('button',{name:'Dừng yêu cầu chưa ghi'}))
  await waitFor(()=>expect(mocks.success).toHaveBeenCalled()); expect(mocks.info).not.toHaveBeenCalled()
})
it('reports only a server-confirmed terminal cancellation',async()=>{
  mocks.cancel.mockRejectedValue(new RoomCommandError('command_cancelled','Đã dừng an toàn.')); fixture()
  fireEvent.click(await screen.findByRole('button',{name:'Dừng yêu cầu chưa ghi'}))
  await waitFor(()=>expect(mocks.info).toHaveBeenCalledWith('Đã dừng an toàn.')); expect(mocks.success).not.toHaveBeenCalled()
})
it.each(['actor','tenant','runtime'])('hides retained requests outside their %s scope',async mode=>{
  const view=fixture(); await screen.findByText('Trả phòng · 101')
  if(mode==='actor') mocks.actor=other
  if(mode==='tenant') mocks.tenant=other
  if(mode==='runtime') mocks.runtime='B'
  view.refresh(); expect(screen.queryByRole('button',{name:'Kiểm tra và tiếp tục'})).not.toBeInTheDocument()
})
it('suppresses old toasts and cache invalidation after away/back',async()=>{
  let finish!:(value:unknown)=>void
  mocks.recover.mockImplementation(()=>new Promise(resolve=>{finish=resolve})); const view=fixture()
  fireEvent.click(await screen.findByRole('button',{name:'Kiểm tra và tiếp tục'}))
  const options=mocks.recover.mock.calls[0][1]
  mocks.runtime='B'; view.refresh(); mocks.runtime='A'; view.refresh()
  expect(options.signal.aborted).toBe(true); expect(options.isCurrent()).toBe(false)
  await act(async()=>{finish({})}); expect(mocks.success).not.toHaveBeenCalled(); expect(view.invalidate).not.toHaveBeenCalled()
})
it('shows storage failure safely without discarding data or dispatching',async()=>{
  mocks.storageFails=true; fixture(); await screen.findByText('Không đọc được thao tác đang chờ')
  expect(screen.queryByText('private storage')).not.toBeInTheDocument(); expect(mocks.recover).not.toHaveBeenCalled()
})
it('waits for an active submission before offering recovery controls',async()=>{
  mocks.running=true; fixture(); expect(screen.queryByRole('button',{name:'Kiểm tra và tiếp tục'})).not.toBeInTheDocument()
  act(()=>{mocks.running=false;window.dispatchEvent(new Event('owned-operation-event'))})
  expect(await screen.findByRole('button',{name:'Kiểm tra và tiếp tục'})).toBeEnabled()
})
