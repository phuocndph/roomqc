import { afterEach, expect, it, vi } from 'vitest'
import { runBookingOperationFollowUps, bookingOperationDescription } from './booking-operation-followups'
const result = { command_id:'owned-command', operation:'checkout', replayed:false }
afterEach(()=>vi.useRealTimers())
it('never repeats separate effects while recovering a committed core',async()=>{
  const task=vi.fn(); const state=await runBookingOperationFollowUps({...result,replayed:true},()=>true,[task])
  expect(task).not.toHaveBeenCalled(); expect(state.needsReview).toBe(true); expect(bookingOperationDescription(state,true)).toContain('giao dịch trước đó')
})
it('keeps core success distinct from rejected notes and failed side effects',async()=>{
  const third=vi.fn(async()=>undefined)
  const state=await runBookingOperationFollowUps(result,()=>true,[async()=>({error:new Error('private SQL')}),async()=>{throw new Error('private provider')},third])
  expect(third).toHaveBeenCalledOnce(); expect(state.needsReview).toBe(true)
  expect(bookingOperationDescription(state,true)).toContain('Giao dịch đã lưu'); expect(bookingOperationDescription(state,true)).not.toContain('private')
})
it('stops starting work after scope changes during an earlier task',async()=>{
  let current=true; const next=vi.fn()
  await runBookingOperationFollowUps(result,()=>current,[async()=>{current=false},next])
  expect(next).not.toHaveBeenCalled()
})
it('bounds the entire batch when a separate operation hangs',async()=>{
  vi.useFakeTimers(); const next=vi.fn()
  const promise=runBookingOperationFollowUps(result,()=>true,[()=>new Promise(()=>{}),next])
  await vi.advanceTimersByTimeAsync(10001)
  expect((await promise).needsReview).toBe(true); expect(next).not.toHaveBeenCalled()
})
it('does not treat an invoice helper returning void as proof of invoice availability',async()=>{
  const state=await runBookingOperationFollowUps(result,()=>true,[async()=>undefined])
  expect(bookingOperationDescription(state,true)).toContain('kiểm tra trước khi in')
})
it.each([false,true])('a durable queue receipt suppresses browser sends, replay=%s',async replayed=>{
  const task=vi.fn(),receipt={...result,replayed,notification_event_id:'00000000-0000-4000-8000-000000000001',notification_state:'queued'}
  const state=await runBookingOperationFollowUps(receipt,()=>true,[task])
  expect(task).not.toHaveBeenCalled();expect(state.notificationQueued).toBe(true)
  expect(bookingOperationDescription(state,true)).toContain('chưa xác nhận gửi thành công')
})
it('only treats a group as queued when every child has a durable source',async()=>{
  const child={notification_event_id:'00000000-0000-4000-8000-000000000001',notification_state:'queued'}
  const full=await runBookingOperationFollowUps({...result,operation:'group_checkout',results:[child,{...child,notification_event_id:'00000000-0000-4000-8000-000000000002'}]},()=>true,[])
  const partial=await runBookingOperationFollowUps({...result,operation:'group_checkout',results:[child,{}]},()=>true,[])
  expect(full.notificationQueued).toBe(true);expect(partial.notificationQueued).not.toBe(true)
})
