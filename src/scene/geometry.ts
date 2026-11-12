// Builders for the chunky, rounded shapes the furniture is made of.
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Path,
  Shape,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const CREASE_ANGLE = Math.PI / 5
const CURVE_SEGMENTS = 8
const BEVEL_SEGMENTS = 4

/** Traces a rounded rectangle centred on the origin onto `path`. */
function traceRoundedRect<T extends Path>(path: T, width: number, height: number, radius: number): T {
  const x = width / 2
  const y = height / 2
  const r = Math.min(radius, x, y)
  path.moveTo(-x + r, -y)
  path.lineTo(x - r, -y)
  path.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false)
  path.lineTo(x, y - r)
  path.absarc(x - r, y - r, r, 0, Math.PI / 2, false)
  path.lineTo(-x + r, y)
  path.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false)
  path.lineTo(-x, -y + r)
  path.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false)
  return path
}

export function roundedRectShape(width: number, height: number, radius: number): Shape {
  return traceRoundedRect(new Shape(), width, height, radius)
}

/** A rounded rectangle outline of the given wall thickness (a frame). */
export function roundedFrameShape(width: number, height: number, radius: number, wall: number): Shape {
  const shape = roundedRectShape(width, height, radius)
  const innerRadius = Math.max(radius - wall, wall / 2)
  shape.holes.push(traceRoundedRect(new Path(), width - wall * 2, height - wall * 2, innerRadius))
  return shape
}

/**
 * Extrudes `shape` along z to a total of `depth`, centred on z = 0, rounding
 * every edge by `bevel` without growing the outline.
 */
export function extrudeRounded(shape: Shape, depth: number, bevel: number): BufferGeometry {
  const straight = depth - bevel * 2
  const geometry = new ExtrudeGeometry(shape, {
    depth: straight,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: BEVEL_SEGMENTS,
    curveSegments: CURVE_SEGMENTS,
  })
  geometry.translate(0, 0, -straight / 2)
  return toCreasedNormals(geometry, CREASE_ANGLE)
}

export interface TubeOptions {
  closed?: boolean
  tubularSegments?: number
  radialSegments?: number
}

/** A round tube following a smooth curve through `points`. */
export function tubeThrough(points: Vector3[], radius: number, options: TubeOptions = {}): TubeGeometry {
  const { closed = false, tubularSegments = 64, radialSegments = 16 } = options
  const curve = new CatmullRomCurve3(points, closed, 'centripetal')
  return new TubeGeometry(curve, tubularSegments, radius, radialSegments, closed)
}

/** Evenly spaced points around a rounded rectangle in the xy plane (a closed loop). */
export function roundedLoopPoints(width: number, height: number, radius: number, count = 48): Vector3[] {
  const outline = traceRoundedRect(new Path(), width, height, radius)
  outline.closePath()
  return outline
    .getSpacedPoints(count)
    .slice(0, count)
    .map((point) => new Vector3(point.x, point.y, 0))
}

/**
 * Evenly spaced points along an upside-down U: up the left leg, over a half
 * circle of `radius`, down the right leg.
 */
export function archPoints(radius: number, legLength: number, arcSegments = 24): Vector3[] {
  const spacing = (Math.PI * radius) / arcSegments
  const legSegments = Math.round(legLength / spacing)
  const leg = Array.from({ length: legSegments }, (_, i) => (i / legSegments) * legLength)
  const points = leg.map((y) => new Vector3(-radius, y, 0))
  for (let i = 0; i <= arcSegments; i++) {
    const angle = Math.PI - (i / arcSegments) * Math.PI
    points.push(new Vector3(Math.cos(angle) * radius, legLength + Math.sin(angle) * radius, 0))
  }
  points.push(...leg.reverse().map((y) => new Vector3(radius, y, 0)))
  return points
}

/**
 * A (possibly tapered) cylinder standing on y = 0 whose top and bottom rims
 * are rounded by `edge`.
 */
export function roundedCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  edge: number,
  radialSegments = 32,
): LatheGeometry {
  const steps = 5
  const profile: Vector2[] = [new Vector2(0, 0)]
  for (let i = 0; i <= steps; i++) {
    const angle = -Math.PI / 2 + (i / steps) * (Math.PI / 2)
    profile.push(new Vector2(radiusBottom - edge + Math.cos(angle) * edge, edge + Math.sin(angle) * edge))
  }
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * (Math.PI / 2)
    profile.push(new Vector2(radiusTop - edge + Math.cos(angle) * edge, height - edge + Math.sin(angle) * edge))
  }
  profile.push(new Vector2(0, height))
  return new LatheGeometry(profile, radialSegments)
}

export interface GradientStop {
  /** Distance of this stop along the strip's y axis. */
  y: number
  color: Color
  opacity?: number
}

/**
 * A flat strip in the xy plane, centred on x, whose vertex colors (with alpha)
 * blend from one stop to the next along y. Its front face looks along +z, so
 * turn it to face the viewer or it is culled.
 */
export function gradientStrip(width: number, stops: readonly GradientStop[]): BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  stops.forEach(({ y, color, opacity = 1 }, row) => {
    positions.push(-width / 2, y, 0, width / 2, y, 0)
    colors.push(color.r, color.g, color.b, opacity, color.r, color.g, color.b, opacity)
    if (row > 0) {
      const base = (row - 1) * 2
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    }
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 4))
  geometry.setIndex(indices)
  return geometry
}

/**
 * A flat-faced ring (a washer with rounded edges) facing +z: `thickness` is
 * its extent along z and `edge` the rounding of its rims.
 */
export function flatRing(innerRadius: number, outerRadius: number, thickness: number, edge: number): LatheGeometry {
  const section = traceRoundedRect(new Path(), outerRadius - innerRadius, thickness, edge)
  section.closePath()
  const middle = (innerRadius + outerRadius) / 2
  const profile = section.getPoints(6).map((point) => new Vector2(point.x + middle, point.y))
  const geometry = new LatheGeometry(profile, 72)
  geometry.rotateX(Math.PI / 2)
  return geometry
}
