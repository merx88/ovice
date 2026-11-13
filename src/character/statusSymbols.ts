// The symbols that float above the character's head and say what it is up to,
// modelled in code after the owner's five pictures: a ring with a bold "o"
// inside (orange, yellow or green), a red exclamation mark and three grey Z's.
// Here are their shapes, which status shows which symbol in which colour, and
// how a symbol moves; `StatusBadge.tsx` draws them.
import { Path, Shape, Vector2, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { extrudeRounded } from '../scene/geometry'
import { tokens } from '../theme/tokens'

/**
 * What the symbol above the head says: `idle` is the owner's "resting",
 * `hidden` shows nothing at all.
 */
export type BadgeStatus = 'idle' | 'thinking' | 'working' | 'done' | 'error' | 'hidden'

export type SymbolName = 'ring' | 'exclamation' | 'zzz'

const SYMBOLS: Record<BadgeStatus, SymbolName | null> = {
  idle: 'zzz',
  thinking: 'ring',
  working: 'ring',
  done: 'ring',
  error: 'exclamation',
  hidden: null,
}

const COLORS: Record<BadgeStatus, string | null> = {
  idle: tokens.badgeGrey,
  thinking: tokens.badgeYellow,
  working: tokens.badgeGreen,
  done: tokens.badgeOrange,
  error: tokens.badgeRed,
  hidden: null,
}

/** The symbol that shows `status`, or null for a status that shows nothing. */
export function symbolFor(status: BadgeStatus): SymbolName | null {
  return SYMBOLS[status]
}

/** The colour `status` is shown in, or null for a status that shows nothing. */
export function colorFor(status: BadgeStatus): string | null {
  return COLORS[status]
}

// --- Shapes --------------------------------------------------------------------

/** The side (m) of the square every symbol fills: the ring's outer diameter. */
export const SYMBOL_SIZE = 0.236

const TAU = Math.PI * 2

/**
 * The ring of the owner's picture, in outer diameters: the width of its band,
 * the bold "o" in its middle (wider than tall) with its narrow upright hole,
 * how deep both are, and how far their edges are rounded. Widths are taken
 * where a solid is widest, half-way through it: on its face the rounding
 * leaves the band and the "o" that much narrower on each side and the hole
 * that much wider, which is where the picture was measured (a flat band of
 * 0.11, an "o" of 0.46 by 0.42, a hole of 0.12 by 0.2).
 */
const RING = {
  band: 0.14,
  o: { width: 0.49, height: 0.45 },
  hole: { width: 0.095, height: 0.172 },
  depth: 0.14,
  edge: 0.014,
} as const

/**
 * The exclamation mark, in units of its height: a bar that is wider at the
 * top, a gap, and a round puck seen from its flat side; how deep they are,
 * and how far the edges of each are rounded.
 */
const EXCLAMATION = {
  bar: { height: 0.61, top: 0.33, bottom: 0.23, corner: 0.03, edge: 0.014 },
  gap: 0.08,
  puck: { size: 0.31, edge: 0.022 },
  depth: 0.2,
} as const

/**
 * One Z, in units of its height: its width, how thick its two bars are, how
 * wide its slanted stroke is, and how far its corners are rounded.
 */
const Z = { width: 0.92, bar: 0.25, stroke: 0.37, corner: 0.09 } as const

/**
 * The three Z's, in units of the square they fill between them: how tall each
 * is, where its middle is (x to the right, y up) and how far it is tilted
 * (radians, clockwise being negative). A large one on the left, one as large
 * up to the right, a smaller one below that.
 */
const ZZZ = {
  letters: [
    { height: 0.42, at: [-0.306, 0.029], tilt: 0 },
    { height: 0.42, at: [0.252, 0.248], tilt: (-12 * Math.PI) / 180 },
    { height: 0.31, at: [0.188, -0.29], tilt: (-20 * Math.PI) / 180 },
  ],
  /** How deep a letter is and how far its edges are rounded, in units of its height. */
  depth: 0.36,
  edge: 0.04,
} as const

/** Points round an ellipse, close enough together to read as a curve from close up. */
function ellipse(width: number, height: number, count: number): Vector2[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * TAU
    return new Vector2((Math.cos(angle) * width) / 2, (Math.sin(angle) * height) / 2)
  })
}

