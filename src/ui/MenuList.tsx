/**
 * Shared list renderer for dropdowns — pi-style: a two-column list (label
 * column clamped, dim meta) with a centered scroll window and a bottom
 * `(n/total)` indicator. Used by the slash-command/argument/path menus.
 * @module dsh-tui/ui/MenuList
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'
import stringWidth from 'string-width'
import { palette } from './theme.js'

/** One row of a dropdown list. */
export interface MenuRow {
  label: string
  /** Optional trailing meta text (description, "(current)"). */
  meta?: string
}

/** Default visible rows before the list scrolls (pi default is 5). */
const DEFAULT_MAX_VISIBLE = 6
/** Clamp for the label column width so meta text starts aligned (pi layout). */
const MIN_LABEL_WIDTH = 8
const MAX_LABEL_WIDTH = 32

/** Render a two-column option list with the selected row highlighted. */
export function MenuList(props: { rows: MenuRow[]; selected: number; maxVisible?: number }): JSX.Element {
  const { rows, selected, maxVisible = DEFAULT_MAX_VISIBLE } = props
  const sel = Math.min(Math.max(selected, 0), rows.length - 1)
  const labelWidth = Math.min(
    MAX_LABEL_WIDTH,
    Math.max(MIN_LABEL_WIDTH, ...rows.map(row => stringWidth(row.label))),
  )

  // Centered scroll window (pi SelectList): keep the selection mid-list and
  // clamp the window to the bounds.
  let visible: Array<{ row: MenuRow; index: number }>
  if (rows.length <= maxVisible) {
    visible = rows.map((row, index) => ({ row, index }))
  } else {
    const start = Math.min(Math.max(sel - Math.floor(maxVisible / 2), 0), rows.length - maxVisible)
    visible = rows.slice(start, start + maxVisible).map((row, offset) => ({ row, index: offset + start }))
  }

  return (
    <Box flexDirection="column">
      {visible.map(({ row, index }) => {
        const isSel = index === sel
        return (
          <Box key={`${index}:${row.label}`} flexDirection="row">
            <Text color={isSel ? palette.commandSelected : palette.commandItem} bold={isSel}>
              {isSel ? '› ' : '  '}
              {/* Pad by CODE UNITS so the DISPLAY width lands on labelWidth
                  for CJK labels too (wide chars count twice in stringWidth). */}
              {row.label.padEnd(row.label.length + (labelWidth - stringWidth(row.label)))}
            </Text>
            {row.meta !== undefined && <Text dimColor>{`  ${row.meta}`}</Text>}
          </Box>
        )
      })}
      {rows.length > maxVisible && (
        <Text dimColor>{`  (${sel + 1}/${rows.length})`}</Text>
      )}
    </Box>
  )
}
