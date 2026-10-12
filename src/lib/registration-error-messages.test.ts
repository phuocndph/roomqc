import { describe, expect, it } from 'vitest'
import { getRegistrationErrorMessage } from './registration-error-messages'

describe('getRegistrationErrorMessage', () => {
  it('keeps transport failures distinct from registration failures', () => {
    expect(getRegistrationErrorMessage(new Error('Failed to fetch'))).toContain('kết nối')
    expect(getRegistrationErrorMessage(new Error('Required registration fields are invalid'))).toContain('chưa hợp lệ')
  })

  it('maps expected provisioning errors to an actionable Vietnamese message', () => {
    expect(getRegistrationErrorMessage(new Error('No active subscription plan found'))).toContain('gói dùng thử')
    expect(getRegistrationErrorMessage(new Error('Registration email does not match the authenticated account'))).toContain('trùng')
    expect(getRegistrationErrorMessage(new Error('Staff accounts cannot create a tenant'))).toContain('chủ sở hữu')
  })

  it('does not expose arbitrary database errors to the customer', () => {
    expect(getRegistrationErrorMessage(new Error('relation internal_table does not exist'))).toBe(
      'Không thể hoàn tất thiết lập lúc này. Vui lòng thử lại; thao tác an toàn để thực hiện lại.',
    )
  })
})
