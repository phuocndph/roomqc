import { describe, it, expect } from 'vitest'
import { isSessionTakenOver, getTakenOverByName } from './roomCheckSession'

describe('isSessionTakenOver', () => {
  it('trả false khi không có session', () => {
    expect(isSessionTakenOver(null, 'u1')).toBe(false)
    expect(isSessionTakenOver(undefined, 'u1')).toBe(false)
  })

  it('trả false khi chưa biết user hiện tại', () => {
    expect(isSessionTakenOver({ user_id: 'u2' }, null)).toBe(false)
    expect(isSessionTakenOver({ user_id: 'u2' }, undefined)).toBe(false)
  })

  it('trả false khi session là chính user hiện tại', () => {
    expect(isSessionTakenOver({ user_id: 'u1' }, 'u1')).toBe(false)
  })

  it('trả true khi session do user khác giữ', () => {
    expect(isSessionTakenOver({ user_id: 'u2' }, 'u1')).toBe(true)
  })
})

describe('getTakenOverByName', () => {
  it('trả null khi không bị tiếp quản', () => {
    expect(getTakenOverByName({ user_id: 'u1', user_name: 'A' }, 'u1')).toBeNull()
    expect(getTakenOverByName(null, 'u1')).toBeNull()
  })

  it('trả tên người tiếp quản khi user khác', () => {
    expect(
      getTakenOverByName({ user_id: 'u2', user_name: 'Quản lý B' }, 'u1'),
    ).toBe('Quản lý B')
  })

  it('trả null nếu user khác nhưng không có tên', () => {
    expect(getTakenOverByName({ user_id: 'u2' }, 'u1')).toBeNull()
  })
})
