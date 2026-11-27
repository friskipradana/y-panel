import { useRef, useState } from 'react'

export function useTabDragScroll() {
  const tabsScrollRef = useRef<HTMLDivElement>(null)
  const isTabDraggingRef = useRef(false)
  const [isTabDragging, setIsTabDragging] = useState(false)
  const tabStartXRef = useRef(0)
  const tabScrollLeftRef = useRef(0)

  const handleTabsMouseDown = (e: React.MouseEvent) => {
    if (!tabsScrollRef.current) return
    isTabDraggingRef.current = true
    setIsTabDragging(true)
    tabStartXRef.current = e.pageX - tabsScrollRef.current.offsetLeft
    tabScrollLeftRef.current = tabsScrollRef.current.scrollLeft
  }

  const stopTabDrag = () => {
    isTabDraggingRef.current = false
    setIsTabDragging(false)
  }

  const handleTabsMouseMove = (e: React.MouseEvent) => {
    if (!isTabDraggingRef.current || !tabsScrollRef.current) return
    e.preventDefault()
    const x = e.pageX - tabsScrollRef.current.offsetLeft
    tabsScrollRef.current.scrollLeft = tabScrollLeftRef.current - (x - tabStartXRef.current) * 1.5
  }

  return {
    tabsScrollRef,
    isTabDragging,
    handleTabsMouseDown,
    handleTabsMouseLeave: stopTabDrag,
    handleTabsMouseUp: stopTabDrag,
    handleTabsMouseMove,
  }
}
