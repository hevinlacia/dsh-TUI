export function shellQuote(args: readonly string[]): string {
  return args.map(quoteOne).join(' ')
}

function quoteOne(value: string): string {
  if (value === '') return "''"
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}
