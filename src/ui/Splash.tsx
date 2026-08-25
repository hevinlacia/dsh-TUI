/**
 * R6 — empty-screen hero splash, styled after the DeepSeek pixel-whale
 * reference (the community dsh-TUI opening header we're echoing, design
 * reference only — this is our own implementation on the ink renderer):
 *
 *   ┌──────────────────────┬──────────────────────────────┐
 *   │  pixel whale (40×13)  │  ✦ dsh-TUI  v0.3.0           │
 *   │  half-block 4-tone    │  D E E P S E E K             │
 *   │  sprite: navy outline │  H A R N E S S               │
 *   │  blue body, ice belly,│  deepseek-v4-flash · Max effort
 *   │  white mouth          │  D:\code\projects            │
 *   │   探索未至之境！         │  Tip: /model /help /tips      │
 *   └──────────────────────┴──────────────────────────────┘
 *
 * Fish-style sprite is a 40×25 palette grid (D=navy outline, B=blue body,
 * L=ice belly, W=white mouth, `.` transparent) rendered with the half-block
 * technique: every terminal cell uses `▀` and packs two palette cells into
 * one glyph — foreground color = upper pixel, background color = lower
 * pixel — so the whale shows at 40 columns × 13 rows with square pixels.
 * `DEEPSEEK`/`HARNESS` are drawn in a 5-column-wide block font.
 *
 * All data (model / effort / cwd / gitBranch) is passed in; this is a
 * pure visual hero. Colors come from {@link palette} whale/wordmark tokens.
 * @module dsh-tui/ui/Splash
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'
import { palette } from './theme.js'

/** Palette-cell sprite: `D` outline · `B` body · `L` belly · `W` mouth · `.` transparent. */
const SPRITE: readonly string[] = [
  '........................................',
  '........................................',
  '.........................D..............',
  '.......................DBBD......D......',
  '.......................DBBBD....DBD.....',
  '.......................DBBBBD..DBBD.....',
  '.......................DBBBBBDDBBBD.....',
  '......DDDDDDDDDD.......DBBBBBBBBBD......',
  '.....DBBBBBBBBBBBDD.....DBBBBBBBD.......',
  '....DBBBBBBBBBBBBBBDD...DBBBBBBD........',
  '...DBBBBBBBBBBBBBBBBBDD.DBBBBBD.........',
  '..DBBBBBBBBBBBBBBBBBBBDDBBBBBD..........',
  '..DBBBBDBBBBBBBBBBBBBBBBBBBBBBD.........',
  '..DBBBBDBBBBBBBBBBBBBBBBBBBBD...........',
  '..DBBBBBBBBBBBBBBBBBBBBBBBBBD...........',
  '..DBBBBBBBBBBBBBBBBBBBBBBBBD............',
  '..DBBBWWWWWWWWWWBBBDBBBBBBD.............',
  '..DDBWWWWWWWWWWWWWBBBDBBBBD.............',
  '...DLLWWWWWWWWWWWWBBBBDBBD..............',
  '....DLLLWWWWWWWWWBBBBBDBBD..............',
  '.....DDLLLWWWWWWLLLDBBBBBBD.............',
  '.......DLLLLLLLLLLDDBBBBBBD.............',
  '..........DDDDDDDDD..DDDDDD.............',
  '........................................',
  '........................................',
] as const

/** sprite palette cell -> true-color. */
const SPRITE_COLOR: Record<string, string> = {
  D: palette.whaleOutline,
  B: palette.whaleBody,
  L: palette.whaleBelly,
  W: palette.whaleMouth,
}

/**
 * Render the palette sprite to 13 half-block rows. Each row packs two sprite
 * rows (upper / lower) into `▀` cells, using color=fg (upper) and
 * backgroundColor=bg (lower) per cell, so a single `▀` shows both pixels.
 * Consecutive cells sharing a style are run-length packed per cell anyway
 * (ink re-renders SGR per <Text>); we group by (fg,bg) to minimise nodes.
 */
type Cell = { text: string; fg: string; bg: string | undefined }

function spriteRows(): Cell[][] {
  const rows: Cell[][] = []
  for (let r = 0; r < SPRITE.length; r += 2) {
    const upper = SPRITE[r]!
    const lower = SPRITE[r + 1] ?? ''
    const line: Cell[] = []
    for (let x = 0; x < upper.length; x += 1) {
      const up = SPRITE_COLOR[upper[x]!]
      const lo = SPRITE_COLOR[lower[x]!]
      const fg = up ?? lo
      const bg = up && lo ? lo : undefined
      if (fg === undefined) continue
      const text = up && lo ? '▀' : up ? '▀' : '▄'
      line.push({ text, fg, bg })
    }
    rows.push(line)
  }
  return rows
}

