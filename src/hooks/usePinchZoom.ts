import { useEffect, useRef, type RefObject } from 'react'

// Two fingers moving apart or together on an element: one step of size each time the distance changes by `threshold` pixels.
// The browser's own page zoom is kept out of the way while two fingers are on the element.
export function usePinchZoom(ref: RefObject<HTMLElement | null>, onStep: (step: 1 | -1) => void, threshold = 28) {
  const stepRef = useRef(onStep)
  useEffect(() => {
    stepRef.current = onStep
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let last = 0
    const distance = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) last = distance(e)
    }
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || last === 0) return
      e.preventDefault()
      const now = distance(e)
      if (Math.abs(now - last) >= threshold) {
        stepRef.current(now > last ? 1 : -1)
        last = now
      }
    }
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) last = 0
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end, { passive: true })
    el.addEventListener('touchcancel', end, { passive: true })
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [ref, threshold])
}
