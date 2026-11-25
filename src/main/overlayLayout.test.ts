// node --experimental-strip-types src/main/overlayLayout.test.ts
import assert from 'node:assert/strict'
import { overlayLayout, PAD, TOP } from './overlayLayout.ts'

const area = { x: 0, y: 33, width: 1512, height: 949 } // below the menu bar, above the Dock

// floating window: border sits outside, pill straddles the top line
const a = overlayLayout({ x: 200, y: 200, width: 800, height: 500 }, area)
assert.deepEqual(a.bounds, { x: 200 - PAD, y: 200 - TOP, width: 800 + 2 * PAD, height: 500 + PAD + TOP })
assert.deepEqual(a.box, { left: PAD - 2, top: TOP - 2, right: PAD - 2, bottom: PAD - 2 })
assert.equal(a.inside, false)

// maximized window: overlay = window, line inside on every side, pill inside the top
const m = overlayLayout({ x: 0, y: 33, width: 1512, height: 949 }, area)
assert.deepEqual(m.bounds, { x: 0, y: 33, width: 1512, height: 949 })
assert.deepEqual(m.box, { left: 0, top: 0, right: 0, bottom: 0 })
assert.equal(m.inside, true)
assert.ok(m.pillTop > 0) // badge sits just inside the top line
assert.ok(a.pillTop >= 0) // badge fits above a floating window

// window touching only the left edge: inside on the left, outside elsewhere
const l = overlayLayout({ x: 0, y: 300, width: 600, height: 400 }, area)
assert.equal(l.box.left, 0)
assert.equal(l.box.right, PAD - 2)
console.log('overlayLayout ok')
