import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SuperAdminLayout } from './SuperAdminLayout';

const state = vi.hoisted(() => ({ isMobile: true, allowed: true }));
vi.mock('@/lib/breakpoints', () => ({ useBreakpoint: () => ({ isMobile: state.isMobile }) }));
vi.mock('@/hooks/useSuperAdminAuth', () => ({ useSuperAdminAuth: () => ({ user: { email: 'admin@example.invalid' }, isLoading: false, isSuperAdmin: state.allowed, signOut: vi.fn() }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./shared/NotificationBell', () => ({ NotificationBell: () => <span>Notifications</span> }));
vi.mock('./shared/ThemeToggle', () => ({ ThemeToggle: () => <span>Theme</span> }));
const setup = () => render(<MemoryRouter initialEntries={['/super-admin/tenants']}><SuperAdminLayout /></MemoryRouter>);

describe('admin navigation accessibility', () => {
  beforeEach(() => { state.isMobile = true; state.allowed = true; });
  it('does not mount offscreen mobile links when closed and names the menu button', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Mở menu quản trị' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { hidden: true })).not.toBeInTheDocument();
  });
  it('opens a modal drawer, marks current route, and closes after choosing a route', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Mở menu quản trị' });
    trigger.focus(); fireEvent.click(trigger);
    const drawer = await screen.findByRole('dialog', { name: 'Menu quản trị RoomQC' });
    expect(within(drawer).getByRole('navigation', { name: 'Điều hướng quản trị RoomQC' })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: 'navigation.tenants' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(within(drawer).getByRole('link', { name: 'navigation.overview' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
  it('supports Escape and restores focus to the trigger', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Mở menu quản trị' });
    trigger.focus(); fireEvent.click(trigger);
    const drawer = await screen.findByRole('dialog');
    fireEvent.keyDown(drawer, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
  it('keeps desktop navigation visible without a duplicate drawer', () => {
    state.isMobile = false; setup();
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'navigation.tenants' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Mở menu quản trị' })).not.toBeInTheDocument();
  });
  it('does not render admin navigation while access is denied', () => {
    state.allowed = false; setup();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mở menu quản trị' })).not.toBeInTheDocument();
  });
  it('exposes both control consoles in the main menu', async () => {
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Mở menu quản trị' }));
    expect(await screen.findByRole('link', { name: 'Hạ tầng' })).toHaveAttribute('href', '/super-admin/infrastructure');
    expect(screen.getByRole('link', { name: 'Đăng ký mới' })).toHaveAttribute('href', '/super-admin/registrations');
  });
  it('never mounts a child request before permission and unmounts it when access is revoked', () => {
    const request = vi.fn(), cancelled = vi.fn();
    function Child() { useEffect(() => { request(); return cancelled; }, []); return <p>Private child</p>; }
    const content = () => <MemoryRouter initialEntries={['/super-admin/infrastructure']}><Routes>
      <Route path="/super-admin" element={<SuperAdminLayout />}><Route path="infrastructure" element={<Child />} /></Route>
    </Routes></MemoryRouter>;
    state.allowed = false; const view = render(content()); expect(request).not.toHaveBeenCalled();
    state.allowed = true; view.rerender(content()); expect(request).toHaveBeenCalledTimes(1);
    state.allowed = false; view.rerender(content()); expect(cancelled).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Private child')).not.toBeInTheDocument();
  });
});
