import { describe, expect, it, vi } from 'vitest'
import { navigateBack } from './navigation'

describe('navigateBack', () => {
  it('uses the previous in-app entry when history has an index', () => {
    window.history.replaceState({ idx: 3 }, '', '/inventory?tab=operations&sub=inbound')
    const navigate = vi.fn()

    navigateBack(navigate, '/inventory')

    expect(navigate).toHaveBeenCalledWith(-1)
  })

  it('uses the module fallback for a direct deep link', () => {
    window.history.replaceState({ idx: 0 }, '', '/rooms/room-1')
    const navigate = vi.fn()

    navigateBack(navigate, '/rooms')

    expect(navigate).toHaveBeenCalledWith('/rooms', { replace: true })
  })
})
