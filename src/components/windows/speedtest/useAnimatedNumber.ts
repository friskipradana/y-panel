import { useEffect, useRef, useState } from 'react'

// Eases a displayed number toward its target so live values glide instead of jumping
export function useAnimatedNumber(target: number) {
  const [value, setValue] = useState(target)
  const current = useRef(target)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      current.current = target
      setValue(target)
      return
    }
    let frame = 0
    const step = () => {
      const diff = target - current.current
      if (Math.abs(diff) < 0.05) {
        current.current = target
        setValue(target)
        return
      }
      current.current += diff * 0.2
      setValue(current.current)
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target])

  return value
}
