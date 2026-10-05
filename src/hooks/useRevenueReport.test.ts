import { describe, it, expect } from 'vitest'
import { computeRevenueData, emptyRevenueData, type RevenueBookingRow } from './useRevenueReport'

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
