import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoomOperationClient, normalizeRoomOperation, type RoomOperationRpc } from './room-operation-command'
import type { RoomCommandContext } from './room-transition-command'
import { emailActor as actor, emailTenant as tenant, emailSession as sid, emailOtherSession as sid2, emailToken } from '@/test/email-auth-fixture'

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const room = uid(1), booking = uid(2), check = uid(3), hotel = uid(4), command = uid(5), target = uid(6)
const context: RoomCommandContext = { actorId: actor, sessionId: sid, tenantId: tenant, runtime: 'owned-runtime-A' }
const checkout = { booking_id: booking, room_id: room, late_checkout_charge: 0, service_charges: 0, subtotal: 200,
  damage_charges: 20, damage_notes: 'Ghi chú thử', damage_items: [{ quantity: 1, charge_amount: 20 }], check_out_date: null }
const cases: Array<[RoomOperationRpc, Record<string, unknown>, string[]]> = [
  ['perform_quick_room_check', { _room_id: room, _check_type: 'daily' }, []],
  ['undo_quick_room_check', { _check_id: check, _reason: 'Kiểm thử' }, [room]],
  ['transfer_booking_room', { p_booking_id: booking, p_new_room_id: target, p_reason: 'Kiểm thử' }, [room]],
  ['perform_checkin', { p_booking_id: booking, p_room_id: room, p_early_checkin_charge: 0 }, []],
  ['perform_checkout', Object.fromEntries(Object.entries(checkout).map(([k,v]) => ['p_'+k,v])), []],
  ['perform_group_checkout', { p_checkouts: [checkout, { ...checkout, booking_id: uid(20), room_id: uid(21) }] }, []],
  ['resolve_booking_no_show', { p_booking_id: booking, p_refund_deposit: false, p_reason: 'Khách không đến' }, [room]],
  ['transition_booking_flag', { p_booking_id: booking, p_to_status: 'sleep_out', p_reason: 'Ngủ ngoài' }, [room]],
]
const operation = (rpc: string) => ({ perform_quick_room_check: 'quick_check', undo_quick_room_check: 'undo_quick_check',
  transfer_booking_room: 'transfer', perform_checkin: 'checkin', perform_checkout: 'checkout', perform_group_checkout: 'group_checkout',
  resolve_booking_no_show: 'no_show', transition_booking_flag: 'booking_flag' })[rpc]
