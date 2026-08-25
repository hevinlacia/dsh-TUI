/**
 * Second-level menu for `/model`: shows each selectable model as a
 * `provider · model` row, marking the current one. Reuses {@link MenuList}.
 * @module dsh-tui/ui/ModelSubmenu
 */

import type { JSX } from 'react'
import type { SubmenuEntry } from '../submenu.js'
import { MenuList, type MenuRow } from './MenuList.js'

/** Render the model picker (provider · model) above the input. */
export function ModelSubmenu(props: { entries: SubmenuEntry[]; currentModel: string; selected: number }): JSX.Element {
  const { entries, currentModel, selected } = props
  const rows: MenuRow[] = entries.map(entry => ({
    label: entry.label,
    meta: entry.value === currentModel ? '(current)' : undefined,
  }))
  return <MenuList rows={rows} selected={selected} />
}
