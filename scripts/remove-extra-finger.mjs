// Removes the doubled finger from both hands of the character model.
//
//   node scripts/remove-extra-finger.mjs [model.glb]      (default: public/models/ovice_guy.glb)
//
// The fault. Each hand has a thumb and four fingers. The outermost finger is
// really two: a big one, and a smaller, shorter one lying along its upper inner
// side. They are one surface (the small one is no shell of its own that could
// be dropped), so in cross-section the finger is a figure of eight, and the
// notch between the two reads as a second finger.
//
// The repair. The notch is zipped shut: the small finger's side wall and the
// crease below it are lifted onto the edge of the small finger's top, so the
// big finger's side runs straight up into that top. The stretched side is
// rounded out, the dimple where the notch ends at the knuckle is smoothed away,
// and the shade that is painted along the notch is kept off the new surface.
// What is left is one finger, as thick as its neighbours.
//
// Only numbers change: positions, normals and texture coordinates of a few
// hundred vertices of the body mesh. No vertex or triangle is added or removed,
// the file keeps its size, and textures, skin, bones, eyes and animation stay
// byte for byte what they were. The triangles of the small finger's side wall
// remain, collapsed to nothing along the zipped line.
//
// Exit code 0: the finger was removed, or an earlier run had already removed
// it (the file is then left untouched). Exit code 1, with a sentence that says
// why: the file is not a model this script can read (no binary glTF, no
// meshes, a body without normals or texture coordinates), no doubled finger
// and no trace of this repair was found, or the result did not pass its own
// check. Nothing is written then.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// --- Where to look and how far to go ------------------------------------------
// Lengths are in the model's own units: it stands 0.79 tall with its arms out
// along x, the hand's back up (+y), the thumb forward (+z) and the fingertips
// at |x| = 0.5. The left hand is at +x; the right hand is its mirror image.

/** The hands begin beyond this |x|. */
const HAND_FROM_X = 0.42
/** The notch lies on the hand's outer side (z below this) and upper half (y above this). */
const NOTCH_REGION = { maxZ: -0.04, minY: 0.47 }
/** Two faces meeting at more than this angle (degrees), bent inwards, make a crease. */
const CREASE_ANGLE = 40
/** A triangle whose doubled area is below this counts as collapsed. */
const COLLAPSED_AREA = 1e-6
/** The stretch of the finger that is clear of the knuckle, where the notch is counted. */
const FREE_FINGER_X = [0.445, 0.482]
/** At least this many creased edges there mean the doubled finger is present. */
const NOTCH_EDGES = 8
/** At least this many collapsed triangles there mean this repair has been made before. */
const ZIPPED_TRIANGLES = 30

/** How wide the small finger is, from the crease to its inner wall. */
const SMALL_FINGER_WIDTH = 0.02
/** The small finger is what rises above a plane through the crease that drops this much per unit towards the inside. */
const BASE_TILT = 0.15
/** The zip closes gradually over this stretch of x, where the notch runs out at the knuckle. */
const ZIP_RAMP = [0.43, 0.44]
/** Points of the small finger within this distance of the crease, seen from above, are its side wall. */
const WALL_WIDTH = 0.0035
/** Points near the crease that are not part of the small finger: within this distance of the crease line, seen from above. */
const CREASE_REACH = 0.004
/** The big finger's side takes up the stretch as far as this from the crease. */
const SIDE_BAND = 0.009
/** How often the side band is relaxed towards the average of its neighbours. */
const SIDE_PASSES = 30
/** How far the middle of the new side is pushed out, so that the corner is round and not bevelled. */
const SIDE_BULGE = 0.0034
/** The dimple at the knuckle is smoothed within this distance of the notch's end, this often. */
const KNUCKLE = { radius: 0.012, passes: 12 }
/** The painted shade of the notch reaches this far down the big finger's side. */
const SHADE_REACH = 0.0035
/** How often the texture coordinates of the shaded strip are averaged with their neighbours'. */
const SHADE_PASSES = 60
/** Points on the zipped line within this distance of each other share one normal. */
const SEAM_RADIUS = 0.003

