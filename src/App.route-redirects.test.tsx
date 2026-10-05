import { describe, it, expect } from 'vitest'
import { createMemoryRouter, RouterProvider, Navigate } from 'react-router-dom'
import { render, waitFor } from '@testing-library/react'
import { Suspense } from 'react'

/**
 * Unit test cho 2 legacy pricing route redirects.
 * Cấu hình route dưới đây phải giữ sync với App.tsx.
 */
const pricingRedirectRoutes = [
  {
    path: '/settings/pricing/seasonal',
    element: <Navigate to="/settings/pricing?tab=seasonal" replace />,
  },
  {
    path: '/settings/pricing-rules',
    element: <Navigate to="/settings/pricing?tab=rules" replace />,
  },
  {
    path: '/settings/pricing',
    element: <div data-testid="pricing-hub">Pricing Hub</div>,
  },
]

describe('Legacy pricing route redirects', () => {
  it('/settings/pricing/seasonal → /settings/pricing?tab=seasonal', async () => {
    const router = createMemoryRouter(pricingRedirectRoutes, {
      initialEntries: ['/settings/pricing/seasonal'],
    })

    render(
      <Suspense fallback={<div>Loading</div>}>
        <RouterProvider router={router} />
      </Suspense>
    )

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/settings/pricing')
      expect(router.state.location.search).toBe('?tab=seasonal')
    })
  })

  it('/settings/pricing-rules → /settings/pricing?tab=rules', async () => {
    const router = createMemoryRouter(pricingRedirectRoutes, {
      initialEntries: ['/settings/pricing-rules'],
    })

    render(
      <Suspense fallback={<div>Loading</div>}>
        <RouterProvider router={router} />
      </Suspense>
    )

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/settings/pricing')
      expect(router.state.location.search).toBe('?tab=rules')
    })
  })

  it('không redirect khi vào /settings/pricing trực tiếp', async () => {
    const router = createMemoryRouter(pricingRedirectRoutes, {
      initialEntries: ['/settings/pricing'],
    })

    const { getByTestId } = render(
      <Suspense fallback={<div>Loading</div>}>
        <RouterProvider router={router} />
      </Suspense>
    )

    await waitFor(() => {
      expect(getByTestId('pricing-hub')).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/settings/pricing')
      expect(router.state.location.search).toBe('')
    })
  })
})
