import { useEffect, useRef, type RefObject } from 'react'
import type { Terminal } from 'xterm'

interface CellPos {
  col: number
  row: number
  viewRow: number
  rect: DOMRect
}

interface SelectionBounds {
  startCol: number
  startRow: number
  endCol: number
  endRow: number
}

const TOUCH_HOLD_MS = 300
const MOUSE_HOLD_MS = 360
const TOUCH_SLOP_PX = 10
const MOUSE_SLOP_PX = 4

function clientToCell(xterm: Terminal, container: HTMLElement, clientX: number, clientY: number): CellPos | null {
  const screen = (container.querySelector('.xterm-screen') as HTMLElement | null) ?? container
  const rect = screen.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0 || xterm.cols <= 0 || xterm.rows <= 0) return null

  const relX = Math.max(0, Math.min(rect.width - 1, clientX - rect.left))
  const relY = Math.max(0, Math.min(rect.height - 1, clientY - rect.top))
  const col = Math.min(xterm.cols - 1, Math.max(0, Math.floor((relX / rect.width) * xterm.cols)))
  const viewRow = Math.min(xterm.rows - 1, Math.max(0, Math.floor((relY / rect.height) * xterm.rows)))
  const row = xterm.buffer.active.viewportY + viewRow

  return { col, row, viewRow, rect }
}

function findWordAt(xterm: Terminal, col: number, row: number): { startCol: number; endCol: number; row: number } {
  const line = xterm.buffer.active.getLine(row)?.translateToString(false) ?? ''
  const trimmed = line.replace(/\s+$/, '')
  if (trimmed.length === 0) {
    return { startCol: col, endCol: Math.min(xterm.cols, col + 1), row }
  }

  const probe = Math.min(col, Math.max(0, trimmed.length - 1))
  const ch = line[probe] ?? ' '
  if (!/\s/.test(ch)) {
    let start = probe
    let end = probe + 1
    while (start > 0 && !/\s/.test(line[start - 1] ?? ' ')) start--
    while (end < trimmed.length && !/\s/.test(line[end] ?? ' ')) end++
    return { startCol: start, endCol: Math.max(start + 1, end), row }
  }

  const firstNonWs = trimmed.search(/\S/)
  if (firstNonWs >= 0) {
    return { startCol: firstNonWs, endCol: trimmed.length, row }
  }
  return { startCol: col, endCol: Math.min(xterm.cols, col + 1), row }
}

function applyRangeSelection(
  xterm: Terminal,
  anchorStart: { col: number; row: number },
  anchorEnd: { col: number; row: number },
  target: { col: number; row: number },
): SelectionBounds {
  const isBefore = target.row < anchorStart.row || (target.row === anchorStart.row && target.col < anchorStart.col)
  if (isBefore) {
    const startCol = Math.max(0, Math.min(xterm.cols - 1, target.col))
    const startRow = Math.max(0, target.row)
    const length = Math.max(1, (anchorEnd.row - startRow) * xterm.cols + (anchorEnd.col - startCol))
    xterm.select(startCol, startRow, length)
    return { startCol, startRow, endCol: anchorEnd.col, endRow: anchorEnd.row }
  }

  const endRow = Math.max(anchorStart.row, target.row)
  const rawEndCol = Math.min(xterm.cols, target.col + 1)
  const endCol = endRow === anchorEnd.row ? Math.max(anchorEnd.col, rawEndCol) : rawEndCol
  const length = Math.max(1, (endRow - anchorStart.row) * xterm.cols + (endCol - anchorStart.col))
  xterm.select(anchorStart.col, anchorStart.row, length)
  return { startCol: anchorStart.col, startRow: anchorStart.row, endCol, endRow }
}

function isNearHandle(cell: CellPos, handleCol: number, handleRow: number): boolean {
  return Math.abs(cell.row - handleRow) <= 1 && Math.abs(cell.col - handleCol) <= 3
}