// --- Reading and writing the file ---------------------------------------------

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942
const FLOAT = 5126
const UNSIGNED_SHORT = 5123
const UNSIGNED_INT = 5125

function fail(message) {
  console.error(`remove-extra-finger: ${message}`)
  process.exit(1)
}

function readGlb(path) {
  let file
  try {
    file = readFileSync(path)
  } catch (error) {
    fail(`${path} cannot be read (${error.code ?? error.message})`)
  }
  // A header of 12 bytes and the 8 bytes that head the first chunk.
  if (file.length < 20 || file.readUInt32LE(0) !== GLB_MAGIC || file.readUInt32LE(4) !== 2) fail(`${path} is not a binary glTF 2 file`)
  const jsonLength = file.readUInt32LE(12)
  if (file.readUInt32LE(16) !== CHUNK_JSON) fail('the first chunk is not JSON')
  const binHeader = 20 + jsonLength
  if (file.length < binHeader + 8) fail('the file ends before its binary chunk')
  let json
  try {
    json = JSON.parse(file.subarray(20, binHeader).toString('utf8'))
  } catch (error) {
    fail(`the JSON chunk cannot be read (${error.message})`)
  }
  if (file.readUInt32LE(binHeader + 4) !== CHUNK_BIN) fail('the second chunk is not binary')
  return { file, json, binStart: binHeader + 8 }
}

/** The accessor `index` and the view of the buffer it reads, for `what` (the body's positions, say). */
function accessorOf({ json }, index, what) {
  if (index === undefined) fail(`the body has no ${what}`)
  const accessor = json.accessors?.[index]
  if (!accessor) fail(`the body's ${what} name accessor ${index}, which the model does not have`)
  const view = json.bufferViews?.[accessor.bufferView]
  if (!view) fail(`the body's ${what} (accessor ${index}) are not stored in a buffer view`)
  return { accessor, view }
}

/** Where an accessor's numbers are in the file, as a byte offset, with its component count. */
function locateAccessor(glb, index, componentType, components, what) {
  const { accessor, view } = accessorOf(glb, index, what)
  if (accessor.componentType !== componentType) fail(`the body's ${what} (accessor ${index}) have an unexpected component type`)
  if (view.byteStride && view.byteStride !== components * 4) fail(`the body's ${what} (accessor ${index}) are interleaved`)
  return { offset: glb.binStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), count: accessor.count, components }
}

function readFloats(glb, { offset, count, components }) {
  const values = new Float64Array(count * components)
  for (let i = 0; i < values.length; i++) values[i] = glb.file.readFloatLE(offset + i * 4)
  return values
}

function writeFloats(glb, { offset }, values, changed) {
  for (const i of changed) glb.file.writeFloatLE(values[i], offset + i * 4)
}

/** The body: the mesh primitive with the most vertices. */
function findBody(glb) {
  const meshes = glb.json.meshes
  if (!Array.isArray(meshes) || meshes.length === 0) fail('the model has no meshes')
  let body = null
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives ?? []) {
      const count = glb.json.accessors?.[primitive.attributes?.POSITION]?.count
      if (count !== undefined && (!body || count > body.count)) body = { primitive, count }
    }
  }
  if (!body) fail('no mesh of the model has positions (POSITION)')
  const { primitive } = body
  if ((primitive.mode ?? 4) !== 4 || primitive.indices === undefined) fail('the body is not an indexed triangle mesh')
  return primitive
}

function readIndices(glb, index) {
  const { accessor, view } = accessorOf(glb, index, 'triangles (indices)')
  const offset = glb.binStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const indices = new Uint32Array(accessor.count)
  if (accessor.componentType === UNSIGNED_SHORT) {
    for (let i = 0; i < indices.length; i++) indices[i] = glb.file.readUInt16LE(offset + i * 2)
  } else if (accessor.componentType === UNSIGNED_INT) {
    for (let i = 0; i < indices.length; i++) indices[i] = glb.file.readUInt32LE(offset + i * 4)
  } else fail('the body has an unexpected index type')
  return indices
}