/** A flat outline with a hole in it. */
function withHole(outline: Vector2[], hole: Vector2[]): Shape {
  const shape = new Shape(outline)
  shape.holes.push(new Path(hole))
  return shape
}

/** The outline through `corners`, each rounded off over `radius` along its two sides. */
function roundedOutline(corners: readonly (readonly [number, number])[], radius: number): Shape {
  const shape = new Shape()
  corners.forEach(([x, y], i) => {
    const [fromX, fromY] = corners[(i + corners.length - 1) % corners.length]
    const [toX, toY] = corners[(i + 1) % corners.length]
    const before = Math.hypot(fromX - x, fromY - y)
    const after = Math.hypot(toX - x, toY - y)
    const reach = Math.min(radius, before / 2, after / 2)
    const startX = x + ((fromX - x) / before) * reach
    const startY = y + ((fromY - y) / before) * reach
    if (i === 0) shape.moveTo(startX, startY)
    else shape.lineTo(startX, startY)
    shape.quadraticCurveTo(x, y, x + ((toX - x) / after) * reach, y + ((toY - y) / after) * reach)
  })
  shape.closePath()
  return shape
}

/**
 * `outline` as a solid that is `depth` deep, its edges rounded by `edge` and
 * its front and back truly flat. (The rounding has to stay smaller than any
 * curve of the outline, or the faces fold over themselves.)
 */
function solid(outline: Shape, depth: number, edge: number): BufferGeometry {
  const geometry = extrudeRounded(outline, depth, edge)
  // The shared builder shades a face as if it bulged a little towards its rounded edges. That suits furniture;
  // on a narrow band it shows as streaks. Here every triangle that lies in the front or the back faces straight out.
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const isOn = (side: number, i: number) => Math.abs(position.getZ(i) - (side * depth) / 2) < depth * 1e-4
  for (let corner = 0; corner < position.count; corner += 3) {
    for (const side of [1, -1]) {
      if (isOn(side, corner) && isOn(side, corner + 1) && isOn(side, corner + 2)) {
        for (let i = corner; i < corner + 3; i++) normal.setXYZ(i, 0, 0, side)
      }
    }
  }
  return geometry
}

/** Several solids as one geometry, with the box round it centred on the origin. */
function assemble(parts: BufferGeometry[]): BufferGeometry {
  const whole = mergeGeometries(parts)
  if (!whole) throw new Error('The parts of a status symbol do not go together')
  return whole.center()
}

function buildRing(): BufferGeometry {
  const size = SYMBOL_SIZE
  const depth = RING.depth * size
  const edge = RING.edge * size
  const inner = size * (1 - 2 * RING.band)
  const ring = solid(withHole(ellipse(size, size, 96), ellipse(inner, inner, 96)), depth, edge)
  const o = solid(
    withHole(
      ellipse(RING.o.width * size, RING.o.height * size, 72),
      ellipse(RING.hole.width * size, RING.hole.height * size, 48),
    ),
    depth,
    edge,
  )
  return assemble([ring, o])
}

function buildExclamation(): BufferGeometry {
  const size = SYMBOL_SIZE
  const { bar } = EXCLAMATION
  const depth = EXCLAMATION.depth * size
  const barHeight = bar.height * size
  const puckSize = EXCLAMATION.puck.size * size
  const top = (bar.top * size) / 2
  const bottom = (bar.bottom * size) / 2

  const barOutline = roundedOutline(
    [
      [-top, barHeight / 2],
      [-bottom, -barHeight / 2],
      [bottom, -barHeight / 2],
      [top, barHeight / 2],
    ],
    bar.corner * size,
  )
  const barSolid = solid(barOutline, depth, bar.edge * size)
  // The puck hangs below the bar: both are measured from the top of the mark.
  barSolid.translate(0, -barHeight / 2, 0)
  const puck = solid(new Shape(ellipse(puckSize, puckSize, 64)), depth, EXCLAMATION.puck.edge * size)
  puck.translate(0, -(barHeight + EXCLAMATION.gap * size + puckSize / 2), 0)
  return assemble([barSolid, puck])
}

