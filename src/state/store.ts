/**
 * Tiny external store + React binding. Deliberately dependency-free: one
 * mutable snapshot, subscription, and a `useSyncExternalStore` hook.
 * @module dsh-tui/state/store
 */

import { useSyncExternalStore } from 'react'

/** Minimal external store over an immutable snapshot. */
export class Store<S> {
  private state: S
  private readonly listeners = new Set<() => void>()

  constructor(initial: S) {
    this.state = initial
  }

  getState(): S {
    return this.state
  }

  setState(updater: (state: S) => S): void {
    const next = updater(this.state)
    if (next === this.state) return
    this.state = next
    for (const listener of this.listeners) listener()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

/** React selector hook over a {@link Store}. */
export function useStore<S, T>(store: Store<S>, selector: (state: S) => T): T {
  return useSyncExternalStore(
    listener => store.subscribe(listener),
    () => selector(store.getState()),
  )
}