// --- Small vector helpers -------------------------------------------------------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const length = (a) => Math.hypot(a[0], a[1], a[2])
const distance = (a, b) => length(sub(a, b))
const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t)
const clamp01 = (value) => Math.min(1, Math.max(0, value))

function smoothstep(from, to, x) {
  const t = clamp01((x - from) / (to - from))
  return t * t * (3 - 2 * t)
}

function average(points) {
  const sum = points[0].map(() => 0)
  for (const point of points) point.forEach((value, i) => (sum[i] += value))
  return sum.map((value) => value / points.length)
}

// --- The mesh, welded -----------------------------------------------------------
// Vertices are split along the texture's seams. Shape is a matter of places, not
// of copies, so everything below works on "points": the distinct positions.

function weld(positions, indices) {
  const bits = new Uint32Array(new Float32Array(positions).buffer)
  const pointOf = new Uint32Array(positions.length / 3)
  const byPlace = new Map()
  /** One [x, y, z] per point. */
  const points = []
  /** The vertices (copies) that sit on each point. */
  const copies = []
  for (let v = 0; v < pointOf.length; v++) {
    const key = `${bits[v * 3]},${bits[v * 3 + 1]},${bits[v * 3 + 2]}`
    let point = byPlace.get(key)
    if (point === undefined) {
      point = points.length
      byPlace.set(key, point)
      points.push([positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]])
      copies.push([])
    }
    pointOf[v] = point
    copies[point].push(v)
  }
  /** Triangles as triples of points, and as triples of copies. */
  const triangles = []
  const cornerCopies = []
  for (let t = 0; t < indices.length; t += 3) {
    triangles.push([pointOf[indices[t]], pointOf[indices[t + 1]], pointOf[indices[t + 2]]])
    cornerCopies.push([indices[t], indices[t + 1], indices[t + 2]])
  }
  /** The points each point shares a triangle with. */
  const neighbours = points.map(() => new Set())
  for (const [a, b, c] of triangles) {
    if (a === b || b === c || a === c) continue
    neighbours[a].add(b).add(c)
    neighbours[b].add(a).add(c)
    neighbours[c].add(a).add(b)
  }
  /** The copies each copy shares a triangle with. */
  const copyNeighbours = new Map()
  const link = (a, b) => {
    if (!copyNeighbours.has(a)) copyNeighbours.set(a, new Set())
    copyNeighbours.get(a).add(b)
  }
  for (const [a, b, c] of cornerCopies) {
    link(a, b), link(a, c), link(b, a), link(b, c), link(c, a), link(c, b)
  }
  return { points, pointOf, copies, triangles, neighbours, copyNeighbours }
}

/** The normal of every triangle, as long as twice its area. */
function faceNormals(triangles, at) {
  return triangles.map(([a, b, c]) => cross(sub(at[b], at[a]), sub(at[c], at[a])))
}

/** Per point: the sum of the normals of its triangles, which weights each by its area. */
function summedNormals(mesh, at) {
  const sums = at.map(() => [0, 0, 0])
  faceNormals(mesh.triangles, at).forEach((normal, t) => {
    for (const point of mesh.triangles[t]) sums[point] = add(sums[point], normal)
  })
  return sums
}

// --- Finding the fault ----------------------------------------------------------
// Both hands are handled as a left hand: `at` holds the points, mirrored for the
// right hand, and `mesh` the triangles to go with them (see `handed` below).

/**
 * The creased edges on the upper outer side of one hand: edges where two faces
 * meet at a sharp angle, bent inwards. Triangles no larger than `minArea`
 * (doubled) are left out.
 */
