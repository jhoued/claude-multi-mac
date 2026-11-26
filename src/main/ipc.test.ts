// node --experimental-strip-types src/main/ipc.test.ts
// Every call the preload exposes must have a handle() in the main process; a missing one fails silently in the UI.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const preload = readFileSync(new URL('../preload/index.ts', import.meta.url), 'utf8')
const main = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
const calls = [...preload.matchAll(/call\('([a-zA-Z]+)'\)/g)].map((m) => m[1])
const handled = new Set([...main.matchAll(/handle\('([a-zA-Z]+)'/g)].map((m) => m[1]))

assert.ok(calls.length > 10, 'preload calls not found')
assert.deepEqual(calls.filter((c) => !handled.has(c)), [], 'preload calls without a handle() in main')
console.log('ipc ok')
