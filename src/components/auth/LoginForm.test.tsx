import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './LoginForm';

const auth = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/lib/credential-manager', () => ({ storeCredential: vi.fn(), clearLocalCredential: vi.fn() }));
vi.mock('@/lib/runtime-config', () => ({ scopedStorageKey: (key: string) => `test:${key}`, runtimeConfig: {} }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => ({
  'login.email': 'Email', 'login.password': 'Mật khẩu', 'login.rememberMe': 'Ghi nhớ đăng nhập',
  'login.loginButton': 'Đăng nhập',
}[key] ?? key) }) }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.signIn.mockResolvedValue({ error: new Error('Test only: remain on form') });
});
afterEach(cleanup);
const show = () => render(<MemoryRouter><LoginForm /></MemoryRouter>);

describe('login field accessibility', () => {
  it('associates labels with inputs, not decorative wrappers, while keeping password-manager hints', () => {
    show();
    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Mật khẩu');
    expect(email.tagName).toBe('INPUT');
    expect(password.tagName).toBe('INPUT');
    expect(email).toHaveAttribute('autocomplete', 'username');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('checkbox', { name: 'Ghi nhớ đăng nhập' })).not.toBeChecked();
  });

  it('exposes the password toggle and does not submit the form when toggled', () => {
    show();
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Local-only!123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('type', 'password');
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('attaches validation errors to the editable fields', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true'));
    for (const label of ['Email', 'Mật khẩu']) {
      const input = screen.getByLabelText(label);
      const errorId = input.getAttribute('aria-describedby')?.split(' ').find(id => id.endsWith('-message'));
      expect(errorId).toBeTruthy();
      expect(document.getElementById(errorId!)).toHaveTextContent(/.+/);
    }
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('submits credentials once and keeps the form available after a rejected login', async () => {
    show();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a0@example.invalid' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Local-only!123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() => expect(auth.signIn).toHaveBeenCalledExactlyOnceWith('a0@example.invalid', 'Local-only!123'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeEnabled());
  });
});