function creasedEdges(mesh, at, minArea) {
  const normals = faceNormals(mesh.triangles, at)
  const centres = mesh.triangles.map(([a, b, c]) => scale(add(add(at[a], at[b]), at[c]), 1 / 3))
  const facesOfEdge = new Map()
  mesh.triangles.forEach(([a, b, c], t) => {
    if (centres[t][0] < HAND_FROM_X || length(normals[t]) <= minArea) return
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = u < v ? `${u},${v}` : `${v},${u}`
      if (!facesOfEdge.has(key)) facesOfEdge.set(key, [])
      facesOfEdge.get(key).push(t)
    }
  })
  const creased = []
  for (const [key, faces] of facesOfEdge) {
    if (faces.length !== 2) continue
    const [u, v] = key.split(',').map(Number)
    const [i, j] = faces
    const middle = scale(add(at[u], at[v]), 0.5)
    if (middle[2] >= NOTCH_REGION.maxZ || middle[1] <= NOTCH_REGION.minY) continue
    const cosine = dot(normals[i], normals[j]) / (length(normals[i]) * length(normals[j]))
    const angle = (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI
    const bentInwards = dot(sub(centres[j], centres[i]), normals[i]) > 0
    if (bentInwards && angle > CREASE_ANGLE) creased.push({ u, v, middle })
  }
  return creased
}

const onFreeFinger = (x) => x >= FREE_FINGER_X[0] && x <= FREE_FINGER_X[1]

/** How many creased edges the free part of the outermost finger has: the notch, if there is one. */
function countNotchEdges(mesh, at) {
  return creasedEdges(mesh, at, COLLAPSED_AREA).filter(({ middle }) => onFreeFinger(middle[0])).length
}

/** How many triangles are collapsed to nothing along the free part of the outermost finger. */
function countZippedTriangles(mesh, at) {
  const normals = faceNormals(mesh.triangles, at)
  return mesh.triangles.filter(([a, b, c], t) => {
    const centre = scale(add(add(at[a], at[b]), at[c]), 1 / 3)
    return (
      onFreeFinger(centre[0]) && centre[2] < NOTCH_REGION.maxZ && centre[1] > NOTCH_REGION.minY && length(normals[t]) <= COLLAPSED_AREA
    )
  }).length
}

// --- The repair of one hand -----------------------------------------------------

/**
 * A line seen from above (x and z), with what the repair asks of it: the
 * nearest place on it to a point, how far inside the small finger that point
 * is, and how far along the line it is.
 */
function creaseLine(line, inside) {
  const segments = []
  let run = 0
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]
    const b = line[i + 1]
    const span = Math.hypot(b[0] - a[0], b[2] - a[2])
    const along = [(b[0] - a[0]) / span, (b[2] - a[2]) / span]
    let inward = [-along[1], along[0]]
    if (inward[0] * (inside[0] - a[0]) + inward[1] * (inside[1] - a[2]) < 0) inward = [-inward[0], -inward[1]]
    segments.push({ a, b, span, along, inward, start: run })
    run += span
  }
  return (x, z) => {
    let best = null
    for (const { a, b, span, along, inward, start } of segments) {
      const reach = Math.min(span, Math.max(0, (x - a[0]) * along[0] + (z - a[2]) * along[1]))
      const nearest = mix(a, b, reach / span)
      const away = [x - nearest[0], z - nearest[2]]
      const gap = Math.hypot(away[0], away[1])
      if (!best || gap < best.gap) {
        const isInside = away[0] * inward[0] + away[1] * inward[1] >= 0
        best = { gap, nearest, offset: isInside ? gap : -gap, arc: start + reach }
      }
    }
    return best
  }
}

