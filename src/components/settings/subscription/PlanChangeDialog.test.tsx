import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanChangeDialog } from './PlanChangeDialog';

const state = vi.hoisted(() => ({ tenant: null as Record<string, unknown> | null }));
vi.mock('@/hooks/useSubscription', () => ({ useTenantSubscription: () => ({ data: state.tenant }) }));
vi.mock('@/hooks/useRoomSubscriptionLimit', () => ({ useRoomSubscriptionLimit: () => ({ actualRooms: 20 }) }));
vi.mock('@/components/payment/BankTransferPaymentDialog', () => ({ BankTransferPaymentDialog: () => <div>quote-dialog</div> }));

const base = { name: 'Sun Hotel', registered_rooms: 50, approval_status: 'approved', subscription_status: 'active', is_read_only: false, read_only_reason: null };
const mount = () => render(<MemoryRouter><PlanChangeDialog open onOpenChange={vi.fn()} /></MemoryRouter>);

describe('renewal dialog', () => {
  beforeEach(() => { state.tenant = { ...base }; });
  it('keeps the online quote path for an eligible tenant', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Xem báo giá' })).toBeEnabled();
  });
  it('lets an expired read-only tenant continue to the server quote and QR payment', () => {
    state.tenant = { ...base, subscription_status: 'trial', is_read_only: true, read_only_reason: 'Hết 7 ngày ân hạn — chuyển sang chỉ đọc.' };
    mount();
    expect(screen.getByRole('button', { name: 'Xem báo giá' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('explains an admin suspension separately from expiry', () => {
    state.tenant = { ...base, subscription_status: 'suspended', is_read_only: true, read_only_reason: 'admin_suspended' };
    mount();
    expect(screen.getByText('Tài khoản đang bị RoomQC tạm khoá')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xem báo giá' })).not.toBeInTheDocument();
  });
});
