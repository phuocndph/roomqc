import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRoom } from './useRooms'

const db = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), sign: vi.fn(), storage: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => options, useMutation: vi.fn(), useQueryClient: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: db.from, rpc: db.rpc, storage: { from: db.storage } } }))
vi.mock('./useUser', () => ({ useUser: () => ({ user: { id: 'owner-a' } }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ availableHotels: [{ id: 'hotel-a' }] }) }))
vi.mock('@/lib/userAccess', () => ({ isAdminUser: () => true }))
vi.mock('@/hooks/useNotificationTriggers', () => ({ triggerRoomCheckoutNotification: vi.fn(), triggerRoomCheckinNotification: vi.fn() }))
vi.mock('@/lib/triggerWorkflow', () => ({ triggerWorkflow: vi.fn(), WorkflowTriggerTypes: {} }))

describe('room detail historical photo readback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.rpc.mockResolvedValue({ data: [], error: null })
    db.storage.mockReturnValue({ createSignedUrl: db.sign })
    db.sign.mockResolvedValue({ data: { signedUrl: 'https://storage.invalid/fresh-token' }, error: null })
    db.from.mockImplementation((table: string) => {
      const chain: Record<string, any> = {}
      for (const method of ['select', 'eq', 'order']) chain[method] = () => chain
      chain.single = async () => ({ data: { id: 'room-a', hotel_id: 'hotel-a', room_number: '101', hotels: { name: 'QA Hotel' } }, error: null })
      chain.limit = async () => ({ data: table === 'room_checks' ? [
        { id: 'check-private', check_type: 'daily', checked_at: '2026-11-04T11:00:00Z', users: { full_name: 'QA Owner' }, photos: ['https://storage.invalid/storage/v1/object/sign/room-check-photos/tenant-a/photo.png?token=expired'] },
        { id: 'check-legacy', photos: ['https://storage.invalid/storage/v1/object/public/item-images/tenant-a/legacy.png'] },
      ] : [], error: null })
      return chain
    })
  })

  it('re-signs an expired private photo in the actual room detail query and retains legacy history', async () => {
    const query = useRoom('room-a') as unknown as { queryFn: () => Promise<any> }
    const result = await query.queryFn()
    expect(result.room.room_number).toBe('101')
    expect(result.recent_checks[0]).toMatchObject({ id: 'check-private', checked_by_name: 'QA Owner', photos: ['https://storage.invalid/fresh-token'] })
    expect(db.storage).toHaveBeenCalledWith('room-check-photos')
    expect(db.sign).toHaveBeenCalledExactlyOnceWith('tenant-a/photo.png', 3600)
    expect(result.recent_checks[1].photos).toEqual(['https://storage.invalid/storage/v1/object/public/item-images/tenant-a/legacy.png'])
  })
})