/** Zips the notch of one hand shut. Changes `at` and `uvs` in place and returns what it touched. */
function zipNotch(mesh, at, uvs, restNormals, report) {
  const zipAt = (x) => smoothstep(ZIP_RAMP[0], ZIP_RAMP[1], x)

  // The crease: the middles of the creased edges, in order from the knuckle round the small finger's tip.
  const creased = creasedEdges(mesh, at, 0)
  const creaseZ = median([...new Set(creased.flatMap(({ u, v }) => [u, v]))].map((point) => at[point][2]))
  const xs = creased.map(({ middle }) => middle[0])
  const inside = [(Math.min(...xs) + Math.max(...xs)) / 2, creaseZ + SMALL_FINGER_WIDTH / 2]
  const turn = ({ middle }) => {
    const angle = Math.atan2(middle[2] - inside[1], middle[0] - inside[0])
    return angle > Math.PI / 2 ? angle - 2 * Math.PI : angle
  }
  const line = []
  for (const point of smoothLine([...creased].sort((a, b) => turn(a) - turn(b)).map(({ middle }) => middle), 2)) {
    // Thinned, so that no two points of the line are closer than the mesh is fine.
    const last = line[line.length - 1]
    if (!last || Math.hypot(point[0] - last[0], point[2] - last[2]) > 0.0015) line.push(point)
  }
  const locate = creaseLine(line, inside)

  // The small finger: everything that rises above the tilted plane through the crease, reached from its top.
  const heightAbove = (point) => {
    const [x, y, z] = at[point]
    const { nearest, offset } = locate(x, z)
    return { height: y - (nearest[1] - BASE_TILT * Math.max(offset, 0)), offset }
  }
  const belongs = (point) => {
    const [x, , z] = at[point]
    if (x < ZIP_RAMP[0] || z <= creaseZ - 0.004 || z >= creaseZ + SMALL_FINGER_WIDTH + 0.002) return false
    // The next finger's side faces this one across the gap between them; it is no part of it.
    if (restNormals[point][2] < -0.3 && z > creaseZ + 0.012) return false
    return heightAbove(point).height > 1e-5
  }
  let seed = -1
  at.forEach(([x, y, z], point) => {
    if (x <= 0.455 || x >= 0.465 || z <= creaseZ + 0.004 || z >= creaseZ + 0.018) return
    if (seed < 0 || y > at[seed][1]) seed = point
  })
  if (seed < 0) fail('the top of the small finger is not where it was expected')
  const small = new Set([seed])
  for (const stack = [seed]; stack.length > 0; ) {
    for (const next of mesh.neighbours[stack.pop()]) {
      if (!small.has(next) && belongs(next)) small.add(next), stack.push(next)
    }
  }
  const wall = new Set([...small].filter((point) => heightAbove(point).offset < WALL_WIDTH))
  const edge = [...small].filter((point) => !wall.has(point) && [...mesh.neighbours[point]].some((other) => wall.has(other)))
  const crease = new Set()
  for (const point of wall) {
    for (const other of mesh.neighbours[point]) {
      if (!small.has(other) && Math.abs(locate(at[other][0], at[other][2]).offset) < CREASE_REACH) crease.add(other)
    }
  }
  if (edge.length < 4 || crease.size < 4) fail('the small finger could not be told from the big one')

  // The edge of the small finger's top, as a smooth line along the crease.
  const rest = at.map((point) => [...point])
  const arcOf = (point) => locate(rest[point][0], rest[point][2]).arc
  const ordered = edge.map((point) => ({ arc: arcOf(point), place: rest[point] })).sort((a, b) => a.arc - b.arc)
  let knots = []
  for (let i = 0; i < ordered.length; ) {
    let j = i
    while (j + 1 < ordered.length && ordered[j + 1].arc - ordered[i].arc < 0.002) j++
    const group = ordered.slice(i, j + 1)
    knots.push({ arc: average(group.map(({ arc }) => [arc]))[0], place: average(group.map(({ place }) => place)) })
    i = j + 1
  }
  const smoothed = smoothLine(knots.map(({ place }) => place), 2)
  knots = knots.map(({ arc }, i) => ({ arc, place: smoothed[i] }))
  const edgeAt = (arc) => {
    if (arc <= knots[0].arc) return knots[0].place
    for (let i = 0; i + 1 < knots.length; i++) {
      if (arc <= knots[i + 1].arc) return mix(knots[i].place, knots[i + 1].place, (arc - knots[i].arc) / (knots[i + 1].arc - knots[i].arc))
    }
    return knots[knots.length - 1].place
  }

  // Zip: the side wall and the crease go up onto that line, and the edge itself settles on it.
  let lift = 0
  for (const point of [...wall, ...crease, ...edge]) {
    const target = edgeAt(arcOf(point))
    lift = Math.max(lift, zipAt(rest[point][0]) * (target[1] - rest[point][1]))
    at[point] = mix(rest[point], target, zipAt(rest[point][0]))
  }

  // The big finger's side below the crease takes up the stretch evenly...
  const creasePlaces = [...crease].map((point) => rest[point])
  const band = []
  rest.forEach(([x, y, z], point) => {
    if (small.has(point) || crease.has(point) || x <= HAND_FROM_X || z >= creaseZ + 0.005) return
    if (!creasePlaces.some((place) => distance(place, rest[point]) < SIDE_BAND)) return
    const { nearest, offset } = locate(x, z)
    if (offset < 0.001 && y <= nearest[1] + 0.001) band.push(point)
  })
  /** 0 where the band meets the untouched side, 1 at the crease. */
  const across = new Map(band.map((point) => [point, 0]))
  for (const point of crease) across.set(point, 1)
  for (let pass = 0; pass < SIDE_PASSES; pass++) {
    const places = band.map((point) => average([...mesh.neighbours[point]].map((other) => at[other])))
    const values = band.map((point) => average([...mesh.neighbours[point]].map((other) => [across.get(other) ?? 0]))[0])
    band.forEach((point, i) => {
      at[point] = mix(at[point], places[i], 0.5 * zipAt(rest[point][0]))
      across.set(point, values[i])
    })
  }
  // ...and is rounded out: a flat bridge would leave the finger with a bevelled corner.
  const outward = summedNormals(mesh, at)
  for (const point of band) {
    let normal = scale(outward[point], 1 / (length(outward[point]) || 1))
    if (dot(normal, [0, 0.5, -1]) < 0) normal = scale(normal, -1)
    const middle = 4 * across.get(point) * (1 - across.get(point))
    at[point] = add(at[point], scale(normal, zipAt(rest[point][0]) * SIDE_BULGE * middle))
  }

  // Where the notch runs out at the knuckle the lift leaves a dimple: melt it into its surroundings.
  const knuckle = []
  rest.forEach((place, point) => {
    if (place[0] > 0.4 && distance(place, line[0]) < KNUCKLE.radius) knuckle.push(point)
  })
  const weight = knuckle.map((point) => 1 - smoothstep(0.6 * KNUCKLE.radius, KNUCKLE.radius, distance(rest[point], line[0])))
  for (let pass = 0; pass < KNUCKLE.passes; pass++) {
    const places = knuckle.map((point) => average([...mesh.neighbours[point]].map((other) => at[other])))
    knuckle.forEach((point, i) => (at[point] = mix(at[point], places[i], 0.5 * weight[i])))
  }

  // Texture. The notch is painted as a shaded line, and the lifted crease and the strip of the big
  // finger's side right below it carry that shade. They take the texture of the plain skin a little
  // further down the side instead: the texture coordinates of that skin are carried up to the crease,
  // each copy settling on the average of the copies it is joined to on the big finger's side.
  const shaded = new Set(crease)
  for (const point of band) if (locate(rest[point][0], rest[point][2]).offset > -SHADE_REACH) shaded.add(point)
  const onSide = (copy) => !small.has(mesh.pointOf[copy])
  const isShaded = (copy) => shaded.has(mesh.pointOf[copy])
  const sideOf = (copy) => [...(mesh.copyNeighbours.get(copy) ?? [])].filter(onSide)
  // Only copies that are joined to plain skin, directly or through other shaded copies: a crease
  // vertex's copy on the small finger's side of a texture seam is not, and keeps what it has.
  const reached = new Set([...shaded].flatMap((point) => mesh.copies[point]).filter((copy) => sideOf(copy).some((other) => !isShaded(other))))
  for (const stack = [...reached]; stack.length > 0; ) {
    for (const other of sideOf(stack.pop())) {
      if (isShaded(other) && !reached.has(other)) reached.add(other), stack.push(other)
    }
  }
  const repainted = [...reached]
  const joined = repainted.map(sideOf)
  const plainUvs = new Map(repainted.map((copy) => [copy, [uvs[copy * 2], uvs[copy * 2 + 1]]]))
  const uvOf = (copy) => plainUvs.get(copy) ?? [uvs[copy * 2], uvs[copy * 2 + 1]]
  for (let pass = 0; pass < SHADE_PASSES; pass++) {
    const next = joined.map((copies) => average(copies.map(uvOf)))
    repainted.forEach((copy, i) => plainUvs.set(copy, next[i]))
  }
  for (const copy of repainted) {
    const t = zipAt(rest[mesh.pointOf[copy]][0])
    const [u, v] = plainUvs.get(copy)
    uvs[copy * 2] += t * (u - uvs[copy * 2])
    uvs[copy * 2 + 1] += t * (v - uvs[copy * 2 + 1])
  }

  report(`  small finger: ${small.size} points (side wall ${wall.size}, edge of its top ${edge.length}), crease ${crease.size}`)
  report(`  lifted by up to ${lift.toFixed(4)}; side relaxed over ${band.length} points; knuckle smoothed over ${knuckle.length}; ${repainted.length} vertices given plain skin`)
  return { moved: new Set([...wall, ...crease, ...edge, ...band, ...knuckle]), seam: [...wall, ...crease, ...edge] }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Averages every inner point of a line with its two neighbours, `passes` times. */
function smoothLine(line, passes) {
  let current = line
  for (let pass = 0; pass < passes; pass++) {
    current = current.map((point, i) =>
      i === 0 || i === current.length - 1 ? point : point.map((value, axis) => (current[i - 1][axis] + 2 * value + current[i + 1][axis]) / 4),
    )
  }
  return current
}

// --- Main -----------------------------------------------------------------------

const path = process.argv[2] ?? fileURLToPath(new URL('../public/models/ovice_guy.glb', import.meta.url))
const glb = readGlb(path)
const body = findBody(glb)
const where = {
  position: locateAccessor(glb, body.attributes.POSITION, FLOAT, 3, 'positions (POSITION)'),
  normal: locateAccessor(glb, body.attributes.NORMAL, FLOAT, 3, 'normals (NORMAL)'),
  uv: locateAccessor(glb, body.attributes.TEXCOORD_0, FLOAT, 2, 'texture coordinates (TEXCOORD_0)'),
}
const positions = readFloats(glb, where.position)
const normals = readFloats(glb, where.normal)
const uvs = readFloats(glb, where.uv)
const indices = readIndices(glb, body.indices)
const mesh = weld(positions, indices)
const triangleCount = indices.length / 3
console.log(`${path}`)
console.log(`body: ${positions.length / 3} vertices on ${mesh.points.length} points, ${triangleCount} triangles`)

const SIDES = [
  { name: 'left hand', sign: 1 },
  { name: 'right hand', sign: -1 },
]
/** The points with the right hand turned into a left one, or back. */
const mirrored = (points, sign) => points.map(([x, y, z]) => [x * sign, y, z])
/** The mesh to go with them: mirroring turns every triangle inside out, so its corners are taken the other way round. */
const handed = (sign) => (sign > 0 ? mesh : { ...mesh, triangles: mesh.triangles.map(([a, b, c]) => [a, c, b]) })
const found = SIDES.map(({ sign }) => {
  const at = mirrored(mesh.points, sign)
  return { notch: countNotchEdges(handed(sign), at), zipped: countZippedTriangles(handed(sign), at) }
})
SIDES.forEach(({ name }, i) => console.log(`${name}: ${found[i].notch} creased edges along the finger, ${found[i].zipped} collapsed triangles`))

if (found.every(({ notch }) => notch < NOTCH_EDGES)) {
  if (found.every(({ zipped }) => zipped >= ZIPPED_TRIANGLES)) {
    console.log('The doubled finger has already been removed from both hands. Nothing was changed.')
    process.exit(0)
  }
  fail('no doubled finger was found on either hand. Nothing was changed.')
}

const places = mesh.points.map((point) => [...point])
const touched = new Set()
const seams = []
SIDES.forEach(({ name, sign }, i) => {
  if (found[i].notch < NOTCH_EDGES) return
  console.log(`${name}: zipping the notch`)
  const at = mirrored(places, sign)
  const restNormals = summedNormals(handed(sign), at).map((sum) => scale(sum, 1 / (length(sum) || 1)))
  const { moved, seam } = zipNotch(handed(sign), at, uvs, restNormals, console.log)
  at.forEach(([x, y, z], point) => (places[point] = [x * sign, y, z]))
  for (const point of moved) {
    touched.add(point)
    for (const other of mesh.neighbours[point]) touched.add(other)
  }
  seams.push(seam)
})

// Normals of everything touched, from the faces as they are now. Along the zipped line the points
// of both sides lie together and share one shading, as if they were one surface.
const sums = summedNormals(mesh, places)
for (const seam of seams) {
  const shared = seam.map((point) =>
    seam.reduce((sum, other) => (distance(places[point], places[other]) < SEAM_RADIUS ? add(sum, sums[other]) : sum), [0, 0, 0]),
  )
  seam.forEach((point, i) => (sums[point] = shared[i]))
}

// Check the result before writing anything.
const before = mesh.points
SIDES.forEach(({ name, sign }, i) => {
  const left = countNotchEdges(handed(sign), mirrored(places, sign))
  if (left >= NOTCH_EDGES / 2) fail(`${name}: ${left} creased edges are left along the finger. Nothing was changed.`)
  console.log(`${name}: ${found[i].notch} creased edges along the finger before, ${left} after`)
})
const bounds = (points) => [0, 1, 2].map((axis) => [Math.min(...points.map((p) => p[axis])), Math.max(...points.map((p) => p[axis]))])
if (JSON.stringify(bounds(places.map((p) => p.map(Math.fround)))) !== JSON.stringify(bounds(before.map((p) => p.map(Math.fround))))) {
  fail('the change would alter the size of the model. Nothing was changed.')
}

const changed = { position: [], normal: [], uv: [] }
let furthest = 0
for (const point of touched) {
  const sum = sums[point]
  const normal = length(sum) > 1e-12 ? scale(sum, 1 / length(sum)) : [0, 1, 0]
  furthest = Math.max(furthest, distance(places[point], before[point]))
  for (const copy of mesh.copies[point]) {
    for (let axis = 0; axis < 3; axis++) {
      if (Math.fround(places[point][axis]) !== Math.fround(positions[copy * 3 + axis])) {
        positions[copy * 3 + axis] = places[point][axis]
        changed.position.push(copy * 3 + axis)
      }
      normals[copy * 3 + axis] = normal[axis]
      changed.normal.push(copy * 3 + axis)
    }
  }
}
const originalUvs = readFloats(glb, where.uv)
uvs.forEach((value, i) => {
  if (Math.fround(value) !== Math.fround(originalUvs[i])) changed.uv.push(i)
})

writeFloats(glb, where.position, positions, changed.position)
writeFloats(glb, where.normal, normals, changed.normal)
writeFloats(glb, where.uv, uvs, changed.uv)
writeFileSync(path, glb.file)

const movedCopies = new Set(changed.position.map((i) => Math.floor(i / 3))).size
console.log(`triangles: ${triangleCount} before, ${triangleCount} after (none removed; the small finger's side wall is collapsed)`)
console.log(`vertices moved: ${movedCopies} (by up to ${furthest.toFixed(4)}); normals rewritten: ${changed.normal.length / 3}; texture coordinates changed: ${new Set(changed.uv.map((i) => i >> 1)).size}`)
console.log(`file size: ${glb.file.length} bytes, unchanged`)
console.log('The doubled finger has been removed from both hands.')
