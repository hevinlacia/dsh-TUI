/**
 * Shared list renderer for dropdowns — a faithful port of pi's SelectList
 * visual spec: `→ ` marker on the selected row, a primary column clamped to
 * 12–32 (+2 gap), description column only on wide terminals (>40 cols),
 * selected line rendered entirely in the accent color, muted descriptions,
 * and a bottom `  (n/total)` scroll indicator. No borders anywhere.
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

/** Visible rows before the list scrolls (pi default: 5). */
const DEFAULT_MAX_VISIBLE = 5
/** Primary column = clamp(widest label + gap, 12, 32), like pi's slash layout. */
const PRIMARY_GAP = 2
const MIN_PRIMARY_COLUMN_WIDTH = 12
const MAX_PRIMARY_COLUMN_WIDTH = 32
/** Below this terminal width the description column is dropped (pi rule). */
const DESCRIPTION_MIN_WIDTH = 40

/** Truncate `text` to `max` display columns (CJK-aware). */
function truncateToWidth(text: string, max: number): string {
  if (stringWidth(text) <= max) return text
  let out = ''
  let width = 0
  for (const ch of text) {
    const w = stringWidth(ch)
    if (width + w > max) break
    out += ch
    width += w
  }
  return out
}

/** Render a pi-style option list with the selected row highlighted. */
export function MenuList(props: {
  rows: MenuRow[]
  selected: number
  /** Terminal content width; the description column needs > 40 columns. */
  width?: number
  maxVisible?: number
}): JSX.Element {
  const { rows, selected, width, maxVisible = DEFAULT_MAX_VISIBLE } = props
  const sel = Math.min(Math.max(selected, 0), rows.length - 1)
  const widest = rows.reduce((acc, row) => Math.max(acc, stringWidth(row.label)), 0)
  const columnWidth = Math.min(
    MAX_PRIMARY_COLUMN_WIDTH,
    Math.max(MIN_PRIMARY_COLUMN_WIDTH, widest + PRIMARY_GAP),
  )

  // Centered scroll window (pi SelectList): keep the selection mid-list and
  // clamp the window to the bounds.
  const start = rows.length <= maxVisible
    ? 0
    : Math.min(Math.max(sel - Math.floor(maxVisible / 2), 0), rows.length - maxVisible)
  const end = Math.min(start + maxVisible, rows.length)
  const windowed = start > 0 || end < rows.length

  const showDescriptions = width === undefined || width > DESCRIPTION_MIN_WIDTH
  const descWidth = width === undefined ? undefined : width - 2 - columnWidth - 2

  return (
    <Box flexDirection="column">
      {rows.slice(start, end).map((row, index) => {
        const isSel = start + index === sel
        const prefix = isSel ? '→ ' : '  '
        if (row.meta !== undefined && showDescriptions && descWidth !== undefined && descWidth >= 10) {
          const label = truncateToWidth(row.label, columnWidth - PRIMARY_GAP)
          const desc = truncateToWidth(row.meta, descWidth)
          if (isSel) {
            // pi renders the WHOLE selected line in the accent color.
            return (
              <Text key={`${start + index}:${row.label}`} color={palette.commandSelected}>
                {`${prefix}${label}${' '.repeat(Math.max(1, columnWidth - stringWidth(label)))}${desc}`}
              </Text>
            )
          }
          return (
            <Text key={`${start + index}:${row.label}`}>
              {prefix}{label}{' '.repeat(Math.max(1, columnWidth - stringWidth(label)))}
              <Text color={palette.commandMeta}>{desc}</Text>
            </Text>
          )
        }
        return (
          <Text key={`${start + index}:${row.label}`} color={isSel ? palette.commandSelected : undefined}>
            {`${prefix}${truncateToWidth(row.label, columnWidth - PRIMARY_GAP)}`}
          </Text>
        )
      })}
      {windowed && <Text color={palette.commandMeta}>{`  (${sel + 1}/${rows.length})`}</Text>}
    </Box>
  )
}
