/**
 * Shared list renderer for dropdowns: a column of rows with a highlighted
 * selection marker. Used by both the slash-command menu and second-level
 * option submenus (e.g. the model picker).
 * @module dsh-tui/ui/MenuList
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'
import { palette } from './theme.js'

/** One row of a dropdown list. */
export interface MenuRow {
  label: string
  /** Optional trailing meta text (description, "(current)"). */
  meta?: string
}

/** Render a single-column option list with the selected row highlighted. */
export function MenuList(props: { rows: MenuRow[]; selected: number }): JSX.Element {
  const { rows, selected } = props
  const sel = Math.min(Math.max(selected, 0), rows.length - 1)
  return (
    <Box flexDirection="column">
      {rows.map((row, index) => {
        const isSel = index === sel
        return (
          <Box key={row.label} flexDirection="row">
            <Text color={isSel ? palette.commandSelected : palette.commandItem} bold={isSel}>
              {isSel ? '› ' : '  '}
              {row.label}
            </Text>
            {row.meta !== undefined && <Text dimColor>{`  ${row.meta}`}</Text>}
          </Box>
        )
      })}
    </Box>
  )
}
