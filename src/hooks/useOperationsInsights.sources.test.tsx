import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
const state = vi.hoisted(() => ({ actor: 'actor-a', session: 'session-a', hotel: 'hotel-a',
  operations: null as any, labor: null as any, targets: null as any, options: null as any, invoke: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (o: unknown) => { state.options = o; return {} } }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ tenantId: 'tenant-a', user: { id: state.actor, status: 'active' } }) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: state.actor }, session: {} }) }))
vi.mock('@/lib/staff-invitation', () => ({ staffInvitationSession: () => ({ actorId: state.actor, sessionId: state.session }) }))
vi.mock('@/lib/room-transition-client', () => ({ roomCommandRuntimeScope: () => 'runtime-a' }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: { id: state.hotel, total_rooms: 999 }, availableHotels: [], isAllHotelsMode: false }) }))
vi.mock('@/hooks/useOperationsFinancialReport', () => ({ useOperationsFinancialReport: () => state.operations }))
vi.mock('@/hooks/useLaborCost', () => ({ useLaborCost: () => state.labor }))
vi.mock('@/hooks/useFinancialTargets', () => ({ useFinancialTargets: () => state.targets }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.invoke } } }))
import { buildOperationsInsights, useOperationsInsights } from './useOperationsInsights'
import { operationsFixture, operationsRange } from './operations-report.test-fixture'
const loaded = (data: unknown) => ({ data, error: null, isError: false, isPending: false, isFetching: false })
beforeEach(() => { Object.assign(state, { actor: 'actor-a', session: 'session-a', hotel: 'hotel-a',
  operations: loaded(operationsFixture()), labor: loaded({ total_labor_cost: 20, by_department: { other: 20 } }), targets: loaded({}) }); state.invoke.mockReset() })

describe('insight source integrity', () => {
  it.each(['operations', 'labor', 'targets'] as const)('exposes a %s failure even if its previous source data is cached', source => {
    const error = new Error('SOURCE_DENIED'); state[source] = { ...state[source], error, isError: true }
    const { result } = renderHook(() => useOperationsInsights(operationsRange))
    expect(result.current.error).toBe(error); expect(result.current.data).toBeUndefined(); expect(result.current.isError).toBe(true)
    expect(result.current.isLoading).toBe(false); expect(result.current.isFetching).toBe(false)
  })
  it.each(['operations', 'labor', 'targets'] as const)('waits for %s without inventing zero/empty data', source => {
    state[source] = { ...state[source], data: undefined, isPending: true }
    const { result } = renderHook(() => useOperationsInsights(operationsRange))
    expect(result.current.data).toBeUndefined(); expect(result.current.isLoading).toBe(true)
  })
  it('updates a department breakdown even when its total stays equal', () => {
    const { result, rerender } = renderHook(() => useOperationsInsights(operationsRange))
    expect(result.current.data?.snapshot.laborByDepartment).toEqual({ other: 20 })
    state.labor = loaded({ total_labor_cost: 20, by_department: { housekeeping: 20 } }); rerender()
    expect(result.current.data?.snapshot.laborByDepartment).toEqual({ housekeeping: 20 })
  })
  it('uses one recognized snapshot for profit/YoY and room-only ADR/RevPAR with separate occupancy', () => {
    const { result } = renderHook(() => useOperationsInsights(operationsRange)); const { snapshot: s, derived: k } = result.current.data!
    expect(s).toMatchObject({ totalRooms: 10, netRevenue: 150, roomNetRevenue: 120, noShowFees: 30, grossRevenue: 200,
      totalCost: 70, roomNightsSold: 3, occupiedRoomDays: 2, yoyNetRevenue: 120 })
    expect(k).toMatchObject({ profit: 80, adr: 40, revpar: 6, trevpar: 7.5, occupancy: 10, yoyRevenueGrowth: 25 })
    expect(result.current.data?.daily.reduce((n, d) => n + d.revenue, 0)).toBe(150)
  })
  it('compares occupancy with each period own calendar day count', () => {
    const r = operationsFixture(); r.previous.period_days = 1; r.previous.occupied_room_days = 1; r.year_ago.period_days = 1; r.year_ago.occupied_room_days = 1
    const data = buildOperationsInsights(r, state.labor.data, {}, operationsRange)
    expect(data.derived.occupancyGrowth).toBe(0); expect(data.derived.yoyOccupancyGrowth).toBe(0)
  })
  it('keeps a server YoY failure as an error rather than a successful zero comparison', () => {
    state.operations = { ...state.operations, error: new Error('YOY_UNAVAILABLE') }
    const { result } = renderHook(() => useOperationsInsights(operationsRange))
    expect(result.current.data).toBeUndefined(); expect(result.current.error?.message).toBe('YOY_UNAVAILABLE')
  })
  it('does not apply a monthly target or its load error to a partial-month/non-month period', () => {
    state.targets = { ...state.targets, error: new Error('TARGET_DENIED') }
    const { result } = renderHook(() => useOperationsInsights({ start: new Date(2026, 9, 15), end: new Date(2026, 10, 2) }))
    expect(result.current.error).toBeFalsy(); expect(result.current.data?.snapshot.targets).toEqual({})
    expect(result.current.data?.monthlyTargetsApplicable).toBe(false)
  })
  it('keeps invalid-date revenue but suppresses ADR/CostPOR and flags reconciliation', () => {
    state.operations.data.current.invalid_checkout_dates_count = 1
    const { result } = renderHook(() => useOperationsInsights(operationsRange))
    expect(result.current.data?.invalidCheckoutDates).toBe(1); expect(result.current.data?.snapshot.netRevenue).toBe(150)
    expect(result.current.data?.derived.adrAvailable).toBe(false)
    expect(result.current.data?.ruleFindings.some(f => f.id === 'low-adr' || f.id === 'high-cost-por')).toBe(false)
  })
  // Advice identity/recovery is covered against the manual client in useOperationsAdvice.test.tsx.
})