/** Pre-computed half-block rows for the settled whale. */
const WHALE_ROWS = spriteRows()

// ─── `DEEPSEEK` / `HARNESS` in a 5-column-wide block font ────────────────
// Each glyph is 5 columns wide; `.` is transparent. Only the letters used
// are defined; anything else falls back to a hollow box so a typo surfaces.
const GLYPH: Record<string, readonly string[]> = {
  D: ['█▀▀▀▄', '█...█', '█...█', '█...█', '█▄▄▄▀'],
  E: ['█▀▀▀▀', '█....', '█▀▀▀.', '█....', '█▄▄▄▄'],
  P: ['█▀▀▀▄', '█...█', '█▄▄▄▀', '█....', '█....'],
  S: ['█▀▀▀▀', '█....', '.▀▀▀▄', '....█', '█▄▄▄▀'],
  K: ['█...█', '█.█..', '██...', '█.█..', '█...█'],
  H: ['█...█', '█...█', '█▀▀▀█', '█...█', '█...█'],
  A: ['.▄▀▄.', '█...█', '█▀▀▀█', '█...█', '█...█'],
  R: ['█▀▀▀▄', '█...█', '█▄▄▄▀', '█.█..', '█...█'],
  N: ['█...█', '██..█', '█.█.█', '█..██', '█...█'],
}
const FALLBACK: readonly string[] = ['▄▄▄▄▄', '█...█', '█...█', '█...█', '▀▀▀▀▀']

/** Build a 5-row block-font word (one cell per glyph column, `.` transparent). */
function blockWord(word: string): string[] {
  const letters = word.split('')
  return [0, 1, 2, 3, 4].map(r => letters.map(ch => (GLYPH[ch] ?? FALLBACK)[r]).join(' '))
}

const DEEPSEEK = blockWord('DEEPSEEK')
const HARNESS = blockWord('HARNESS')

// ─── Meta/tips (right column under the wordmark) ───────────────────────────
type Meta = { text: string; color: string; bold?: boolean; dim?: boolean; sub?: boolean }

function metaRows(model: string, effort: string, cwd: string, gitBranch: string): Meta[] {
  const modelLine = model === '' ? 'model' : effort === '' ? model : `${model} · ${effort}`
  const cwdLine = gitBranch === '' ? cwd : `${cwd}  ·  git: ${gitBranch}`
  return [
    { text: modelLine, color: palette.subtitle, dim: true },
    { text: cwdLine, color: palette.subtitle, dim: true },
    { text: 'Tip: /model 切换模型 · /help 查看命令 · /tips 更多技巧', color: palette.subtitle, dim: true },
  ]
}

/** Render a wordmark row: transparent `.` cells become spaces (no color). */
function renderBlockRow(row: string, color: string, key: string): JSX.Element {
  return (
    <Text key={key} color={color}>
      {row.split('').map((ch, i) => (ch === '.' ? ' ' : ch)).join('')}
    </Text>
  )
}

/** The empty-state hero splash (visual only). */
export function Splash(props: {
  model: string
  effort: string
  cwd: string
  gitBranch: string
}): JSX.Element {
  const { model, effort, cwd, gitBranch } = props
  const meta = metaRows(model, effort, cwd, gitBranch)

  return (
    <Box flexDirection="row" width="100%" justifyContent="center" paddingX={2} paddingY={1}>
      {/* Left column: half-block whale + tagline */}
      <Box flexDirection="column" flexShrink={0}>
        {WHALE_ROWS.map((line, i) => (
          <Text key={`w${i}`}>
            {line.map((cell, j) => (
              <Text key={j} color={cell.fg} backgroundColor={cell.bg}>{cell.text}</Text>
            ))}
          </Text>
        ))}
        <Text color={palette.tagline} bold>探索未至之境！</Text>
      </Box>

      {/* Right column: wordmark (filled) + sub-wordmark (faded) + meta */}
      <Box flexDirection="column" marginLeft={6} flexShrink={1}>
        <Text color={palette.accent}>✦ dsh-TUI</Text>
        {DEEPSEEK.map((r, i) => renderBlockRow(r, palette.wordmarkFill, `m${i}`))}
        {HARNESS.map((r, i) => renderBlockRow(r, palette.wordmarkFade, `s${i}`))}
        <Box flexDirection="column" marginTop={1}>
          {meta.map((line, i) => (
            <Text key={`meta${i}`} color={line.color} bold={line.bold} dimColor={line.dim}>
              {line.text}
            </Text>
          ))}
        </Box>
      </Box>
    </Box>
  )
}
