/**
 * Second-level menu data: builds the option list shown after a command with a
 * `submenu` marker is confirmed (e.g. `/model` → the selectable models from
 * dsh's settings document). Pure and synchronous; rendering lives in the UI.
 * @module dsh-tui/submenu
 */

import type { CliOptions } from './config.js'

/** One selectable option in a command submenu. */
export interface SubmenuEntry {
  /** Display label (provider · model name). */
  label: string
  /** Value inserted on confirm (the model id). */
  value: string
}

/** Build the model submenu from the configured models + their providers. */
export function modelEntries(options: CliOptions): SubmenuEntry[] {
  return options.modelOptions.map(model => ({
    label: `${model.provider} · ${model.name}`,
    value: model.id,
  }))
}

/** Build entries for a `CommandSpec.submenu` kind. */
export function submenuEntries(kind: 'models', options: CliOptions): SubmenuEntry[] {
  switch (kind) {
    case 'models':
      return modelEntries(options)
  }
}
