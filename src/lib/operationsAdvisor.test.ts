import { describe, it, expect } from 'vitest'
import {
  computeDerivedKpis,
  runOperationsAdvisor,
  sortFindings,
  type KpiSnapshot,
  type Finding,
} from './operationsAdvisor'

function baseSnapshot(overrides: Partial<KpiSnapshot> = {}): KpiSnapshot {
  return {
    periodDays: 30,
    totalRooms: 20,
    netRevenue: 200_000_000,
    grossRevenue: 220_000_000,
    extraRevenue: 20_000_000,
    totalCost: 120_000_000,
    costBreakdown: { purchase: 40_000_000, laundry: 50_000_000, maintenance: 30_000_000, labor: 0 },
    roomNightsSold: 420,
    bookingsCount: 140,
    prevNetRevenue: 180_000_000,
    prevBookingsCount: 130,
    prevRoomNightsSold: 400,
    ...overrides,
  }
}

describe('computeDerivedKpis', () => {
  it('xử lý chia 0 không crash', () => {
    const k = computeDerivedKpis(baseSnapshot({ totalRooms: 0, roomNightsSold: 0, netRevenue: 0 }))
    expect(k.occupancy).toBe(0)
    expect(k.revpar).toBe(0)
    expect(k.adr).toBe(0)
    expect(k.profitMargin).toBe(0)
  })

  it('tính occupancy đúng', () => {
    const k = computeDerivedKpis(baseSnapshot())
    // 420 / (20*30) = 70%
    expect(k.occupancy).toBeCloseTo(70, 1)
  })

  it('tính profit margin đúng', () => {
    const k = computeDerivedKpis(baseSnapshot())
    // (200M - 120M) / 200M = 40%
    expect(k.profitMargin).toBeCloseTo(40, 1)
  })
})

describe('runOperationsAdvisor', () => {
  it('không trả finding nếu thiếu data', () => {
    const findings = runOperationsAdvisor(baseSnapshot({ totalRooms: 0 }))
    expect(findings).toEqual([])
  })

  it('phát hiện lấp đầy thấp', () => {
    const findings = runOperationsAdvisor(baseSnapshot({ roomNightsSold: 180 })) // 30%
    expect(findings.find(f => f.id === 'low-occupancy')).toBeDefined()
  })

  it('phát hiện biên lợi nhuận thấp', () => {
    const findings = runOperationsAdvisor(baseSnapshot({ totalCost: 190_000_000 }))
    const f = findings.find(x => x.id === 'low-profit-margin')
    expect(f?.severity).toBe('high')
  })

  it('khen khi biên lợi nhuận tốt', () => {
    const findings = runOperationsAdvisor(baseSnapshot())
    expect(findings.find(f => f.id === 'healthy-margin')).toBeDefined()
  })

  it('phát hiện doanh thu giảm', () => {
    const findings = runOperationsAdvisor(
      baseSnapshot({ netRevenue: 100_000_000, prevNetRevenue: 200_000_000 }),
    )
    expect(findings.find(f => f.id === 'revenue-declining')).toBeDefined()
  })

  it('sort theo severity + impact desc', () => {
    const arr: Finding[] = [
      { id: 'a', severity: 'low', category: 'cost', finding: '', suggestion: '', impactVnd: 1000 },
      { id: 'b', severity: 'high', category: 'cost', finding: '', suggestion: '', impactVnd: 500 },
      { id: 'c', severity: 'high', category: 'cost', finding: '', suggestion: '', impactVnd: 2000 },
    ]
    const sorted = sortFindings(arr)
    expect(sorted.map(f => f.id)).toEqual(['c', 'b', 'a'])
  })
})
