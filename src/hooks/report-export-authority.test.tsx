import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { flushSync } from 'react-dom'
const state = vi.hoisted(() => ({ actor: 'actor-a', session: 'session-a', tenant: 'tenant-a', status: 'active',
  hotel: 'hotel-a', all: false, runtime: 'runtime-a', permission: true, rpc: vi.fn(), download: vi.fn(),
  savedExcel: vi.fn(), savedPDF: vi.fn(), toast: vi.fn(), pdfText: vi.fn(),
  beforeBuild: undefined as (() => void) | undefined }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ tenantId: state.tenant, user: { id: state.actor,
  status: state.status, account_locked: false, updated_at: 'version-a' } }) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: state.actor }, session: {} }) }))
vi.mock('@/lib/staff-invitation', () => ({ staffInvitationSession: () => ({ actorId: state.actor, sessionId: state.session }) }))
vi.mock('@/lib/room-transition-client', () => ({ roomCommandRuntimeScope: () => state.runtime }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: { id: state.hotel }, isAllHotelsMode: state.all }) }))
vi.mock('@/hooks/usePermission', () => ({ useHasPermission: () => ({ hasPermission: state.permission }) }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }))
vi.mock('sonner', () => ({ toast: { success: state.toast, error: state.toast } }))
vi.mock('@/lib/excelUtils', () => ({ downloadWorkbook: state.download, objectRecordsToRows: () => [] }))
vi.mock('jspdf', () => ({ default: class {
  internal = { pageSize: { getWidth: () => 297, getHeight: () => 210 }, pages: [null, {}] }
  lastAutoTable = { finalY: 80 }
  text = state.pdfText
  save = state.savedPDF
  setFontSize() {} setFont() {} setLineWidth() {} line() {} setPage() {} addPage() {}
  splitTextToSize(text: string) { return [text] }
} }))
vi.mock('jspdf-autotable', () => ({ default: vi.fn() }))
vi.mock('html2canvas', () => ({ default: vi.fn() }))
import { useFinancialReportExport } from './useFinancialReportExport'
import { useRevenueExport } from '@/components/reports/useRevenueExport'
import { useReportExport } from './useReportExport'
import { financialFixture } from './financial-report.test-fixture'
import { reportFixture } from './revenue-report.test-fixture'

