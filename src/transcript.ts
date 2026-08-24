export interface Turn {
  role: 'user' | 'assistant'
  text: string
}

export class Transcript {
  readonly #turns: Turn[] = []

  get turns(): readonly Turn[] {
    return this.#turns
  }

  clear(): void {
    this.#turns.length = 0
  }

  pushUser(text: string): void {
    this.#turns.push({ role: 'user', text })
  }

  pushAssistant(text: string): void {
    if (text.trim() !== '') this.#turns.push({ role: 'assistant', text })
  }

  buildTask(input: string, includeHistory: boolean): string {
    if (!includeHistory || this.#turns.length === 0) return input
    const recent = this.#turns.slice(-8)
    const lines = recent.map(turn => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.text}`)
    return `Continue this terminal conversation. Use the prior transcript only as context.\n\n${lines.join('\n\n')}\n\nUser: ${input}`
  }
}
