import { Box3, Vector3, type BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { tokens } from '../theme/tokens'
import {
  colorFor,
  exclamationSymbol,
  FLOAT,
  LEAN,
  POP,
  ringSymbol,
  SWAY,
  symbolFor,
  symbolGeometry,
  symbolPose,
  SYMBOL_SIZE,
  zzzSymbol,
  type BadgeStatus,
  type SymbolName,
} from './statusSymbols'

const SYMBOLS: Record<SymbolName, () => BufferGeometry> = {
  ring: ringSymbol,
  exclamation: exclamationSymbol,
  zzz: zzzSymbol,
}
const NAMES = Object.keys(SYMBOLS) as SymbolName[]
const DEGREES = Math.PI / 180

function boundsOf(geometry: BufferGeometry): Box3 {
  geometry.computeBoundingBox()
  return geometry.boundingBox as Box3
}

function sizeOf(geometry: BufferGeometry): Vector3 {
  return boundsOf(geometry).getSize(new Vector3())
}

/** Every vertex of a geometry, as `[x, y, z]`. */
function vertices(geometry: BufferGeometry): [number, number, number][] {
  const position = geometry.getAttribute('position')
  return Array.from({ length: position.count }, (_, i) => [position.getX(i), position.getY(i), position.getZ(i)])
}

/**
 * The separate pieces a geometry is made of, each as the box round it,
 * largest first: triangles that share a corner belong to one piece.
 */
function pieces(geometry: BufferGeometry): Box3[] {
  const points = vertices(geometry)
  expect(geometry.getIndex()).toBeNull()
  const parent = points.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const join = (a: number, b: number) => {
    parent[find(a)] = find(b)
  }
  const first = new Map<string, number>()
  points.forEach((point, i) => {
    const key = point.map((value) => Math.round(value * 1e6)).join(',')
    const seen = first.get(key)
    if (seen === undefined) first.set(key, i)
    else join(i, seen)
    // The three corners of a triangle follow one another.
    if (i % 3 !== 0) join(i, i - 1)
  })
  const boxes = new Map<number, Box3>()
  points.forEach((point, i) => {
    const root = find(i)
    const box = boxes.get(root) ?? new Box3()
    boxes.set(root, box.expandByPoint(new Vector3(...point)))
  })
  const area = (box: Box3) => (box.max.x - box.min.x) * (box.max.y - box.min.y)
  return [...boxes.values()].sort((a, b) => area(b) - area(a))
}

/**
 * The triangles that make up the flat fronts (`side` 1) and backs (-1) of a
 * symbol's solids: those that lie at one depth. `first` is the index of the
 * triangle's first corner.
 */
function faces(geometry: BufferGeometry) {
  const points = vertices(geometry)
  const found: { first: number; side: 1 | -1; corners: [number, number, number][] }[] = []
  for (let first = 0; first < points.length; first += 3) {
    const corners = [points[first], points[first + 1], points[first + 2]]
    const depth = corners[0][2]
    if (corners.every(([, , z]) => Math.abs(z - depth) < 1e-9)) found.push({ first, side: depth > 0 ? 1 : -1, corners })
  }
  return found
}

describe('the status symbols', () => {
  it.each(NAMES)('%s: its bounding box is centred on the origin', (name) => {
    const centre = boundsOf(SYMBOLS[name]()).getCenter(new Vector3())
    expect(Math.abs(centre.x)).toBeLessThan(1e-4)
    expect(Math.abs(centre.y)).toBeLessThan(1e-4)
    expect(Math.abs(centre.z)).toBeLessThan(1e-4)
  })

  it.each(NAMES)('%s: no position is NaN, and every vertex has a normal of length one', (name) => {
    const geometry = SYMBOLS[name]()
    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')
    expect(position.count).toBeGreaterThan(100)
    expect(normal.count).toBe(position.count)
    let notNumbers = 0
    let shortest = Infinity
    let longest = 0
    for (let i = 0; i < position.count; i++) {
      if (!Number.isFinite(position.getX(i) + position.getY(i) + position.getZ(i))) notNumbers++
      const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))
      shortest = Math.min(shortest, length)
      longest = Math.max(longest, length)
    }
    expect(notNumbers).toBe(0)
    expect(shortest).toBeCloseTo(1, 3)
    expect(longest).toBeCloseTo(1, 3)
  })

  it.each(NAMES)('%s is built once and handed out again', (name) => {
    expect(SYMBOLS[name]()).toBe(SYMBOLS[name]())
    expect(symbolGeometry(name)).toBe(SYMBOLS[name]())
  })

  it.each(NAMES)('%s is chunky: between a tenth and a quarter as deep as the square it fills', (name) => {
    const depth = sizeOf(SYMBOLS[name]()).z / SYMBOL_SIZE
    expect(depth).toBeGreaterThan(0.1)
    expect(depth).toBeLessThan(0.25)
  })

  it.each(NAMES)('%s has fronts and backs that lie flat and face straight out', (name) => {
    const geometry = SYMBOLS[name]()
    const normal = geometry.getAttribute('normal')
    const area = { front: 0, back: 0 }
    let tilted = 0
    for (const { first, side, corners: [a, b, c] } of faces(geometry)) {
      area[side === 1 ? 'front' : 'back'] += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2
      for (let i = first; i < first + 3; i++) if (normal.getZ(i) !== side) tilted++
    }
    expect(tilted).toBe(0)
    expect(area.front).toBeGreaterThan(0.002)
    expect(area.back).toBeCloseTo(area.front, 6)
  })

  // Rounding an edge further than its outline curves folds the face over itself, which shows as a tangle.
  it.each(NAMES)('%s has fronts without a fold: no two of their triangles overlap', (name) => {
    const CELL = 0.0005
    const covered = new Map<number, number>()
    let overlaps = 0
    for (const { side, corners: [a, b, c] } of faces(SYMBOLS[name]())) {
      if (side !== 1) continue
      const twice = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      if (Math.abs(twice) < 1e-12) continue
      const xs = [a[0], b[0], c[0]]
      const ys = [a[1], b[1], c[1]]
      for (let i = Math.ceil(Math.min(...xs) / CELL); i <= Math.floor(Math.max(...xs) / CELL); i++) {
        for (let j = Math.ceil(Math.min(...ys) / CELL); j <= Math.floor(Math.max(...ys) / CELL); j++) {
          const [x, y] = [i * CELL, j * CELL]
          // Where the point lies between the three corners; well inside the triangle, all three are clearly positive.
          const u = ((b[0] - x) * (c[1] - y) - (b[1] - y) * (c[0] - x)) / twice
          const v = ((c[0] - x) * (a[1] - y) - (c[1] - y) * (a[0] - x)) / twice
          if (u < 0.02 || v < 0.02 || 1 - u - v < 0.02) continue
          const key = i * 100_000 + j
          const times = (covered.get(key) ?? 0) + 1
          covered.set(key, times)
          if (times > 1) overlaps++
        }
      }
    }
    expect(covered.size).toBeGreaterThan(1000)
    expect(overlaps).toBe(0)
  })

  it.each(NAMES)('%s has soft edges: its front face is smaller than its outline', (name) => {
    const points = vertices(SYMBOLS[name]())
    const front = Math.max(...points.map(([, , z]) => z))
    const widest = Math.max(...points.map(([x]) => Math.abs(x)))
    const onFront = Math.max(...points.filter(([, , z]) => z > front - 1e-6).map(([x]) => Math.abs(x)))
    expect(widest - onFront).toBeGreaterThan(0.001)
    expect(widest - onFront).toBeLessThan(0.01)
  })
})

