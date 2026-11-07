import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FormProvider, useForm } from 'react-hook-form'
import { afterEach, describe, expect, it, vi } from 'vitest'

// W1 legacy wizard (2026-11-06): the issue photo collected in the items step
// was overwritten when the first review photo was uploaded, so the saved check
// lost the damage evidence.

const state = vi.hoisted(() => ({ uploaded: ['room-check-photos/tenant-a/review.png'], form: null as null | { getValues: (k: string) => unknown } }))
vi.mock('@/hooks/useImageUpload', () => ({
  useImageUpload: () => ({ uploadImages: async () => state.uploaded.map(url => ({ url })), isUploading: false }),
}))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ tenantId: 'tenant-a' }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { ReviewStep } from './ReviewStep'

const Harness = () => {
  const form = useForm({ defaultValues: { check_type: 'checkin', cleanliness_score: 5, items_complete: false, items_missing: [], items_damaged: [], notes: '', photos: ['room-check-photos/tenant-a/issue.png'] } })
  state.form = form as unknown as { getValues: (k: string) => unknown }
  return <FormProvider {...form}><ReviewStep form={form as never} room={{ room_number: '101', room_type: 'standard', floor: 1 } as never} checkType="checkin" currentBooking={null} /></FormProvider>
}

afterEach(cleanup)

describe('ReviewStep photos', () => {
  it('shows issue photos collected earlier and keeps them when a review photo is added', async () => {
    const { container } = render(<Harness />)
    expect(screen.getByText('1/10')).toBeInTheDocument()

    const input = container.querySelector('input[type=file]') as HTMLInputElement
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'review.png', { type: 'image/png' })
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }) })

    await waitFor(() => expect(screen.getByText('2/10')).toBeInTheDocument())
    expect(state.form!.getValues('photos')).toEqual(['room-check-photos/tenant-a/issue.png', 'room-check-photos/tenant-a/review.png'])
  })
})
