/**
 * Second-level menu data: builds the option list shown after a command with a
 * `submenu` marker is confirmed (e.g. `/model` → the selectable models).
 * Pure and synchronous; rendering lives in the UI layer.
 * @module dsh-tui/submenu
 */

import type { CliOptions } from './config.js'

/** One selectable option in a command submenu. */
export interface SubmenuEntry {
  /** Display label (provider · model). */
  label: string
  /** Value inserted on confirm (e.g. the model name). */
  value: string
}

/** Build the model submenu entries from the configured models + provider. */
export function modelEntries(options: CliOptions): SubmenuEntry[] {
  return options.models.map(model => ({
    label: `${options.provider} · ${model}`,
    value: model,
  }))
}

/** Build entries for a `CommandSpec.submenu` kind. */
export function submenuEntries(kind: 'models', options: CliOptions): SubmenuEntry[] {
  switch (kind) {
    case 'models':
      return modelEntries(options)
  }
}