describe('the ring', () => {
  const D = SYMBOL_SIZE

  it('is as wide as the badge it replaces: 0.236 m across', () => {
    expect(SYMBOL_SIZE).toBe(0.236)
    const size = sizeOf(ringSymbol())
    expect(Math.abs(size.x - 0.236)).toBeLessThan(0.002)
    expect(Math.abs(size.y - 0.236)).toBeLessThan(0.002)
  })

  it('is two pieces: a ring, and a bold o inside it that touches nothing', () => {
    const [ring, o, ...rest] = pieces(ringSymbol())
    expect(rest).toEqual([])
    expect(ring.getSize(new Vector3()).x).toBeCloseTo(D, 3)
    // The o of the owner's picture: wider than tall, about half the ring's diameter.
    const size = o.getSize(new Vector3())
    expect(size.x / D).toBeGreaterThan(0.47)
    expect(size.x / D).toBeLessThan(0.52)
    expect(size.y / D).toBeGreaterThan(0.43)
    expect(size.y / D).toBeLessThan(0.47)
    expect(size.x).toBeGreaterThan(size.y)
    expect(o.getCenter(new Vector3()).length()).toBeLessThan(1e-4)
  })

  // What the owner's picture shows on the symbol's face, in outer diameters: a flat band of 0.11, and in the
  // o, which is 0.47 by 0.43 where it is flat, an upright hole of 0.12 by 0.2.
  const onFace = () => {
    const points = vertices(ringSymbol())
    const front = Math.max(...points.map(([, , z]) => z))
    return points.filter(([, , z]) => z > front - 1e-6)
  }

  it('shows a flat band about a ninth of its diameter wide', () => {
    const radii = onFace()
      .map(([x, y]) => Math.hypot(x, y))
      .filter((radius) => radius > 0.3 * D)
    const band = (Math.max(...radii) - Math.min(...radii)) / D
    expect(band).toBeGreaterThan(0.1)
    expect(band).toBeLessThan(0.125)
  })

  it('shows a narrow upright hole in the o', () => {
    const o = onFace().filter(([x, y]) => Math.hypot(x, y) < 0.3 * D)
    const width = (2 * Math.min(...o.filter(([, y]) => Math.abs(y) < 0.01 * D).map(([x]) => Math.abs(x)))) / D
    const height = (2 * Math.min(...o.filter(([x]) => Math.abs(x) < 0.01 * D).map(([, y]) => Math.abs(y)))) / D
    expect(width).toBeGreaterThan(0.108)
    expect(width).toBeLessThan(0.138)
    expect(height).toBeGreaterThan(0.185)
    expect(height).toBeLessThan(0.215)
    // The o itself, where it is flat.
    expect((2 * Math.max(...o.map(([x]) => Math.abs(x)))) / D).toBeGreaterThan(0.45)
    expect((2 * Math.max(...o.map(([x]) => Math.abs(x)))) / D).toBeLessThan(0.49)
    expect((2 * Math.max(...o.map(([, y]) => Math.abs(y)))) / D).toBeGreaterThan(0.41)
    expect((2 * Math.max(...o.map(([, y]) => Math.abs(y)))) / D).toBeLessThan(0.45)
  })

  it('leaves a clear gap between the band and the o all round', () => {
    const radii = vertices(ringSymbol()).map(([x, y]) => Math.hypot(x, y))
    const o = Math.max(...radii.filter((radius) => radius < 0.3 * D))
    const band = Math.min(...radii.filter((radius) => radius > 0.3 * D))
    expect((band - o) / D).toBeGreaterThan(0.08)
  })
})

