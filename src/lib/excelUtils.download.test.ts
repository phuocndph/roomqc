import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ saveAs: vi.fn(), writeBuffer: vi.fn() }))
vi.mock('file-saver', () => ({ saveAs: mock.saveAs }))
vi.mock('exceljs', () => ({ Workbook: class {
  xlsx = { writeBuffer: mock.writeBuffer }
  addWorksheet() { return { addRow() {}, getColumn() { return {} } } }
} }))
import { downloadWorkbook } from './excelUtils'
beforeEach(() => { mock.saveAs.mockReset(); mock.writeBuffer.mockReset(); mock.writeBuffer.mockResolvedValue(new Uint8Array()) })
describe('workbook authorization before saving', () => {
  it('waits for both buffer generation and authorization before saving', async () => {
    let finish!: (value: unknown) => void
    mock.writeBuffer.mockReturnValue(new Promise(r => { finish = r }))
    const authorize = vi.fn().mockResolvedValue(undefined)
    const pending = downloadWorkbook([{ name: 'Tài chính', rows: [['Tổng', 100]] }], 'finance', authorize)
    expect(authorize).not.toHaveBeenCalled(); expect(mock.saveAs).not.toHaveBeenCalled()
    finish(new Uint8Array()); await pending
    expect(authorize).toHaveBeenCalledOnce(); expect(mock.saveAs).toHaveBeenCalledWith(expect.any(Blob), 'finance.xlsx')
  })
  it('does not save a completed workbook when final authorization fails', async () => {
    await expect(downloadWorkbook([{ name: 'Test', rows: [] }], 'x', async () => { throw new Error('REVOKED') })).rejects.toThrow('REVOKED')
    expect(mock.saveAs).not.toHaveBeenCalled()
  })
  it('preserves existing two-argument callers', async () => {
    await downloadWorkbook([{ name: 'Test', rows: [] }], 'existing.xlsx')
    expect(mock.saveAs).toHaveBeenCalledOnce()
  })
})
