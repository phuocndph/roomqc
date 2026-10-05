// Port nguyên từ Deal Hotel Hub
import { useCallback, useEffect, useRef, useState } from 'react'

export type RowKind = 'status' | 'qty' | 'price'

export interface CellAddr {
  rowKey: string
  rowKind: RowKind
  rowMeta?: string
  colIndex: number
}

export interface Selection {
  rowKey: string
  rowKind: RowKind
  rowMeta?: string
  startCol: number
  endCol: number
}

export interface Clipboard {
  rowKind: RowKind
  values: Array<Record<string, any>>
}

const DRAG_THRESHOLD = 4

export function useGridSelection(opts: {
  onCopy?: (sel: Selection) => Clipboard | null
  onPaste?: (sel: Selection, clip: Clipboard) => void
  onEscape?: () => void
}) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [clipboard, setClipboard] = useState<Clipboard | null>(null)

  const isDraggingRef = useRef(false)
  const movedRef = useRef(false)
  const downPosRef = useRef<{ x: number; y: number } | null>(null)
  const downCellRef = useRef<CellAddr | null>(null)
  const fillingRef = useRef<{ from: CellAddr } | null>(null)

  const clear = useCallback(() => setSelection(null), [])

  const handleCellMouseDown = useCallback((e: React.MouseEvent, cell: CellAddr) => {
    if (e.button !== 0) return
    if (e.shiftKey && selection && selection.rowKey === cell.rowKey) {
      setSelection({ ...selection, endCol: cell.colIndex })
      e.preventDefault()
      return
    }
    downPosRef.current = { x: e.clientX, y: e.clientY }
    downCellRef.current = cell
    movedRef.current = false
    isDraggingRef.current = true
    setSelection({
      rowKey: cell.rowKey,
      rowKind: cell.rowKind,
      rowMeta: cell.rowMeta,
      startCol: cell.colIndex,
      endCol: cell.colIndex,
    })
  }, [selection])

  const handleCellMouseEnter = useCallback((cell: CellAddr) => {
    if (!isDraggingRef.current) return
    const anchor = downCellRef.current
    if (!anchor) return
    if (anchor.rowKey !== cell.rowKey) return
    movedRef.current = true
    setSelection((prev) => prev ? { ...prev, endCol: cell.colIndex } : prev)
  }, [])

  const startFill = useCallback((e: React.MouseEvent, from: CellAddr) => {
    e.stopPropagation()
    e.preventDefault()
    fillingRef.current = { from }
    isDraggingRef.current = true
    downCellRef.current = from
    setSelection({
      rowKey: from.rowKey,
      rowKind: from.rowKind,
      rowMeta: from.rowMeta,
      startCol: from.colIndex,
      endCol: from.colIndex,
    })
  }, [])

  useEffect(() => {
    const onUp = (e: MouseEvent) => {
      const wasFilling = !!fillingRef.current
      if (isDraggingRef.current) {
        const dp = downPosRef.current
        const moved = movedRef.current || (dp && (Math.abs(e.clientX - dp.x) + Math.abs(e.clientY - dp.y) > DRAG_THRESHOLD))
        isDraggingRef.current = false
        downPosRef.current = null
        if (wasFilling && fillingRef.current) {
          const ev = new CustomEvent('grid-fill-end', { detail: { from: fillingRef.current.from } })
          window.dispatchEvent(ev)
        }
        fillingRef.current = null
        ;(window as any).__gridDragMoved = !!moved
      }
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-grid-cell="1"], [data-selection-toolbar="1"], [data-grid-fill="1"], [role="dialog"], [data-radix-popper-content-wrapper]')) {
        return
      }
      setSelection(null)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (e.key === 'Escape') {
        if (selection) { setSelection(null); opts.onEscape?.() }
        return
      }
      if (!selection) return
      if (isInput) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'c') {
        const clip = opts.onCopy?.(selection) ?? null
        if (clip) {
          setClipboard(clip)
          try {
            const text = clip.values.map(v => v.price ?? v.qty ?? '').join('\t')
            navigator.clipboard?.writeText(text).catch(() => {})
          } catch { /* ignore */ }
        }
        e.preventDefault()
      } else if (mod && e.key.toLowerCase() === 'v') {
        if (clipboard) {
          opts.onPaste?.(selection, clipboard)
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, clipboard, opts])

  return {
    selection,
    clipboard,
    setClipboard,
    clearSelection: clear,
    handleCellMouseDown,
    handleCellMouseEnter,
    startFill,
    wasDragMoved: () => !!(window as any).__gridDragMoved,
    resetDragMoved: () => { (window as any).__gridDragMoved = false },
  }
}

export function selectionRange(sel: Selection): { from: number; to: number } {
  return { from: Math.min(sel.startCol, sel.endCol), to: Math.max(sel.startCol, sel.endCol) }
}

export function isCellSelected(sel: Selection | null, rowKey: string, col: number): boolean {
  if (!sel || sel.rowKey !== rowKey) return false
  const { from, to } = selectionRange(sel)
  return col >= from && col <= to
}