describe('the exclamation mark', () => {
  it('fills the same square: its larger side is between 0.22 and 0.24 m', () => {
    const size = sizeOf(exclamationSymbol())
    expect(Math.max(size.x, size.y)).toBeGreaterThan(0.22)
    expect(Math.max(size.x, size.y)).toBeLessThan(0.24)
    expect(size.y).toBeGreaterThan(size.x)
  })

  it('is a bar over a round puck, with a gap between them', () => {
    const [bar, puck, ...rest] = pieces(exclamationSymbol())
    expect(rest).toEqual([])
    expect(bar.min.y).toBeGreaterThan(puck.max.y + 0.01)
    const puckSize = puck.getSize(new Vector3())
    expect(puckSize.x).toBeCloseTo(puckSize.y, 4)
    // Both stand on the same upright line.
    expect(bar.getCenter(new Vector3()).x).toBeCloseTo(0, 4)
    expect(puck.getCenter(new Vector3()).x).toBeCloseTo(0, 4)
    // The bar is about twice as tall as the puck, as in the owner's picture.
    const barSize = bar.getSize(new Vector3())
    expect(barSize.y / puckSize.y).toBeGreaterThan(1.8)
    expect(barSize.y / puckSize.y).toBeLessThan(2.2)
  })

  it('has a bar that is wider at the top', () => {
    const [bar] = pieces(exclamationSymbol())
    const inBar = vertices(exclamationSymbol()).filter(([, y]) => y >= bar.min.y)
    const widthNear = (level: number) =>
      2 * Math.max(...inBar.filter(([, y]) => Math.abs(y - level) < 0.012).map(([x]) => Math.abs(x)))
    const top = widthNear(bar.max.y)
    const bottom = widthNear(bar.min.y)
    expect(top / bottom).toBeGreaterThan(1.25)
    expect(top / bottom).toBeLessThan(1.6)
  })
})

describe('the three Z’s', () => {
  it('fill the same square: the larger side is between 0.22 and 0.24 m, the other not much less', () => {
    const size = sizeOf(zzzSymbol())
    const larger = Math.max(size.x, size.y)
    expect(larger).toBeGreaterThan(0.22)
    expect(larger).toBeLessThan(0.24)
    expect(Math.min(size.x, size.y)).toBeGreaterThan(0.9 * larger)
  })

  it('are a large one on the left, one as large up to the right and a smaller one below that', () => {
    const letters = pieces(zzzSymbol())
    expect(letters).toHaveLength(3)
    const [a, b, small] = letters
    const [left, upper] = a.getCenter(new Vector3()).x < b.getCenter(new Vector3()).x ? [a, b] : [b, a]
    const centre = (box: Box3) => box.getCenter(new Vector3())
    const height = (box: Box3) => box.max.y - box.min.y

    expect(centre(left).x).toBeLessThan(-0.04)
    expect(centre(upper).x).toBeGreaterThan(0.04)
    expect(centre(upper).y).toBeGreaterThan(centre(left).y + 0.03)
    expect(centre(small).x).toBeGreaterThan(0)
    expect(centre(small).y).toBeLessThan(centre(left).y - 0.03)
    expect(small.max.y).toBeLessThan(upper.min.y)
    // The upright one is the measure; the tilted ones take up a little more room than their own height.
    expect(height(upper) / height(left)).toBeGreaterThan(1)
    expect(height(upper) / height(left)).toBeLessThan(1.25)
    expect(height(small) / height(left)).toBeGreaterThan(0.7)
    expect(height(small) / height(left)).toBeLessThan(0.95)
  })

  it('do not touch one another', () => {
    const [a, b, c] = pieces(zzzSymbol())
    for (const [one, other] of [
      [a, b],
      [a, c],
      [b, c],
    ]) {
      expect(one.intersectsBox(other)).toBe(false)
    }
  })
})

