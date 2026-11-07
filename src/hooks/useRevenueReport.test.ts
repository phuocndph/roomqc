import { describe, it, expect, vi } from 'vitest'
import { computeRevenueData, emptyRevenueData, recognizedRevenue, recognizedRevenueGrowth, type RevenueBookingRow } from './useRevenueReport'
import { reportFixture } from './revenue-report.test-fixture'

// These tests exercise pure calculations, not the network-backed report hook.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }))

function makeBooking(overrides: Partial<RevenueBookingRow> = {}): RevenueBookingRow {
  return {
    check_out_date: '2026-05-01',
    total_amount: 0,
    amount_paid: 0,
    deposit_amount: 0,
    payment_status: 'paid',
    booking_type: 'daily',
    booking_source: 'direct',
    ota_commission_amount: 0,
    net_revenue: null,
    early_checkin_charge: 0,
    late_checkout_charge: 0,
    damage_charges: 0,
    service_charges: 0,
    extra_charges: 0,
    vat_amount: 0,
    room_id: 'r1',
    room: { room_number: '101', room_type: 'Standard' },
    ...overrides,
  }
}

describe('computeRevenueData', () => {
  it('returns zeros for empty input', () => {
    const r = computeRevenueData([])
    expect(r).toEqual(emptyRevenueData())
  })

  it('cộng service_charges + extra_charges vào surcharges (bug P0 #1)', () => {
    const r = computeRevenueData([
      makeBooking({
        total_amount: 1_000_000,
        amount_paid: 1_000_000,
        service_charges: 200_000,
        extra_charges: 50_000,
        early_checkin_charge: 100_000,
      }),
    ])
    expect(r.surcharges.serviceCharges).toBe(200_000)
    expect(r.surcharges.extraCharges).toBe(50_000)
    expect(r.surcharges.earlyCheckin).toBe(100_000)
    expect(r.surcharges.total).toBe(350_000)
  })

  it('paidRevenue gộp amount_paid + deposit_amount, pending là phần còn lại', () => {
    const r = computeRevenueData([
      makeBooking({ total_amount: 1_000_000, amount_paid: 400_000, deposit_amount: 300_000 }),
    ])
    expect(r.paidRevenue).toBe(700_000)
    expect(r.pendingRevenue).toBe(300_000)
    expect(r.totalRevenue).toBe(1_000_000)
  })

  it('không tính booking refunded vào paid/pending; cộng vào refundedRevenue', () => {
    const r = computeRevenueData([
      makeBooking({ total_amount: 500_000, amount_paid: 500_000, payment_status: 'refunded' }),
      makeBooking({ total_amount: 800_000, amount_paid: 800_000, payment_status: 'paid' }),
    ])
    expect(r.refundedRevenue).toBe(500_000)
    expect(r.paidRevenue).toBe(800_000)
    expect(r.pendingRevenue).toBe(0)
    expect(r.netRevenue).toBe(800_000)
  })

  it('netRevenue ưu tiên DB net_revenue khi có; fallback total - commission', () => {
    const r = computeRevenueData([
      // booking 1: có net_revenue → dùng nguyên
      makeBooking({ total_amount: 1_000_000, ota_commission_amount: 150_000, net_revenue: 820_000 }),
      // booking 2: không có net_revenue → fallback 800k - 100k = 700k
      makeBooking({ total_amount: 800_000, ota_commission_amount: 100_000, net_revenue: null }),
    ])
    expect(r.netRevenue).toBe(820_000 + 700_000)
    expect(r.otaCommission).toBe(250_000)
  })

  it('fallback netRevenue khi dữ liệu cũ lưu net_revenue = 0 cho booking có doanh thu', () => {
    const r = computeRevenueData([
      makeBooking({ total_amount: 1_000_000, amount_paid: 1_000_000, net_revenue: 0 }),
    ])
    expect(r.netRevenue).toBe(1_000_000)
  })

  it('vat_amount được tổng hợp để hiển thị, không trừ vào netRevenue (chưa có flag vat_inclusive)', () => {
    const r = computeRevenueData([
      makeBooking({ total_amount: 1_100_000, ota_commission_amount: 0, vat_amount: 100_000, net_revenue: null }),
    ])
    expect(r.vatAmount).toBe(100_000)
    // fallback netRevenue = total - commission, không trừ VAT
    expect(r.netRevenue).toBe(1_100_000)
  })

  it('averageBookingValue = totalRevenue / bookingsCount', () => {
    const r = computeRevenueData([
      makeBooking({ total_amount: 300_000, amount_paid: 300_000 }),
      makeBooking({ total_amount: 500_000, amount_paid: 500_000 }),
    ])
    expect(r.bookingsCount).toBe(2)
    expect(r.averageBookingValue).toBe(400_000)
  })
})

describe('no-show recognition stays separate from room metrics and cash', () => {
  it('adds only retained fees to recognized revenue without modifying room totals', () => {
    const report = reportFixture()
    report.currentPeriod = computeRevenueData([makeBooking({ total_amount: 200000, amount_paid: 200000 })])
    report.noShow.currentPeriod = { retainedAmount: 100000, refundDueAmount: 50000, resolutionsCount: 2, cashMovement: 0 }
    report.noShow.review.unallocatedPrepaymentAmount = 40000
    expect(recognizedRevenue(report, 'currentPeriod')).toBe(300000)
    expect(report.currentPeriod.paidRevenue).toBe(200000)
    expect(report.currentPeriod.bookingsCount).toBe(1)
    expect(report.currentPeriod.averageBookingValue).toBe(200000)
    expect(report.noShow.currentPeriod.cashMovement).toBe(0)
  })
  it('compares recognition periods including fees without treating refund obligations as income', () => {
    const report = reportFixture()
    report.previousPeriod.netRevenue = 200000
    report.noShow.previousPeriod.retainedAmount = 100000
    report.currentPeriod.netRevenue = 300000
    report.noShow.currentPeriod.retainedAmount = 150000
    report.noShow.currentPeriod.refundDueAmount = 900000
    expect(recognizedRevenueGrowth(report)).toBe(50)
  })
  it('removes refunded revenue, VAT, commission and surcharges from earned room totals', () => {
    const r = computeRevenueData([makeBooking({ total_amount: 500000, payment_status: 'refunded',
      net_revenue: 450000, vat_amount: 40000, ota_commission_amount: 50000, service_charges: 10000 })])
    expect(r.netRevenue).toBe(0)
    expect(r.vatAmount).toBe(0)
    expect(r.otaCommission).toBe(0)
    expect(r.surcharges.total).toBe(0)
    expect(r.refundedRevenue).toBe(500000)
  })
})