const range = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) }
const finance = () => ({ ...financialFixture(), recognition_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
beforeEach(() => {
  Object.assign(state, { actor: 'actor-a', session: 'session-a', tenant: 'tenant-a', status: 'active',
    hotel: 'hotel-a', all: false, runtime: 'runtime-a', permission: true, beforeBuild: undefined })
  for (const mock of [state.rpc, state.download, state.savedExcel, state.savedPDF, state.toast, state.pdfText]) mock.mockReset()
  state.rpc.mockResolvedValue({ data: finance(), error: null })
  state.download.mockImplementation(async (sheets, name, beforeSave) => {
    state.beforeBuild?.(); await beforeSave?.(); state.savedExcel(sheets, name)
  })
})

describe('financial export authority', () => {
  it.each(['exportExcel', 'exportPDF'] as const)('gets a fresh server DTO and revalidates before %s', async method => {
    const { result } = renderHook(() => useFinancialReportExport(range))
    let outcome: boolean | undefined
    await act(async () => { outcome = await result.current[method]() })
    expect(outcome).toBe(true); expect(state.rpc).toHaveBeenCalledTimes(2)
    expect(state.rpc).toHaveBeenCalledWith('get_financial_report_scoped', expect.objectContaining({ p_for_export: true,
      p_start_date: '2026-10-01', p_end_date: '2026-10-31', p_hotel_id: 'hotel-a' }))
    if (method === 'exportExcel') {
      const sheets = state.savedExcel.mock.calls[0][0]
      expect(sheets[0].rows.some((row: unknown[]) => row[0] === 'Doanh thu ghi nhận')).toBe(true)
      expect(sheets[1].rows[1]).toEqual(expect.arrayContaining([900000, 780000, 80000]))
    } else { expect(state.savedPDF).toHaveBeenCalledOnce(); expect(state.pdfText).toHaveBeenCalledWith('RoomQC', expect.anything(), expect.anything(), expect.anything()) }
  })
  it.each(['exportExcel', 'exportPDF'] as const)('does not save %s after server export permission is revoked during generation', async method => {
    state.rpc.mockResolvedValueOnce({ data: finance(), error: null }).mockResolvedValue({ data: null, error: new Error('REVOKED') })
    const { result } = renderHook(() => useFinancialReportExport(range))
    await act(async () => { expect(await result.current[method]()).toBe(false) })
    expect(state.savedExcel).not.toHaveBeenCalled(); expect(state.savedPDF).not.toHaveBeenCalled()
    expect(result.current.isExporting).toBe(false)
  })
  it('cannot export when the server denies the initial request despite a cached capability', async () => {
    state.rpc.mockResolvedValue({ data: null, error: new Error('DENIED') })
    const { result } = renderHook(() => useFinancialReportExport(range))
    await act(async () => { expect(await result.current.exportExcel()).toBe(false) })
    expect(state.download).not.toHaveBeenCalled(); expect(state.savedExcel).not.toHaveBeenCalled()
  })
  it.each(['session', 'hotel', 'runtime'] as const)('discards a download when %s changes while the workbook is built', async field => {
    const { result, rerender } = renderHook(() => useFinancialReportExport(range))
    state.beforeBuild = () => { const old = state[field]
      flushSync(() => { state[field] = 'other'; rerender() })
      flushSync(() => { state[field] = old; rerender() }) }
    await act(async () => { expect(await result.current.exportExcel()).toBe(false) })
    expect(state.rpc).toHaveBeenCalledTimes(1); expect(state.savedExcel).not.toHaveBeenCalled()
  })
  it('discards a download after the date selection changes', async () => {
    let dates = range
    const { result, rerender } = renderHook(() => useFinancialReportExport(dates))
    state.beforeBuild = () => { flushSync(() => { dates = { ...range, start: new Date(2026, 8, 1) }; rerender() }) }
    await act(async () => { expect(await result.current.exportExcel()).toBe(false) })
    expect(state.savedExcel).not.toHaveBeenCalled()
  })
  it('discards a response that arrives after unmount', async () => {
    let finish!: (value: unknown) => void
    state.rpc.mockReturnValue(new Promise(r => { finish = r }))
    const { result, unmount } = renderHook(() => useFinancialReportExport(range))
    let pending!: Promise<boolean>
    act(() => { pending = result.current.exportExcel() }); unmount()
    await act(async () => { finish({ data: finance(), error: null }); expect(await pending).toBe(false) })
    expect(state.savedExcel).not.toHaveBeenCalled()
  })
  it('ignores a duplicate click while the original request is pending', async () => {
    let finish!: (value: unknown) => void
    state.rpc.mockReturnValueOnce(new Promise(r => { finish = r }))
    const { result } = renderHook(() => useFinancialReportExport(range))
    let pending!: Promise<boolean>
    act(() => { pending = result.current.exportExcel() })
    await act(async () => { expect(await result.current.exportPDF()).toBe(false) })
    expect(state.rpc).toHaveBeenCalledTimes(1)
    await act(async () => { finish({ data: finance(), error: null }); expect(await pending).toBe(true) })
    expect(state.savedExcel).toHaveBeenCalledOnce(); expect(state.savedPDF).not.toHaveBeenCalled()
  })
  it('preserves existing generic report payloads and returns their actual completion result', async () => {
    const { result } = renderHook(() => useReportExport())
    await act(async () => { expect(await result.current.exportToExcel({ title: 'Kho', dateRange: 'Tháng 10' }, 'inventory')).toBe(true) })
    expect(state.savedExcel).toHaveBeenCalledOnce(); expect(state.rpc).not.toHaveBeenCalled()
  })
})

describe('revenue export authority', () => {
  it('exports newly authorized values rather than the loaded payload and labels custom dates correctly', async () => {
    const fresh = reportFixture(); fresh.currentPeriod.netRevenue = 200000; fresh.noShow.currentPeriod.retainedAmount = 100000
    fresh.previousPeriod.netRevenue = 100000
    state.rpc.mockResolvedValue({ data: fresh, error: null })
    const { result } = renderHook(() => useRevenueExport())
    await act(async () => { expect(await result.current.exportExcel(reportFixture(), 'custom')).toBe(true) })
    const overview = state.savedExcel.mock.calls[0][0][0].rows
    expect(overview).toContainEqual(['Doanh thu ghi nhận gồm phí no-show', '300.000'])
    expect(overview).toContainEqual(['Tăng trưởng doanh thu ghi nhận', '200.0%'])
    expect(overview).toContainEqual(['Kỳ báo cáo', 'Tùy chọn'])
    expect(state.rpc).toHaveBeenCalledTimes(2)
  })
  it.each(['exportExcel', 'exportPDF'] as const)('does not save %s if live permission is revoked', async method => {
    state.rpc.mockResolvedValueOnce({ data: reportFixture(), error: null }).mockResolvedValue({ data: null, error: new Error('REVOKED') })
    const { result } = renderHook(() => useRevenueExport())
    await act(async () => { expect(await result.current[method](reportFixture(), 'month')).toBe(false) })
    expect(state.savedExcel).not.toHaveBeenCalled(); expect(state.savedPDF).not.toHaveBeenCalled()
  })
  it('rejects a stale export when the selected period changes', async () => {
    state.rpc.mockResolvedValue({ data: reportFixture(), error: null })
    let selection = 'month'; const { result, rerender } = renderHook(() => useRevenueExport(selection))
    state.beforeBuild = () => { flushSync(() => { selection = 'year'; rerender() }) }
    await act(async () => { expect(await result.current.exportExcel(reportFixture(), 'month')).toBe(false) })
    expect(state.savedExcel).not.toHaveBeenCalled()
  })
  it('blocks export when only view access is cached', async () => {
    state.permission = false
    const { result } = renderHook(() => useRevenueExport())
    await act(async () => { expect(await result.current.exportExcel(reportFixture(), 'month')).toBe(false) })
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.savedExcel).not.toHaveBeenCalled()
  })
})
