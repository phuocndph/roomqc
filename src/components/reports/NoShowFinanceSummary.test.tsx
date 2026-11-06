import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ canExport: false, download: vi.fn(), rpc: vi.fn(), error: vi.fn(), success: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('@/hooks/useReportScope', () => ({ useReportScope: () => ({ enabled: true, hotelId: 'hotel-a', capture: () => () => {} }) }))
vi.mock('@/hooks/usePermission', () => ({ useHasPermission: () => ({ hasPermission: mocks.canExport }) }))
vi.mock('@/lib/excelUtils', () => ({ downloadWorkbook: mocks.download }))
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: mocks.success } }))
import { reportFixture } from '@/hooks/revenue-report.test-fixture'
import { NoShowFinanceSummary } from './NoShowFinanceSummary'
import { useRevenueExport } from './useRevenueExport'
afterEach(() => { cleanup(); mocks.download.mockClear(); mocks.error.mockClear(); mocks.canExport = false })
describe('no-show finance presentation and export', () => {
  it('shows fees, refund obligations and unresolved history as distinct items', () => {
    const report = reportFixture(); report.noShow.currentPeriod.retainedAmount = 100000
    report.noShow.currentPeriod.refundDueAmount = 50000; report.noShow.review.unclassifiedBookings = 2
    render(<NoShowFinanceSummary report={report} />)
    expect(screen.getByText('Phí giữ cọc trong kỳ')).toBeTruthy()
    expect(screen.getByText('Cọc cần hoàn ghi nhận trong kỳ')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('2 booking')
    expect(screen.getByText(/Khoản cần hoàn chưa phải tiền đã hoàn/)).toBeTruthy()
    expect(screen.getByText(/phân loại cọc không tạo khoản thu mới/)).toBeTruthy()
  })
  it('requires export permission separately from access to the loaded report', async () => {
    const { result } = renderHook(() => useRevenueExport())
    await result.current.exportExcel(reportFixture(), 'month')
    await result.current.exportPDF(reportFixture(), 'month')
    expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.error).toHaveBeenCalledTimes(2)
  })
  it('exports recognition, refund-due and monthly fees without adding them to cash', async () => {
    mocks.canExport = true; mocks.download.mockResolvedValue(undefined)
    const report = reportFixture(); report.currentPeriod.paidRevenue = 200000; report.currentPeriod.netRevenue = 200000
    report.noShow.currentPeriod.retainedAmount = 100000; report.noShow.currentPeriod.refundDueAmount = 50000
    report.noShow.monthlyTrends = [{ month: '10/2026', retainedAmount: 100000, refundDueAmount: 50000 }]
    mocks.rpc.mockResolvedValue({ data: report, error: null })
    const { result } = renderHook(() => useRevenueExport()); await act(async () => { await result.current.exportExcel(reportFixture(), 'custom') })
    const sheets = mocks.download.mock.calls[0][0]
    expect(sheets[0].rows).toContainEqual(['Doanh thu ghi nhận gồm phí no-show', '300.000'])
    expect(sheets[0].rows).toContainEqual(['Kỳ báo cáo', 'Tùy chọn'])
    expect(mocks.rpc).toHaveBeenCalledWith('export_revenue_report', expect.objectContaining({ p_hotel_id: 'hotel-a' }))
    expect(sheets[0].rows).toContainEqual(['Cọc cần hoàn ghi nhận trong kỳ (chưa phải đã hoàn)', '50.000'])
    expect(sheets.find((s: any) => s.name === 'No-show theo tháng').rows[1]).toEqual(['10/2026', 100000, 50000])
    expect(report.currentPeriod.paidRevenue).toBe(200000)
  })
})
