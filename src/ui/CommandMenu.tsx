/**
 * Slash-command dropdown: renders the completion items produced by the engine
 * (commands, argument candidates, or path entries) above the input rule so
 * the selection feels attached to the prompt.
 * @module dsh-tui/ui/CommandMenu
 */

import type { JSX } from 'react'
import type { CompletionItem } from '../completion.js'
import { MenuList, type MenuRow } from './MenuList.js'

/** Render the live completion menu (already filtered by the engine). */
export function CommandMenu(props: {
  items: CompletionItem[]
  selected: number
  width?: number
  /** Clamp the primary column (pi slash spec) — only for short command names. */
  clampPrimary?: boolean
}): JSX.Element {
  const { items, selected, width, clampPrimary = false } = props
  const rows: MenuRow[] = items.map(item => ({ label: item.label, meta: item.meta }))
  return <MenuList rows={rows} selected={selected} width={width} primaryColumn={clampPrimary ? { min: 12, max: 32 } : undefined} />
}
