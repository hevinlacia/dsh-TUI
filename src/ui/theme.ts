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
  inputRule: '#2a3750',
  commandName: 'yellowBright',
  commandItem: 'gray',
  commandSelected: 'blueBright',

  // Pixel-whale splash hero (reference style). Four-tone sprite from the
  // DeepSeek pixel whale: deep-navy outline, DeepSeek-blue body, ice-blue
  // belly, white mouth. The `DEEPSEEK`/`HARNESS` wordmark uses a filled blue
  // and a faded blue sub-line. Kept separate from the core semantic tokens so
  // tuning the hero never ripples into the chat UI.
  whaleOutline: '#142660',
  whaleBody: '#4e6fff',
  whaleBelly: '#bee1ff',
  whaleMouth: '#ffffff',
  wordmarkFill: '#4e6fff',
  wordmarkFade: '#93b0e9',
} as const

export type PaletteColor = (typeof palette)[keyof typeof palette]

/** Short human labels for the footer. */
export const labels = {
  free: 'free',
  shortcuts: '? for shortcuts',
} as const