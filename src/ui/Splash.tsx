/**
 * R3 — hero art for the empty screen: ASCII whale + big title + tagline.
 * The model/cwd/git/tip meta now lives in the right-hand {@link InfoPanel};
 * this keeps the hero visual-only. Original art, not a copy of any fork asset.
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

/** The empty-state hero splash (visual only). */
export function Splash(): JSX.Element {
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
        <Text color={palette.tagline} bold>探索未至之境！</Text>
      </Box>
    </Box>
  )
}
