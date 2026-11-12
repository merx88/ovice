import { Box3, BufferGeometry, Color, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  archPoints,
  extrudeRounded,
  flatRing,
  gradientStrip,
  roundedCylinder,
  roundedFrameShape,
  roundedLoopPoints,
  roundedRectShape,
  tubeThrough,
} from './geometry'

function sizeOf(geometry: BufferGeometry): Vector3 {
  geometry.computeBoundingBox()
  return (geometry.boundingBox as Box3).getSize(new Vector3())
}

function boundsOf(geometry: BufferGeometry): Box3 {
  geometry.computeBoundingBox()
  return geometry.boundingBox as Box3
}

describe('extrudeRounded', () => {
  it('keeps the outline and the requested depth despite the rounded edges', () => {
    const size = sizeOf(extrudeRounded(roundedRectShape(0.8, 0.4, 0.1), 0.3, 0.02))
    expect(size.x).toBeCloseTo(0.8, 3)
    expect(size.y).toBeCloseTo(0.4, 3)
    expect(size.z).toBeCloseTo(0.3, 3)
  })

  it('centres the extrusion on z = 0', () => {
    const bounds = boundsOf(extrudeRounded(roundedRectShape(0.8, 0.4, 0.1), 0.3, 0.02))
    expect(bounds.min.z).toBeCloseTo(-0.15, 3)
    expect(bounds.max.z).toBeCloseTo(0.15, 3)
  })

  it('extrudes a frame with a hole to the same outer size', () => {
    const size = sizeOf(extrudeRounded(roundedFrameShape(1, 1.8, 0.17, 0.05), 0.4, 0.02))
    expect(size.x).toBeCloseTo(1, 3)
    expect(size.y).toBeCloseTo(1.8, 3)
    expect(size.z).toBeCloseTo(0.4, 3)
  })
})

describe('roundedFrameShape', () => {
  it('cuts one hole inset by the wall thickness', () => {
    const shape = roundedFrameShape(1, 2, 0.2, 0.05)
    expect(shape.holes).toHaveLength(1)
    const xs = shape.holes[0].getPoints().map((point) => point.x)
    const ys = shape.holes[0].getPoints().map((point) => point.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.9, 3)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1.9, 3)
  })
})

describe('roundedLoopPoints', () => {
  it('returns the requested number of distinct points inside the rectangle', () => {
    const points = roundedLoopPoints(0.6, 0.3, 0.1, 40)
    expect(points).toHaveLength(40)
    expect(points[0].distanceTo(points[points.length - 1])).toBeGreaterThan(0.001)
    for (const point of points) {
      expect(Math.abs(point.x)).toBeLessThanOrEqual(0.3 + 1e-6)
      expect(Math.abs(point.y)).toBeLessThanOrEqual(0.15 + 1e-6)
      expect(point.z).toBe(0)
    }
  })
})

describe('archPoints', () => {
  it('runs from the foot of the left leg over the top to the foot of the right leg', () => {
    const points = archPoints(0.3, 0.2)
    expect(points[0].toArray()).toEqual([-0.3, 0, 0])
    expect(points[points.length - 1].x).toBeCloseTo(0.3)
    expect(points[points.length - 1].y).toBeCloseTo(0)
    expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(0.5)
  })

  it('spaces the points evenly so the tube does not wobble', () => {
    const points = archPoints(0.3, 0.2)
    const gaps = points.slice(1).map((point, i) => point.distanceTo(points[i]))
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.5)
  })
})

describe('tubeThrough', () => {
  it('wraps the path in a tube of the given radius', () => {
    const size = sizeOf(tubeThrough(roundedLoopPoints(0.6, 0.3, 0.1), 0.05, { closed: true }))
    expect(size.x).toBeCloseTo(0.7, 2)
    expect(size.y).toBeCloseTo(0.4, 2)
    expect(size.z).toBeCloseTo(0.1, 2)
  })
})

describe('roundedCylinder', () => {
  it('stands on y = 0 and reaches the given height and widest radius', () => {
    const bounds = boundsOf(roundedCylinder(0.05, 0.04, 0.1, 0.01))
    expect(bounds.min.y).toBeCloseTo(0)
    expect(bounds.max.y).toBeCloseTo(0.1)
    expect(bounds.max.x).toBeCloseTo(0.05, 3)
  })
})

describe('flatRing', () => {
  it('faces +z with the given outer radius and thickness', () => {
    const size = sizeOf(flatRing(0.2, 0.3, 0.07, 0.02))
    expect(size.x).toBeCloseTo(0.6, 3)
    expect(size.y).toBeCloseTo(0.6, 3)
    expect(size.z).toBeCloseTo(0.07, 3)
  })

  it('leaves the hole open', () => {
    const position = flatRing(0.2, 0.3, 0.07, 0.02).getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      expect(Math.hypot(position.getX(i), position.getY(i))).toBeGreaterThanOrEqual(0.2 - 1e-6)
    }
  })
})

describe('gradientStrip', () => {
  it('builds one row of vertices per stop with its color and opacity', () => {
    const strip = gradientStrip(4, [
      { y: 0, color: new Color(1, 0, 0) },
      { y: 1, color: new Color(0, 1, 0), opacity: 0.5 },
      { y: 3, color: new Color(0, 0, 1), opacity: 0 },
    ])
    const position = strip.getAttribute('position')
    const color = strip.getAttribute('color')
    expect(position.count).toBe(6)
    expect(color.itemSize).toBe(4)
    expect(strip.getIndex()?.count).toBe(12)
    expect([position.getX(0), position.getX(1)]).toEqual([-2, 2])
    expect(position.getY(4)).toBe(3)
    expect([color.getX(0), color.getW(0)]).toEqual([1, 1])
    expect([color.getY(2), color.getW(2)]).toEqual([1, 0.5])
    expect([color.getZ(5), color.getW(5)]).toEqual([1, 0])
  })
})
