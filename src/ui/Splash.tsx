/**
 * R3 — hero splash: ASCII whale + big title + model/effort/cwd/tips/tagline.
 * Shown while the chat is empty. Original art, not a copy of any fork asset.
 * @module dsh-tui/ui/Splash
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'
import { palette } from './theme.js'

/** Original ASCII whale (spouting) + a tasteful title banner. */
const WHALE = [
  '                  .  *  .',
  '               .  |  |  .',
  '            .  .  |  |  .  .',
  '           .  . \\|  |/ .  .',
  '      ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
  '     ████████████████████████▄',
  '    ██████████████████████████▄',
  '    ██ ▄██▀ ▀██▄  ▄██▀ ▀███▀██▄',
  '   ████▀   ▄██▀ ▄██▀ ▄▄████▄▄███▄',
  '   ████████████▀ ▀████▀ ▀██████▄',
  '   ▀████████▀       ▀▀    ██████▄',
  '     ▀▀▀▀▀                 ▀▀▀▀▀▀',
] as const

/** Normalize a model line for display (e.g. `deepseek-v4-flash · max effort`). */
function modelLine(model: string, effort: string): string {
  const base = model === '' ? 'model' : model
  return effort === '' ? base : `${base} · ${effort}`
}

/** The empty-state splash screen. */
export function Splash(props: { model: string; effort: string; cwd: string; gitBranch: string }): JSX.Element {
  const { model, effort, cwd, gitBranch } = props
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {WHALE.map((line, index) => (
        <Text key={index} color={palette.accent}>{line}</Text>
      ))}
      <Box>
        <Text color={palette.title} bold wrap="wrap">
          █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█{'\n'}
          █          D E E P S E E K   H A R N E S S          █{'\n'}
          █▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█
        </Text>
      </Box>
      <Box>
        <Text color={palette.accent}>{modelLine(model, effort)}</Text>
      </Box>
      <Box>
        <Text color={palette.subtitle} dimColor>{cwd}</Text>
        {gitBranch !== '' && <Text color={palette.subtitle} dimColor>{`  ·  git: ${gitBranch}`}</Text>}
      </Box>
      <Box>
        <Text color={palette.tip} dimColor>Tip: /model 切换模型 · /help 查看命令 · Tab 自动补全</Text>
      </Box>
      <Box>
        <Text color={palette.tagline} bold>探索未至之境！</Text>
      </Box>
    </Box>
  )
}