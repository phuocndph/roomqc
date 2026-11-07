import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnnouncementPopup } from './AnnouncementPopup'
import type { Announcement } from '@/types/announcement.types'

const dismiss = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/announcements/useActiveAnnouncements', () => ({ useDismissAnnouncement: () => ({ mutate: dismiss }) }))
afterEach(() => { cleanup(); dismiss.mockReset() })
const announcement = (kind: Announcement['kind']) => ({
  id: 'A', kind, title: 'Chương trình thử nghiệm', body: 'Nội dung chương trình',
  is_dismissible: true, cta_url: null, content: null,
}) as Announcement

describe('announcement close actions', () => {
  it('uses one acknowledgement button for promos without a second opt-out checkbox', () => {
    const close = vi.fn()
    render(<AnnouncementPopup announcement={announcement('promo_popup')} open onOpenChange={close} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Đã hiểu' }))
    expect(close).toHaveBeenCalledExactlyOnceWith(false)
    // The host persists the promo once, not both host and dialog.
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('retains explicit opt-out for system notices', () => {
    const close = vi.fn()
    render(<AnnouncementPopup announcement={announcement('system_notice')} open onOpenChange={close} />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Đã hiểu' }))
    expect(dismiss).toHaveBeenCalledExactlyOnceWith('A')
    expect(close).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('acknowledges before opening the CTA destination', () => {
    const calls: string[] = []
    const open = vi.spyOn(window, 'open').mockImplementation(() => { calls.push('navigate'); return null })
    const a = { ...announcement('promo_popup'), cta_url: 'https://example.com', cta_label: 'Chi tiết' }
    render(<AnnouncementPopup announcement={a} open onOpenChange={() => calls.push('close')} />)
    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết' }))
    expect(calls).toEqual(['close', 'navigate'])
    open.mockRestore()
  })
})
