// One drawing for the renderer, app icon, web portal and menu bar:
// Monogram "C" with rounded ends + 3 vertical soundwave bars.

/** Geometric rounded "C" arc on a 0..100 viewBox. */
export const C_ARC = 'M 71.5 23.5 A 31 31 0 1 0 71.5 76.5'

/** Three vertical soundwave bars inside the "C" opening (x, y, width, height, rx). */
export const WAVE_BARS = [
  { x: 42, y: 40, width: 8.5, height: 20, rx: 4.25 },
  { x: 56, y: 30, width: 8.5, height: 40, rx: 4.25 },
  { x: 70, y: 36, width: 8.5, height: 28, rx: 4.25 },
] as const

/** Combined monochrome path for single-path consumers. */
export const MARK =
  'M 71.5 16.5 A 38 38 0 1 0 71.5 83.5 A 7 7 0 0 0 62 73.2 A 24 24 0 1 1 62 26.8 A 7 7 0 0 0 71.5 16.5 Z'
