/**
 * Live wall-clock hook used by the footer and thinking blocks. Because Ink
 * only re-renders on state change, a short interval ticker gives the UI
 * elapsed seconds and a live context-percent reading without I/O.
 * @module dsh-tui/ui/useNow
 */

import { useEffect, useState } from 'react'

/** Re-render on an interval; returns the current epoch ms (default 1s). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** Elapsed whole seconds between `start` and `now` (>=0). */
export function elapsedSeconds(start: number | undefined, now: number): number {
  if (start === undefined) return 0
  return Math.max(0, Math.floor((now - start) / 1000))
}