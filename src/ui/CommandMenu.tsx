/**
 * Slash-command dropdown: lists the commands matching the typed token,
 * highlights the current selection, and narrows as the user types. It renders
 * as a compact menu directly above the input rule so the selection feels
 * attached to the prompt.
 * @module dsh-tui/ui/CommandMenu
 */

import type { JSX } from 'react'
import { COMMANDS } from '../commands.js'
import { MenuList, type MenuRow } from './MenuList.js'

/** Render the live command menu (already filtered) above the input. */
export function CommandMenu(props: { matches: string[]; selected: number }): JSX.Element {
  const { matches, selected } = props
  const rows: MenuRow[] = matches.map(name => ({
    label: `/${name}`,
    meta: COMMANDS.find(command => command.name === name)?.description,
  }))
  return <MenuList rows={rows} selected={selected} />
}