/** The outline of a Z that is `height` tall, with its middle on the origin. */
function zOutline(height: number): Shape {
  const right = (Z.width * height) / 2
  const top = height / 2
  const bar = Z.bar * height
  const stroke = Z.stroke * height
  return roundedOutline(
    [
      [-right, top],
      [-right, top - bar],
      // Down the upper side of the slanted stroke to the lower bar...
      [right - stroke, top - bar],
      [-right, -top + bar],
      [-right, -top],
      [right, -top],
      [right, -top + bar],
      // ...and back up its lower side to the upper bar.
      [-right + stroke, -top + bar],
      [right, top - bar],
      [right, top],
    ],
    Z.corner * height,
  )
}

function buildZzz(): BufferGeometry {
  const letters = ZZZ.letters.map(({ height, at, tilt }) => {
    const letter = solid(zOutline(height), ZZZ.depth * height, ZZZ.edge * height)
    letter.rotateZ(tilt)
    letter.translate(at[0], at[1], 0)
    return letter
  })
  const whole = assemble(letters)
  // The letters were laid out in a square of side 1: bring the larger side of what they fill to the symbols' size.
  whole.computeBoundingBox()
  const { min, max } = whole.boundingBox as NonNullable<typeof whole.boundingBox>
  const scale = SYMBOL_SIZE / Math.max(max.x - min.x, max.y - min.y)
  return whole.scale(scale, scale, scale)
}

const BUILDERS: Record<SymbolName, () => BufferGeometry> = {
  ring: buildRing,
  exclamation: buildExclamation,
  zzz: buildZzz,
}
const built: Partial<Record<SymbolName, BufferGeometry>> = {}

/**
 * The solid shape of `symbol`: facing +z, the box round it centred on the
 * origin, filling a square of `SYMBOL_SIZE`. Built when first asked for and
 * shared from then on.
 */
export function symbolGeometry(symbol: SymbolName): BufferGeometry {
  return (built[symbol] ??= BUILDERS[symbol]())
}

/** A ring with a bold "o" inside it: a task is finished, being thought about or being worked on, by its colour. */
export const ringSymbol = (): BufferGeometry => symbolGeometry('ring')

/** A bar that is wider at the top over a round puck: something went wrong. */
export const exclamationSymbol = (): BufferGeometry => symbolGeometry('exclamation')

/** Three chunky Z's: the character is resting. */
export const zzzSymbol = (): BufferGeometry => symbolGeometry('zzz')

// --- Motion --------------------------------------------------------------------

/**
 * A symbol never spins: it rests turned to one side (radians about the
 * upright axis; negative shows its right-hand side walls, as in the owner's
 * pictures) and sways about that by `swing`, once per `period` (s). Its face
 * can be read at every moment.
 */
export const SWAY = { rest: (-22 * Math.PI) / 180, swing: (10 * Math.PI) / 180, period: 4 } as const

/** A symbol leans towards the viewer by this much (radians), which shows its top as the pictures do. */
export const LEAN = (10 * Math.PI) / 180

/** A symbol drifts up and down by this much (m), once per period (s). */
export const FLOAT = { height: 0.012, period: 3 } as const

/** A change of status makes the symbol swell by up to this share of its size and settle, over this long (s). */
export const POP = { swell: 0.35, duration: 0.5 } as const

export interface SymbolPose {
  /** How far the symbol is turned about its upright axis (radians). */
  turn: number
  /** How far it is above its place (m). */
  lift: number
  /** How large it is, 1 being its own size. */
  scale: number
}

/**
 * How a symbol is held `time` seconds into its life and `sinceChange` seconds
 * after the status last changed (Infinity if it never did). With `still`,
 * for reduced motion, it rests at its angle and does nothing else.
 */
export function symbolPose(time: number, sinceChange: number, still: boolean): SymbolPose {
  if (still) return { turn: SWAY.rest, lift: 0, scale: 1 }
  const progress = Math.min(sinceChange / POP.duration, 1)
  return {
    turn: SWAY.rest + SWAY.swing * Math.sin((time * TAU) / SWAY.period),
    lift: FLOAT.height * Math.sin((time * TAU) / FLOAT.period),
    scale: 1 + POP.swell * Math.sin(progress * Math.PI) * (1 - progress),
  }
}
