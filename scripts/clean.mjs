import { rmSync } from 'node:fs'

rmSync(new URL('../lib', import.meta.url), { force: true, recursive: true })
