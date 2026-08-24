/**
 * Compact color palette for the TUI. One place to tune the whole look.
 * Tuned for the user's dark terminal (Breeze Dark). A theme system is out of
 * scope in phase 1; this is a single tasteful fixed palette.
 * @module dsh-tui/ui/theme
 */

/** Semantic color tokens. Bright variants read well on a dark background. */
export const palette = {
  accent: 'blueBright',
  accentDim: '#5c7bd8',
  title: 'blueBright',
  subtitle: 'gray',
  meta: 'dim',
  tagline: 'blueBright',
  tip: 'gray',
  userBar: '#1c2536',
  userBorder: 'blueBright',
  userPrefix: 'blueBright',
  assistantBullet: 'cyanBright',
  assistantName: 'cyanBright',
  thinkingLabel: 'magentaBright',
  thinkingText: 'gray',
  toolName: 'yellowBright',
  toolOk: 'greenBright',
  toolError: 'redBright',
  toolRun: 'magentaBright',
  statusBar: '#101722',
  statusBarBorder: '#2a3750',
  statusText: 'gray',
  statusAccent: 'blueBright',
  ok: 'greenBright',
  error: 'redBright',
  spinner: 'cyanBright',
} as const

export type PaletteColor = (typeof palette)[keyof typeof palette]

/** Short human labels for the footer. */
export const labels = {
  free: 'free',
  shortcuts: '? for shortcuts',
} as const