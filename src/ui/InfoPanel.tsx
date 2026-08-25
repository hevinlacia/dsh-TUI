/**
 * R3b — right-hand meta card shown beside the (empty) log on first entry:
 * model · cwd/git · tips. A continuous vertical gutter separates it from the
 * chat column so it reads as a compact side panel, not stacked splash text.
 * @module dsh-tui/ui/InfoPanel
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'
import { palette } from './theme.js'

/** Compact info card rendered to the right of the log on a fresh screen. */
export function InfoPanel(props: { model: string; effort: string; cwd: string; gitBranch: string }): JSX.Element {
  const { model, effort, cwd, gitBranch } = props
  const modelLine = model === '' ? 'model' : effort === '' ? model : `${model} · ${effort}`
  const cwdLine = gitBranch === '' ? cwd : `${cwd}  ·  git: ${gitBranch}`
  const rows = [
    { text: modelLine, color: palette.accent, bold: true },
    { text: cwdLine, color: palette.subtitle, dim: true },
    { text: 'Tip: /model 切换模型 · /help 查看命令 · Tab 自动补全', color: palette.tip, dim: true },
  ]
  return (
    <Box flexDirection="column" paddingY={1}>
      {rows.map((row, index) => (
        <Box key={index} flexDirection="row">
          <Text color={palette.meta}>│</Text>
          <Text color={row.color} bold={row.bold} dimColor={row.dim}>{` ${row.text}`}</Text>
        </Box>
      ))}
    </Box>
  )
}