// Long-press ("hold hand") and drag text selection for xterm.js on touch and pointer devices
export function useTerminalTouchSelect(
  containerRef: RefObject<HTMLDivElement | null>,
  xtermRef: RefObject<Terminal | null>,
  onSelectionChange?: (selectedText: string) => void,
) {
  const callbackRef = useRef(onSelectionChange)
  useEffect(() => {
    callbackRef.current = onSelectionChange
  }, [onSelectionChange])

  useEffect(() => {
    const container = containerRef.current
    const xterm = xtermRef.current
    if (!container || !xterm) return

    let holdTimer: number | null = null
    let mouseHoldTimer: number | null = null
    let selecting = false
    let mouseHoldSelecting = false
    let moved = false
    let startX = 0
    let startY = 0
    let suppressMouseUntil = 0
    let lastScrollAt = 0
    let anchorStart = { col: 0, row: 0 }
    let anchorEnd = { col: 1, row: 0 }
    let bounds: SelectionBounds | null = null

    const clearTimers = () => {
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer)
        holdTimer = null
      }
      if (mouseHoldTimer !== null) {
        window.clearTimeout(mouseHoldTimer)
        mouseHoldTimer = null
      }
    }

    const notifySelection = () => {
      const text = xterm.hasSelection() ? xterm.getSelection() : ''
      if (!text) bounds = null
      callbackRef.current?.(text)
    }

    const sub = xterm.onSelectionChange(() => {
      notifySelection()
    })

    const onTouchStart = (e: TouchEvent) => {
      if ((e.target as HTMLElement | null)?.closest('.ht-selection-bar')) return
      clearTimers()

      if (e.touches.length !== 1) {
        selecting = false
        return
      }

      const touch = e.touches[0]
      startX = touch.clientX
      startY = touch.clientY
      moved = false
      selecting = false

      const cell = clientToCell(xterm, container, startX, startY)
      if (cell && bounds && xterm.hasSelection()) {
        if (isNearHandle(cell, bounds.startCol, bounds.startRow)) {
          selecting = true
          anchorStart = { col: Math.max(0, bounds.endCol - 1), row: bounds.endRow }
          anchorEnd = { col: bounds.endCol, row: bounds.endRow }
          return
        }
        if (isNearHandle(cell, Math.max(0, bounds.endCol - 1), bounds.endRow)) {
          selecting = true
          anchorStart = { col: bounds.startCol, row: bounds.startRow }
          anchorEnd = { col: Math.min(xterm.cols, bounds.startCol + 1), row: bounds.startRow }
          return
        }
      }

      holdTimer = window.setTimeout(() => {
        holdTimer = null
        const holdCell = clientToCell(xterm, container, startX, startY)
        if (!holdCell) return
        selecting = true
        const word = findWordAt(xterm, holdCell.col, holdCell.row)
        anchorStart = { col: word.startCol, row: word.row }
        anchorEnd = { col: word.endCol, row: word.row }
        bounds = applyRangeSelection(xterm, anchorStart, anchorEnd, { col: Math.max(word.startCol, word.endCol - 1), row: word.row })
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try { navigator.vibrate(15) } catch { /* ignore vibrate restriction */ }
        }
        notifySelection()
      }, TOUCH_HOLD_MS)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        clearTimers()
        selecting = false
        return
      }

      const touch = e.touches[0]
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      if (Math.hypot(dx, dy) > TOUCH_SLOP_PX) {
        moved = true
        if (!selecting) {
          clearTimers()
          return
        }
      }

      if (!selecting) return

      if (e.cancelable) e.preventDefault()
      e.stopPropagation()

      const cell = clientToCell(xterm, container, touch.clientX, touch.clientY)
      if (!cell) return

      const now = Date.now()
      if (now - lastScrollAt > 65) {
        if (touch.clientY < cell.rect.top + 24) {
          xterm.scrollLines(-1)
          lastScrollAt = now
        } else if (touch.clientY > cell.rect.bottom - 24) {
          xterm.scrollLines(1)
          lastScrollAt = now
        }
      }

      const updatedCell = clientToCell(xterm, container, touch.clientX, touch.clientY) ?? cell
      bounds = applyRangeSelection(xterm, anchorStart, anchorEnd, { col: updatedCell.col, row: updatedCell.row })
      notifySelection()
    }

    const onTouchEnd = (e: TouchEvent) => {
      clearTimers()
      if (selecting) {
        selecting = false
        suppressMouseUntil = Date.now() + 500
        if (e.cancelable) e.preventDefault()
        notifySelection()
        return
      }

      if (!moved && xterm.hasSelection() && !(e.target as HTMLElement | null)?.closest('.ht-selection-bar')) {
        xterm.clearSelection()
        bounds = null
        notifySelection()
      }
    }

    const onMouseDownCapture = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('.ht-selection-bar')) return
      if (Date.now() < suppressMouseUntil) {
        e.stopPropagation()
        e.preventDefault()
        return
      }
      if (e.button !== 0) return

      clearTimers()
      mouseHoldSelecting = false
      startX = e.clientX
      startY = e.clientY

      mouseHoldTimer = window.setTimeout(() => {
        mouseHoldTimer = null
        if (xterm.hasSelection() && xterm.getSelection().length > 1) return
        const cell = clientToCell(xterm, container, startX, startY)
        if (!cell) return
        mouseHoldSelecting = true
        const word = findWordAt(xterm, cell.col, cell.row)
        anchorStart = { col: word.startCol, row: word.row }
        anchorEnd = { col: word.endCol, row: word.row }
        bounds = applyRangeSelection(xterm, anchorStart, anchorEnd, { col: Math.max(word.startCol, word.endCol - 1), row: word.row })
        notifySelection()
      }, MOUSE_HOLD_MS)
    }

    const onWindowMouseMoveCapture = (e: MouseEvent) => {
      if (mouseHoldTimer !== null) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > MOUSE_SLOP_PX) {
          window.clearTimeout(mouseHoldTimer)
          mouseHoldTimer = null
        }
        return
      }
      if (!mouseHoldSelecting) return
      e.stopImmediatePropagation()
      const cell = clientToCell(xterm, container, e.clientX, e.clientY)
      if (!cell) return
      bounds = applyRangeSelection(xterm, anchorStart, anchorEnd, { col: cell.col, row: cell.row })
      notifySelection()
    }

    const onWindowMouseUpCapture = (e: MouseEvent) => {
      if (mouseHoldTimer !== null) {
        window.clearTimeout(mouseHoldTimer)
        mouseHoldTimer = null
      }
      if (!mouseHoldSelecting) return
      mouseHoldSelecting = false
      e.stopImmediatePropagation()
      notifySelection()
    }

    const onContextMenu = (e: MouseEvent) => {
      if (selecting || Date.now() < suppressMouseUntil) {
        e.preventDefault()
      }
    }

    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchmove', onTouchMove, { passive: false })
    container.addEventListener('touchend', onTouchEnd, { passive: false })
    container.addEventListener('touchcancel', onTouchEnd, { passive: false })
    container.addEventListener('mousedown', onMouseDownCapture, { capture: true })
    container.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('mousemove', onWindowMouseMoveCapture, { capture: true })
    window.addEventListener('mouseup', onWindowMouseUpCapture, { capture: true })

    return () => {
      clearTimers()
      sub.dispose()
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
      container.removeEventListener('touchcancel', onTouchEnd)
      container.removeEventListener('mousedown', onMouseDownCapture, { capture: true })
      container.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('mousemove', onWindowMouseMoveCapture, { capture: true })
      window.removeEventListener('mouseup', onWindowMouseUpCapture, { capture: true })
    }
  }, [containerRef, xtermRef])
}

