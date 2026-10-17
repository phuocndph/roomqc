import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ListPagination } from './ListPagination'
import { usePagedList } from '@/hooks/usePagedList'

describe('list pagination', () => {
  const rows = Array.from({ length: 123 }, (_, id) => id)
  it('renders 50 at a time and immediately resets on a filter/context change', () => {
    const { result, rerender } = renderHook(({ key, data }) => usePagedList(data, key), { initialProps: { key: 'hotel-a', data: rows } })
    expect(result.current.rows).toEqual(rows.slice(0, 50))
    act(() => result.current.setPage(3))
    expect(result.current.rows).toEqual(rows.slice(100))
    rerender({ key: 'hotel-b', data: rows })
    expect(result.current.page).toBe(1)
    expect(result.current.rows).toEqual(rows.slice(0, 50))
  })
  it('clamps the current page when data shrinks', () => {
    const { result, rerender } = renderHook(({ data }) => usePagedList(data, 'filter'), { initialProps: { data: rows } })
    act(() => result.current.setPage(3))
    rerender({ data: [0] })
    expect(result.current.page).toBe(1)
    expect(result.current.rows).toEqual([0])
  })
  it('provides labelled navigation and disables boundary buttons', () => {
    const onPageChange = vi.fn()
    const { rerender } = render(<ListPagination total={123} page={1} onPageChange={onPageChange} />)
    expect(screen.getByRole('navigation', { name: 'Phân trang danh sách' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Hiển thị 1–50 / 123')
    expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Sau' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
    rerender(<ListPagination total={123} page={3} onPageChange={onPageChange} />)
    expect(screen.getByRole('status')).toHaveTextContent('Hiển thị 101–123 / 123')
    expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled()
    rerender(<ListPagination total={50} page={1} onPageChange={onPageChange} />)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})
