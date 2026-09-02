/**
 * Mouse-wheel speed limiter. A wheel notch maps to one history item, which
 * reads as a big jump (a message can span many lines); halving the speed
 * means one item per TWO notches. Direction flips reset the accumulator so
 * reversing never spends the previous direction's leftover notch.
 * @module dsh-tui/ui/wheelSpeed
 */

/** Notches of wheel input required for one item step (2 = half speed). */
const NOTCHES_PER_STEP = 2

/** Stateful notch → step gate: returns true when the wheel should move one item. */
export function wheelAccumulator(): (direction: 'up' | 'down') => boolean {
  let pending = 0
  return (direction: 'up' | 'down'): boolean => {
    const step = direction === 'up' ? 1 : -1
    if (pending !== 0 && Math.sign(pending) !== step) pending = 0
    pending += step
    if (Math.abs(pending) < NOTCHES_PER_STEP) return false
    pending = 0
    return true
  }
}
