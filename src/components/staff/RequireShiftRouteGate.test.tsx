import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// W1 photo-caller run (2026-11-06): an on-shift staff member opening
// /rooms/:id/check-lean directly was bounced to the dashboard with the
// "Bạn cần vào ca" dialog because the gate decided before staff_status loaded.

const state = vi.hoisted(() => ({
  value: { requiresShift: true, isOnShift: false, isShiftStatusLoading: true, guard: (fn: () => void) => fn(), openDialog: vi.fn() },
}))
vi.mock('@/contexts/RequireShiftContext', () => ({ useRequireShift: () => state.value }))

import { RequireShiftRouteGate } from './RequireShiftRouteGate'

const renderGate = () => render(
  <MemoryRouter initialEntries={['/rooms/r1/check-lean']}>
    <Routes>
      <Route path="/" element={<div>dashboard</div>} />
      <Route path="/rooms/:id/check-lean" element={<RequireShiftRouteGate><div>check page</div></RequireShiftRouteGate>} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => { state.value.openDialog = vi.fn() })
afterEach(cleanup)

describe('RequireShiftRouteGate', () => {
  it('waits while the shift status is loading instead of redirecting', () => {
    state.value = { ...state.value, isOnShift: false, isShiftStatusLoading: true }
    renderGate()
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument()
    expect(screen.queryByText('check page')).not.toBeInTheDocument()
    expect(state.value.openDialog).not.toHaveBeenCalled()
  })

  it('lets an on-shift staff member open the deep link once loaded', () => {
    state.value = { ...state.value, isOnShift: true, isShiftStatusLoading: false }
    renderGate()
    expect(screen.getByText('check page')).toBeInTheDocument()
  })

  it('still blocks and asks to clock in when the loaded status is off shift', () => {
    state.value = { ...state.value, isOnShift: false, isShiftStatusLoading: false }
    renderGate()
    expect(screen.getByText('dashboard')).toBeInTheDocument()
    expect(state.value.openDialog).toHaveBeenCalledOnce()
  })
})
