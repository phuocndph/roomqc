import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SuperAdminLayout } from './SuperAdminLayout';

const state = vi.hoisted(() => ({ isMobile: true }));
vi.mock('@/lib/breakpoints', () => ({ useBreakpoint: () => ({ isMobile: state.isMobile }) }));
vi.mock('@/hooks/useSuperAdminAuth', () => ({ useSuperAdminAuth: () => ({ user: { email: 'admin@example.invalid' }, isLoading: false, signOut: vi.fn() }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./shared/NotificationBell', () => ({ NotificationBell: () => <span>Notifications</span> }));
vi.mock('./shared/ThemeToggle', () => ({ ThemeToggle: () => <span>Theme</span> }));
const setup = () => render(<MemoryRouter initialEntries={['/super-admin/tenants']}><SuperAdminLayout /></MemoryRouter>);

describe('admin navigation accessibility', () => {
  beforeEach(() => { state.isMobile = true; });
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
});
