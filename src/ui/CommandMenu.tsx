/**
 * Slash-command dropdown: lists the commands matching the typed token,
 * highlights the current selection, and narrows as the user types. It renders
 * as a compact menu directly above the input rule so the selection feels
 * attached to the prompt.
 * @module dsh-tui/ui/CommandMenu
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'
import { COMMANDS } from '../commands.js'
import { palette } from './theme.js'

/** Render the live command menu (already filtered) above the input. */
export function CommandMenu(props: { matches: string[]; selected: number }): JSX.Element {
  const { matches, selected } = props
  const sel = Math.min(Math.max(selected, 0), matches.length - 1)
  return (
    <Box flexDirection="column" paddingX={1}>
      {matches.map((name, index) => {
        const spec = COMMANDS.find(command => command.name === name)
        const isSel = index === sel
        return (
          <Box key={name} flexDirection="row">
            <Text color={isSel ? palette.commandSelected : palette.commandItem} bold={isSel}>
              {isSel ? '› /' : '  /'}
              {name}
            </Text>
            <Text dimColor>{`  ${spec?.description ?? ''}`}</Text>
          </Box>
        )
      })}
    </Box>
  )
}
