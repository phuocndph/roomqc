export class AccountProfileError extends Error {
  constructor(readonly code: 'workspace_mismatch' | 'workspace_unconfirmed') {
    super(code === 'workspace_mismatch'
      ? 'Tài khoản không thuộc doanh nghiệp đang mở.'
      : 'Doanh nghiệp chưa hoàn tất xác nhận thiết lập.')
    this.name = 'AccountProfileError'
  }
}
