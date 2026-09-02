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
/** Default primary column when no width is known (pi's slash default). */
const DEFAULT_PRIMARY_COLUMN_WIDTH = 32
/** Primary column = clamp(widest label + gap, 12, 32) for the slash menu. */
const PRIMARY_GAP = 2
export const MIN_PRIMARY_COLUMN_WIDTH = 12
export const MAX_PRIMARY_COLUMN_WIDTH = 32
/** Below this terminal width the description column is dropped (pi rule). */
const DESCRIPTION_MIN_WIDTH = 40
/** Minimum room the description column needs before it is dropped. */
const MIN_DESCRIPTION_WIDTH = 10

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
  /** pi slash-menu layout (clamp the primary column 12–32). Only for SHORT
   * labels (command names). Omit for long-label selectors: the column then
   * sizes to the widest label up to the available width, so labels like
   * `provider · model` render in full. */
  primaryColumn?: { min: number; max: number }
}): JSX.Element {
  const { rows, selected, width, maxVisible = DEFAULT_MAX_VISIBLE, primaryColumn } = props
  const sel = Math.min(Math.max(selected, 0), rows.length - 1)
  const widest = rows.reduce((acc, row) => Math.max(acc, stringWidth(row.label)), 0) + PRIMARY_GAP
  // Hard cap: the column must fit between the prefix and the terminal edge
  // (labels longer than that still truncate, width-safety only).
  const available = Math.max(MIN_PRIMARY_COLUMN_WIDTH, (width ?? DEFAULT_PRIMARY_COLUMN_WIDTH) - 2)
  const columnWidth = primaryColumn !== undefined
    ? Math.min(primaryColumn.max, Math.max(primaryColumn.min, widest))
    : Math.min(Math.max(MIN_PRIMARY_COLUMN_WIDTH, widest), available)

  // Centered scroll window (pi SelectList): keep the selection mid-list and
  // clamp the window to the bounds.
  const start = rows.length <= maxVisible
    ? 0
    : Math.min(Math.max(sel - Math.floor(maxVisible / 2), 0), rows.length - maxVisible)
  const end = Math.min(start + maxVisible, rows.length)
  const windowed = start > 0 || end < rows.length

  const showDescriptions = width === undefined || width > DESCRIPTION_MIN_WIDTH
  const descWidth = width === undefined ? undefined : width - 2 - columnWidth - 2
  // Each label renders in full up to the column width; the hard terminal
  // guard only kicks in for labels wider than the screen itself.
  const labelMax = Math.min(columnWidth - PRIMARY_GAP, Math.max(1, available - PRIMARY_GAP))

  return (
    <Box flexDirection="column">
      {rows.slice(start, end).map((row, index) => {
        const isSel = start + index === sel
        const prefix = isSel ? '→ ' : '  '
        if (row.meta !== undefined && showDescriptions && descWidth !== undefined && descWidth >= MIN_DESCRIPTION_WIDTH) {
          const label = truncateToWidth(row.label, labelMax)
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
            {`${prefix}${truncateToWidth(row.label, labelMax)}`}
          </Text>
        )
      })}
      {windowed && <Text color={palette.commandMeta}>{`  (${sel + 1}/${rows.length})`}</Text>}
    </Box>
  )
}