const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status })
function transition(roomId: string, id: string, to: string) {
  return { room_id: roomId, tenant_id: tenant, hotel_id: hotel, command_id: id, from: 'vacant_clean', to,
    changed: true, status_changed: true, workflow_event_id: uid(100), workflow_dispatch_state: 'pending' }
}
function completed(rpc: string, q: Record<string, unknown>, id: string): Record<string, unknown> {
  const core = { command_id: id, operation: operation(rpc), replayed: false }
  if (rpc === 'perform_quick_room_check') return { ...core, room_id: q.room_id, check_id: check,
    old_status: 'vacant_dirty', new_status: 'vacant_clean', summary_ok_count: 3, workflow_event_id: uid(100) }
  if (rpc === 'undo_quick_room_check') return { ...core, room_id: room, check_id: q.check_id, status: 'undone' }
  if (rpc === 'transfer_booking_room') return { ...core, success: true, booking_id: q.booking_id, from_room_id: room, to_room_id: q.new_room_id,
    room_transitions: [transition(room,id,'vacant_dirty'), transition(String(q.new_room_id),uid(101),'occupied_clean')] }
  if (rpc === 'perform_group_checkout') {
    const members = q.checkouts as Record<string, unknown>[]
    return { ...core, success: true, booking_count: members.length, results: members.map((m,i) => completed('perform_checkout',m,uid(200+i))) }
  }
  if (rpc === 'resolve_booking_no_show' || rpc === 'transition_booking_flag') {
    const status = rpc === 'resolve_booking_no_show' ? 'no_show' : q.to_status
    return { ...core, tenant_id: tenant, hotel_id: hotel, room_id: room, booking_id: booking, success: true,
      previous_status: rpc === 'resolve_booking_no_show' ? 'confirmed' : 'checked_in', status,
      booking: { id: booking, tenant_id: tenant, hotel_id: hotel, room_id: room, status, deposit_amount: 100, amount_paid: 0 },
      ...(rpc === 'resolve_booking_no_show' ? { already_resolved: false, room_status_changed: false, workflow_event_id: null,
        deposit_resolution: { id: uid(123), decision: q.refund_deposit ? 'refund_due' : 'retain', deposit_amount: 100, amount_paid: 0,
          retained_amount: q.refund_deposit ? 0 : 100, refund_due_amount: q.refund_deposit ? 100 : 0, cash_movement: 0, recorded_at: '2026-10-27T00:00:00Z' } }
        : { room_transition: { ...transition(room, id, String(status)), from: 'occupied_clean' }, workflow_event_id: uid(100) }) }
  }
  return { ...core, tenant_id: tenant, success: true, booking_id: q.booking_id, room_id: q.room_id,
    ...(q.adjustment_notes !== undefined ? { adjustment_notes_applied: true } : {}),
    room_transition: transition(String(q.room_id),id,rpc === 'perform_checkin' ? 'occupied_clean' : 'vacant_dirty'), workflow_event_id: uid(100),
    ...(rpc === 'perform_checkin' ? { checked_in_at: '2026-10-27T00:00:00Z' }
      : { subtotal: q.subtotal, vat_base: 180, vat_amount: 18, service_fee_amount: 2, total_amount: 200, damage_charges: q.damage_charges, payment_status: 'unpaid' }) }
}
function fixture() {
  const rows = new Map<string,string>(), receipts = new Map<string,Record<string,unknown>>()
  const storage = { get length() { return rows.size }, key: (i: number) => [...rows.keys()][i] ?? null,
    getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string,value: string) => { rows.set(key,value) }, removeItem: (key: string) => { rows.delete(key) } }
  const state = { loss: '', status: 200, cancelFails: false, runtime: true, writes: 0,
    session: { user: { id: actor }, access_token: emailToken(actor,sid) } }
  const http = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const rpc = String(url).split('/').at(-1)!, body = JSON.parse(String(init?.body))
    if (rpc.startsWith('get_')) { const found = receipts.get(body.p_command_id); return reply(200,found ? { ...found, replayed: true } : null) }
    if (rpc.startsWith('cancel_')) {
      if (state.cancelFails) return reply(503,{})
      const q = body.p_request, items = q.checkouts ?? [q]
      const value = receipts.get(body.p_command_id) ?? { command_id: body.p_command_id, operation: body.p_operation,
        tenant_id: tenant, state: 'cancelled', changed: false, replayed: false, workflow_event_id: null,
        ...(rpc === 'cancel_room_check_command' ? { hotel_id: hotel, room_id: q.room_id ?? room, check_id: q.check_id ?? null }
          : { success: false, booking_ids: items.map((v: Record<string,unknown>) => v.booking_id),
            room_ids: body.p_operation === 'transfer' ? [room,q.new_room_id] : items.map((v: Record<string,unknown>) => v.room_id ?? room) }) }
      receipts.set(body.p_command_id,value); return reply(200,value)
    }
    if (state.status !== 200) return reply(state.status,{ message: 'private database error' })
    if (state.loss === 'before') throw new Error('private network data')
    const prefix = rpc.includes('quick_room') ? '_' : 'p_', id = body[prefix+'command_id']
    const q = Object.fromEntries(Object.entries(body).filter(([k]) => k !== prefix+'command_id').map(([k,v]) => [k.slice(prefix.length),v]))
    const previous = receipts.get(id)
    if (!previous) { state.writes++; receipts.set(id,completed(rpc,q,id)) }
    if (state.loss === 'after') throw new Error('private network data')
    return reply(200,{ ...receipts.get(id), replayed: !!previous })
  })
  const deps = { endpoint: 'http://owned.invalid', publishableKey: 'owned-public', storage: () => storage,
    getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })), fetch: http as typeof fetch,
    newId: () => command, isRuntimeCurrent: () => state.runtime }
  return {rows,storage,receipts,state,http,deps}
}
afterEach(() => vi.useRealTimers())
describe('financial no-show and flag request boundaries', () => {
  it.each([null, undefined, 0, 'true', {}])('rejects a non-boolean refund choice (%s) before network', choice => {
    expect(() => normalizeRoomOperation('resolve_booking_no_show', { p_booking_id: booking, p_refund_deposit: choice })).toThrow()
  })
  it.each(['cash', 'decision', 'retained_amount', 'deposit_amount'])('rejects caller-supplied financial fields (%s)', field => {
    expect(() => normalizeRoomOperation('resolve_booking_no_show', { ...cases[6][1], ['p_' + field]: 100 })).toThrow()
  })
  it.each(['decision', 'cash', 'negative', 'sum', 'date', 'booking', 'room'])('retains pending state on a forged financial receipt (%s)', async mismatch => {
    const f = fixture(), base = f.http.getMockImplementation()!
    f.http.mockImplementation(async (url, init) => {
      const response = await base(url, init), body = await response.json()
      if (mismatch === 'decision') body.deposit_resolution.decision = 'refund_due'
      if (mismatch === 'cash') body.deposit_resolution.cash_movement = 100
      if (mismatch === 'negative') body.deposit_resolution.amount_paid = -100
      if (mismatch === 'sum') body.deposit_resolution.retained_amount = 99
      if (mismatch === 'date') body.deposit_resolution.recorded_at = 'bad'
      if (mismatch === 'booking') body.booking.id = uid(88)
      if (mismatch === 'room') body.room_id = uid(88)
      return reply(response.status, body)
    })
    await expect(createRoomOperationClient(f.deps).save(context, cases[6][0], cases[6][1], { roomIds: [room] })).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(f.rows.size).toBe(1)
  })
  it.each([-1, 0.1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid skipper debt (%s)', value => {
    expect(() => normalizeRoomOperation('transition_booking_flag', { p_booking_id: booking, p_to_status: 'skipper', p_amount_owed: value })).toThrow()
  })
})
const adjustmentCases = cases.filter(([rpc]) => ['perform_checkin', 'perform_checkout', 'perform_group_checkout'].includes(rpc))
function withAdjustment(rpc: RoomOperationRpc, args: Record<string, unknown>, text: unknown) {
  return rpc === 'perform_group_checkout'
    ? { p_checkouts: (args.p_checkouts as Record<string, unknown>[]).map(item => ({ ...item, adjustment_notes: text })) }
    : { ...args, p_adjustment_notes: text }
}
describe('command-bound booking adjustment notes', () => {
  const text = '[Điều chỉnh thử]\nGiữ nguyên lý do và số tiền đã chốt'
  it.each(adjustmentCases)('%s preserves exact text and keeps omitted legacy payloads stable', (rpc, args) => {
    const value = normalizeRoomOperation(rpc, withAdjustment(rpc, args, text))
    const items = rpc === 'perform_group_checkout' ? value.checkouts as Record<string, unknown>[] : [value]
    expect(items.every(item => item.adjustment_notes === text)).toBe(true)
    expect(normalizeRoomOperation(rpc, withAdjustment(rpc, args, null))).toEqual(normalizeRoomOperation(rpc, args))
  })
  it.each(adjustmentCases)('%s rejects invalid adjustment text before any request', (rpc, args) => {
    for (const bad of [' ', 'x'.repeat(10001), 42, {}, []]) {
      expect(() => normalizeRoomOperation(rpc, withAdjustment(rpc, args, bad))).toThrow()
    }
  })
  it.each(adjustmentCases)('%s recovers the exact note-bearing receipt after response loss', async (rpc, args) => {
    const f = fixture(); f.state.loss = 'after'
    const client = createRoomOperationClient(f.deps)
    await expect(client.save(context, rpc, withAdjustment(rpc, args, text))).rejects.toMatchObject({ code: 'outcome_unknown' })
    const pending = client.pending(context)[0]
    const items = rpc === 'perform_group_checkout' ? pending.request.checkouts as Record<string, unknown>[] : [pending.request]
    expect(items.every(item => item.adjustment_notes === text)).toBe(true)
    f.state.loss = ''
    await expect(createRoomOperationClient(f.deps).recover(context, command)).resolves.toMatchObject({ replayed: true })
    expect(f.state.writes).toBe(1); expect(f.rows.size).toBe(0); expect(f.http).toHaveBeenCalledTimes(2)
  })
  it.each(adjustmentCases)('%s keeps pending if the server does not confirm applying notes', async (rpc, args) => {
    const f = fixture(), original = f.http.getMockImplementation()!
    f.http.mockImplementation(async (url, init) => {
      const response = await original(url, init), body = await response.json()
      if (body.results) for (const member of body.results) delete member.adjustment_notes_applied
      delete body.adjustment_notes_applied
      return reply(response.status, body)
    })
    await expect(createRoomOperationClient(f.deps).save(context, rpc, withAdjustment(rpc, args, text)))
      .rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(f.rows.size).toBe(1); expect(f.state.writes).toBe(1)
  })
})
describe('room operation callers and durable receipt correlation', () => {
  it.each(cases)('%s persists intent before network without storing credentials', async (rpc,args,roomIds) => {
    const f=fixture(), original=f.http.getMockImplementation()!
    f.http.mockImplementation(async (url,init) => {
      expect(f.rows.size).toBe(1); expect([...f.rows.values()].join()).not.toContain(emailToken())
      expect(init).toMatchObject({ cache:'no-store', credentials:'omit', redirect:'error' })
      return original(url,init)
    })
    await expect(createRoomOperationClient(f.deps).save(context,rpc,args,{roomIds})).resolves.toMatchObject({ command_id:command, operation:operation(rpc) })
    expect(f.state.writes).toBe(1); expect(f.rows.size).toBe(0)
  })
  it.each(cases)('%s reads committed outcome after lost response and a fresh session', async (rpc,args,roomIds) => {
    const f=fixture(); f.state.loss='after'
    await expect(createRoomOperationClient(f.deps).save(context,rpc,args,{roomIds})).rejects.toMatchObject({code:'outcome_unknown'})
    f.state.loss=''; f.state.session.access_token=emailToken(actor,sid2)
    const client=createRoomOperationClient(f.deps)
    await expect(client.recover({...context,sessionId:sid2},command)).resolves.toMatchObject({replayed:true})
    expect(f.http).toHaveBeenCalledTimes(2); expect(f.state.writes).toBe(1); expect(f.rows.size).toBe(0)
  })
  it.each(cases)('%s resends exactly the saved body after lookup returns null', async (rpc,args,roomIds) => {
    const f=fixture(); f.state.loss='before'; const client=createRoomOperationClient(f.deps)
    await expect(client.save(context,rpc,args,{roomIds})).rejects.toThrow(); const first=f.http.mock.calls[0][1]?.body
    f.state.loss=''; await client.recover(context,command)
    expect(f.http.mock.calls[2][1]?.body).toEqual(first); expect(f.state.writes).toBe(1)
  })
  it.each(cases)('%s cancels an uncommitted intent before permitting a new one', async (rpc,args,roomIds) => {
    const f=fixture(); f.state.loss='before'; const client=createRoomOperationClient(f.deps)
    await expect(client.save(context,rpc,args,{roomIds})).rejects.toThrow()
    await expect(client.cancel(context,command)).rejects.toMatchObject({code:'command_cancelled'})
    expect(f.receipts.get(command)?.state).toBe('cancelled'); expect(f.state.writes).toBe(0); expect(f.rows.size).toBe(0)
  })
  it.each(cases)('%s cancellation reports an already committed core as success', async (rpc,args,roomIds) => {
    const f=fixture(); f.state.loss='after'; const client=createRoomOperationClient(f.deps)
    await expect(client.save(context,rpc,args,{roomIds})).rejects.toThrow()
    await expect(client.cancel(context,command)).resolves.toMatchObject({command_id:command})
    expect(f.state.writes).toBe(1); expect(f.rows.size).toBe(0)
  })
  it('recovers the same intent but blocks overlapping booking or source-room changes', async () => {
    const f=fixture(), client=createRoomOperationClient(f.deps); f.state.loss='after'
    await expect(client.save(context,'transfer_booking_room',cases[2][1],{roomIds:[room]})).rejects.toThrow()
    await expect(client.save(context,'perform_checkout',cases[4][1])).rejects.toMatchObject({code:'pending_command'})
    await expect(client.save(context,'perform_quick_room_check',cases[0][1])).rejects.toMatchObject({code:'pending_command'})
    await client.save(context,'transfer_booking_room',cases[2][1],{roomIds:[room]})
    expect(f.state.writes).toBe(1); expect(f.rows.size).toBe(0)
  })
  it('isolates retained commands by actor, tenant and runtime', async () => {
    const f=fixture(), client=createRoomOperationClient(f.deps); f.state.loss='after'
    await expect(client.save(context,...cases[3].slice(0,2) as [RoomOperationRpc,Record<string,unknown>])).rejects.toThrow()
    for (const c of [{...context,actorId:uid(30)},{...context,tenantId:uid(30)},{...context,runtime:'B'}]) expect(client.pending(c)).toEqual([])
    expect(client.pending(context)).toHaveLength(1)
  })
  it.each([401,403,409,429,503])('keeps intent for HTTP %i without exposing raw errors', async status => {
    const f=fixture(); f.state.status=status
    await expect(createRoomOperationClient(f.deps).save(context,cases[3][0],cases[3][1])).rejects.not.toThrow(/private/)
    expect(f.rows.size).toBe(1); expect(f.http).toHaveBeenCalledTimes(1)
  })
  it.each([false,true])('HTTP400 only clears intent after a confirmed fence (cancel failure %s)', async cancelFails => {
    const f=fixture(); f.state.status=400; f.state.cancelFails=cancelFails
    await expect(createRoomOperationClient(f.deps).save(context,cases[3][0],cases[3][1])).rejects.toMatchObject({code:cancelFails?'outcome_unknown':'command_cancelled'})
    expect(f.rows.size).toBe(cancelFails?1:0)
  })
  it.each(['key','operation','tenant','transition','group-member','group-missing','financial','notification-id','notification-state','notification-partial','group-event-duplicate'])('retains mismatched result (%s)', async mismatch => {
    const f=fixture(), rpc=mismatch.startsWith('group')?'perform_group_checkout':'perform_checkout', args=rpc==='perform_group_checkout'?cases[5][1]:cases[4][1]
    const original=f.http.getMockImplementation()!
    f.http.mockImplementation(async (url,init) => {
      const response=await original(url,init), value=await response.json()
      if (mismatch==='key') value.command_id=uid(80)
      if (mismatch==='operation') value.operation='checkin'
      if (mismatch==='tenant') value.tenant_id=uid(80)
      if (mismatch==='transition') value.room_transition.room_id=target
      if (mismatch==='group-member') value.results[0].booking_id=uid(80)
      if (mismatch==='group-missing') value.results.pop()
      if (mismatch==='financial') value.subtotal=-1
      if (mismatch==='notification-id') { value.notification_event_id='invalid'; value.notification_state='queued' }
      if (mismatch==='notification-state') { value.notification_event_id=uid(81); value.notification_state='delivered' }
      if (mismatch==='notification-partial') value.notification_state='queued'
      if (mismatch==='group-event-duplicate') for (const member of value.results) { member.notification_event_id=uid(81); member.notification_state='queued' }
      return reply(200,value)
    })
    await expect(createRoomOperationClient(f.deps).save(context,rpc,args)).rejects.toMatchObject({code:'outcome_unknown'})
    expect(f.rows.size).toBe(1)
  })
  it('does not send when storage cannot retain or validate the intent', async () => {
    const f=fixture(); f.storage.setItem=()=>{throw new Error('private storage error')}
    await expect(createRoomOperationClient(f.deps).save(context,cases[3][0],cases[3][1])).rejects.toMatchObject({code:'storage_unavailable'})
    expect(f.http).not.toHaveBeenCalled()
  })
  it('blocks corrupt scoped storage without deleting an unresolved command', async () => {
    const f=fixture(); f.state.loss='before'; const client=createRoomOperationClient(f.deps)
    await expect(client.save(context,cases[3][0],cases[3][1])).rejects.toThrow()
    const key=[...f.rows.keys()][0]; f.rows.set(key,'{broken')
    expect(()=>client.pending(context)).toThrow(/Không đọc/)
    await expect(client.save(context,cases[0][0],cases[0][1])).rejects.toMatchObject({code:'storage_unavailable'})
    expect(f.http).toHaveBeenCalledTimes(1); expect(f.rows.get(key)).toBe('{broken')
  })
  it('checks the other command family before storing or sending', async () => {
    const f=fixture(), guard=vi.fn(()=>{throw new Error('existing room transition')})
    await expect(createRoomOperationClient({...f.deps,assertOtherPending:guard}).save(context,cases[3][0],cases[3][1])).rejects.toThrow()
    expect(guard).toHaveBeenCalledWith(context,[room]); expect(f.rows.size).toBe(0); expect(f.http).not.toHaveBeenCalled()
  })
  it.each(['session','network'])('bounds a hanging %s while retaining pending', async mode => {
    vi.useFakeTimers(); const f=fixture()
    if (mode==='session') f.deps.getSession.mockImplementation(()=>new Promise(()=>{}))
    else f.http.mockImplementation(()=>new Promise(()=>{}))
    const settled=expect(createRoomOperationClient(f.deps).save(context,cases[3][0],cases[3][1])).rejects.toMatchObject({code:'outcome_unknown'})
    await vi.advanceTimersByTimeAsync(20001); await settled; expect(f.rows.size).toBe(1)
  })
  it('rejects a changed session after transport, preserving its receipt reference', async () => {
    const f=fixture(), original=f.http.getMockImplementation()!
    f.http.mockImplementation(async (url,init)=>{const value=await original(url,init); f.state.session.access_token=emailToken(actor,sid2); return value})
    await expect(createRoomOperationClient(f.deps).save(context,cases[3][0],cases[3][1])).rejects.toMatchObject({code:'identity_changed'})
    expect(f.rows.size).toBe(1)
  })
  it('rejects quick-check types the server does not support and checkout string arrays', () => {
    for(const checkType of ['checkin','checkout']) expect(()=>normalizeRoomOperation('perform_quick_room_check',{_room_id:room,_check_type:checkType})).toThrow(/kiểm chuẩn/)
    expect(()=>normalizeRoomOperation('perform_checkout',{...cases[4][1],p_damage_items:'[]'})).toThrow()
    expect(()=>normalizeRoomOperation('perform_checkin',{...cases[3][1],p_command_id:command})).toThrow()
    expect(normalizeRoomOperation('perform_checkout',{...cases[4][1],p_new_amount_paid:null}).damage_items).toEqual(checkout.damage_items)
  })
})
