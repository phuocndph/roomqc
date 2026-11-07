import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiScorecard } from './KpiScorecard'
import { KpiHeroCardV2 } from './insights/KpiHeroCardV2'

describe('KPI comparison units', () => {
  it('labels the overview occupancy difference as percentage points', () => {
    render(<KpiScorecard label="Công suất" value="60%" deltaPct={10} deltaUnit="percentage-points" />)
    expect(screen.getByText('10.0 điểm %')).toBeTruthy()
    expect(screen.queryByText('10.0%')).toBeNull()
  })
  it('keeps the default overview revenue change as a percent', () => {
    render(<KpiScorecard label="Doanh thu" value="110" deltaPct={10} />)
    expect(screen.getByText('10.0%')).toBeTruthy()
  })
  it('labels both period and year-ago occupancy differences as percentage points', () => {
    render(<KpiHeroCardV2 label="Công suất" value="60%" pop={10} yoy={-20} deltaUnit="percentage-points" />)
    expect(screen.getByText('Kỳ trước +10.0 điểm %')).toBeTruthy()
    expect(screen.getByText('YoY -20.0 điểm %')).toBeTruthy()
  })
  it('keeps default revenue comparisons as percents', () => {
    render(<KpiHeroCardV2 label="Doanh thu" value="110" pop={10} yoy={-20} />)
    expect(screen.getByText('Kỳ trước +10.0%')).toBeTruthy()
    expect(screen.getByText('YoY -20.0%')).toBeTruthy()
  })
})
