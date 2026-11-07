import { describe, expect, it } from 'vitest'
import { isRenewalOrder, renewalPaymentAccepted } from '../../supabase/functions/_shared/subscription-renewal'

const order = { type: 'subscription_quote', checkout_enabled: true }
const base = { metadata: order, expectedAmount: 150000, transferAmount: 150000, toPlatformAccount: true }

describe('SePay rule for RoomQC renewal orders', () => {
  it('recognizes only server renewal orders', () => {
    expect(isRenewalOrder(order)).toBe(true)
    expect(isRenewalOrder({ type: 'extend' })).toBe(false)
    expect(isRenewalOrder(null)).toBe(false)
    expect(isRenewalOrder([])).toBe(false)
  })
  it('accepts the exact amount or more into a platform account', () => {
    expect(renewalPaymentAccepted(base)).toBe(true)
    expect(renewalPaymentAccepted({ ...base, transferAmount: 150500 })).toBe(true)
  })
  it('never accepts an underpayment, even within a tenant tolerance', () => {
    expect(renewalPaymentAccepted({ ...base, transferAmount: 149999 })).toBe(false)
    expect(renewalPaymentAccepted({ ...base, transferAmount: 149000 })).toBe(false)
  })
  it('never settles a renewal paid into a tenant or hotel account', () => {
    expect(renewalPaymentAccepted({ ...base, toPlatformAccount: false })).toBe(false)
  })
  it.each([NaN, 0, -1])('rejects an invalid expected amount %s', expectedAmount => {
    expect(renewalPaymentAccepted({ ...base, expectedAmount })).toBe(false)
  })
  it('does not apply to other payment types', () => {
    expect(renewalPaymentAccepted({ ...base, metadata: { type: 'extend' } })).toBe(false)
  })
})
