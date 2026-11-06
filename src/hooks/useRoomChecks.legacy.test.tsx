import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'

// W1 photo-caller run (2026-11-06), legacy wizard (RoomCheckPage):
// - the created room_checks row had tenant_id/hotel_id NULL, so tenant/hotel
//   filtered dashboards and reports missed it;
// - after every submit the client deleted all older checks' Storage photos for
//   the room (any author) while RLS left those rows pointing at deleted files.

const state = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; row: unknown }>,
  updates: [] as Array<{ table: string; row: unknown }>,
  storageRemove: vi.fn(),
  mutationFn: null as null | ((vars: unknown) => Promise<unknown>),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined }),
  useMutation: (options: { mutationFn: (vars: unknown) => Promise<unknown> }) => { state.mutationFn = options.mutationFn; return { mutate: vi.fn(), mutateAsync: options.mutationFn } },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const result = () => {
      if (table === 'rooms') return { data: { hotel_id: 'hotel-a', tenant_id: 'tenant-a', room_number: '101' }, error: null }
      if (table === 'room_checks') return { data: { id: 'check-new', room_id: 'room-1', check_type: 'daily' }, error: null }
      return { data: [], error: null }
    }
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'neq', 'is', 'gte', 'lte', 'or']) b[m] = () => b
    b.insert = (row: unknown) => { state.inserts.push({ table, row }); return b }
    b.update = (row: unknown) => { state.updates.push({ table, row }); return b }
    b.upsert = (row: unknown) => { state.inserts.push({ table, row }); return b }
    b.delete = () => b
    b.single = async () => result()
    b.maybeSingle = async () => result()
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'old-check', photos: ['room-check-photos/tenant-a/old.png'] }], error: null }).then(resolve)
    return b
  }
  return {
    supabase: {
      from,
      rpc: async () => ({ data: null, error: null }),
      functions: { invoke: async () => ({ data: null, error: null }) },
      storage: { from: () => ({ remove: state.storageRemove, createSignedUrl: async () => ({ data: { signedUrl: 'x' }, error: null }) }) },
    },
  }
})
vi.mock('./useUser', () => ({ useUser: () => ({ user: { id: 'manager-1' }, tenantId: 'tenant-a' }) }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock('./useImageUpload', () => ({ useImageUpload: () => ({ deleteImage: vi.fn() }) }))
vi.mock('@/lib/triggerWorkflow', () => ({ triggerWorkflow: vi.fn(), WorkflowTriggerTypes: {} }))
vi.mock('@/utils/notificationRecipients', () => ({ getNotificationRecipients: async () => [] }))

import { useCreateRoomCheck } from './useRoomChecks'

beforeEach(() => { state.inserts.length = 0; state.updates.length = 0; state.storageRemove.mockReset() })
afterEach(cleanup)

describe('legacy useCreateRoomCheck', () => {
  it('writes tenant and hotel scope and leaves older checks’ photos alone', async () => {
    renderHook(() => useCreateRoomCheck())
    await state.mutationFn!({
      roomId: 'room-1',
      data: { check_type: 'daily', cleanliness_score: 5, items_complete: true, items_missing: [], items_damaged: [], notes: '', photos: ['room-check-photos/tenant-a/new.png'] },
    }).catch(() => undefined) // later best-effort side effects are irrelevant here
    await new Promise(r => setTimeout(r, 20))

    const check = state.inserts.find(i => i.table === 'room_checks')?.row as Record<string, unknown>
    expect(check).toEqual(expect.objectContaining({ room_id: 'room-1', tenant_id: 'tenant-a', hotel_id: 'hotel-a' }))
    expect(state.storageRemove).not.toHaveBeenCalled()
    expect(state.updates.filter(u => u.table === 'room_checks' && (u.row as { photos?: unknown[] }).photos?.length === 0)).toEqual([])
  })
})
