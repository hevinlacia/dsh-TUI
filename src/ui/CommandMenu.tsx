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
export function CommandMenu(props: { items: CompletionItem[]; selected: number; width?: number }): JSX.Element {
  const { items, selected, width } = props
  const rows: MenuRow[] = items.map(item => ({ label: item.label, meta: item.meta }))
  return <MenuList rows={rows} selected={selected} width={width} />
}