describe('symbolFor', () => {
  it.each<[BadgeStatus, SymbolName | null]>([
    ['idle', 'zzz'],
    ['thinking', 'ring'],
    ['working', 'ring'],
    ['done', 'ring'],
    ['error', 'exclamation'],
    ['hidden', null],
  ])('shows %s as %s', (status, symbol) => {
    expect(symbolFor(status)).toBe(symbol)
  })
})

describe('colorFor', () => {
  it.each<[BadgeStatus, string | null]>([
    ['idle', tokens.badgeGrey],
    ['thinking', tokens.badgeYellow],
    ['working', tokens.badgeGreen],
    ['done', tokens.badgeOrange],
    ['error', tokens.badgeRed],
    ['hidden', null],
  ])('paints %s in %s', (status, color) => {
    expect(colorFor(status)).toBe(color)
  })

  it('tells the three rings apart by their colour', () => {
    const rings = (['thinking', 'working', 'done'] as const).map(colorFor)
    expect(new Set(rings).size).toBe(3)
  })
})

describe('symbolPose', () => {
  const moving = (time: number, sinceChange = Infinity) => symbolPose(time, sinceChange, false)

  it('rests turned 22° to one side and sways 10° either way, once in four seconds', () => {
    expect(SWAY.rest).toBeCloseTo(-22 * DEGREES)
    expect(SWAY.swing).toBeCloseTo(10 * DEGREES)
    expect(SWAY.period).toBe(4)
    const turns = Array.from({ length: 401 }, (_, i) => moving(i / 100).turn)
    expect(Math.min(...turns)).toBeCloseTo(-32 * DEGREES, 3)
    expect(Math.max(...turns)).toBeCloseTo(-12 * DEGREES, 3)
    expect(moving(0).turn).toBeCloseTo(SWAY.rest)
    expect(moving(1.3 + SWAY.period).turn).toBeCloseTo(moving(1.3).turn)
  })

  it('never turns its edge to the viewer: its face can be read at every moment', () => {
    for (let time = 0; time < 30; time += 0.07) expect(Math.abs(moving(time).turn)).toBeLessThan(35 * DEGREES)
  })

  it('floats up and down a little', () => {
    const lifts = Array.from({ length: 301 }, (_, i) => moving(i / 100).lift)
    expect(Math.max(...lifts)).toBeCloseTo(FLOAT.height, 4)
    expect(Math.min(...lifts)).toBeCloseTo(-FLOAT.height, 4)
    expect(FLOAT.height).toBeLessThan(0.02)
    expect(moving(0.8 + FLOAT.period).lift).toBeCloseTo(moving(0.8).lift)
  })

  it('pops when the status has just changed and is its own size again half a second later', () => {
    expect(moving(3, 0).scale).toBe(1)
    const scales = Array.from({ length: 49 }, (_, i) => moving(3, (i + 1) / 100).scale)
    expect(Math.max(...scales)).toBeGreaterThan(1.1)
    expect(Math.max(...scales)).toBeLessThan(1.3)
    for (const scale of scales) expect(scale).toBeGreaterThan(1)
    expect(moving(3, POP.duration).scale).toBe(1)
    expect(moving(3, 60).scale).toBe(1)
    expect(moving(3).scale).toBe(1)
  })

  it('leans towards the viewer a little, by less than it is turned', () => {
    expect(LEAN).toBeGreaterThan(5 * DEGREES)
    expect(LEAN).toBeLessThan(Math.abs(SWAY.rest))
  })

  it('stands still at the resting angle with reduced motion, also right after a change', () => {
    for (const time of [0, 0.7, 1, 2.5, 9]) {
      for (const sinceChange of [0, 0.1, 0.25, 5, Infinity]) {
        expect(symbolPose(time, sinceChange, true)).toEqual({ turn: SWAY.rest, lift: 0, scale: 1 })
      }
    }
  })
})
