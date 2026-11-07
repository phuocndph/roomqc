import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SuperAdminLayout } from './SuperAdminLayout';

vi.mock('@/hooks/useSuperAdminAuth', () => ({ useSuperAdminAuth: () => ({ user: { email: 'admin@example.invalid' }, isLoading: false, isSuperAdmin: true, signOut: vi.fn() }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./shared/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('./shared/ThemeToggle', () => ({ ThemeToggle: () => null }));
const initialWidth = window.innerWidth;
const resize = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event('resize'));
};
const setup = () => render(<MemoryRouter initialEntries={['/super-admin/tenants']}><SuperAdminLayout /></MemoryRouter>);

describe('admin navigation real responsive breakpoint', () => {
  afterEach(() => { cleanup(); resize(initialWidth); });
  it.each([390, 768, 1023])('retains an accessible mobile/tablet menu at %ipx', async width => {
    resize(width); setup();
    const trigger = await screen.findByRole('button', { name: 'Mở menu quản trị' });
    expect(screen.queryByRole('link', { hidden: true })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(await screen.findByRole('link', { name: 'navigation.tenants' })).toBeInTheDocument();
  });
  it('switches to desktop at 1024px without missing or duplicate navigation, and closes the old drawer', async () => {
    resize(1023); setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Mở menu quản trị' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    act(() => resize(1024));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'navigation.tenants' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mở menu quản trị' })).not.toBeInTheDocument();
    act(() => resize(768));
    expect(await screen.findByRole('button', { name: 'Mở menu quản trị' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { hidden: true })).not.toBeInTheDocument();
  });
});
