export type Rect = { x: number; y: number; width: number; height: number }
export type Layout = { bounds: Rect; box: { top: number; left: number; right: number; bottom: number }; pillTop: number; inside: boolean }

export const PAD = 12 // room around the window for the glow
export const TOP = 16 // a little more on top for the name pill
const LINE = 2
export const PILL = 26 // name badge height

/**
 * Where to put the border overlay for a window. The overlay is clamped to the visible screen area
 * (below the menu bar, above the Dock); on any side where the window touches that edge the line
 * moves inside the window, and the name pill drops inside the top when there is no room above.
 */
export function overlayLayout(win: Rect, area: Rect): Layout {
  const want = { x: win.x - PAD, y: win.y - TOP, r: win.x + win.width + PAD, b: win.y + win.height + PAD }
  const x = Math.max(want.x, area.x)
  const y = Math.max(want.y, area.y)
  const r = Math.min(want.r, area.x + area.width)
  const b = Math.min(want.b, area.y + area.height)
  const box = {
    left: Math.max(0, win.x - x - LINE),
    top: Math.max(0, win.y - y - LINE),
    right: Math.max(0, r - (win.x + win.width) - LINE),
    bottom: Math.max(0, b - (win.y + win.height) - LINE)
  }
  const roomAbove = win.y - y >= PILL / 2 + LINE // room for the pill to straddle the top line
  return {
    bounds: { x, y, width: Math.max(0, r - x), height: Math.max(0, b - y) },
    box,
    // outside: centred on the top line; inside: just below it
    pillTop: roomAbove ? box.top + LINE / 2 - PILL / 2 : box.top + LINE + 6,
    inside: !roomAbove
  }
}
