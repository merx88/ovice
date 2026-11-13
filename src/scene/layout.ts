// World-space layout of the office, in metres.
// Convention: +x right, +y up, +z towards the camera; the floor is y = 0 and
// the desk is centred on the origin. Positions are `[x, y, z]` tuples.

export type Vec3 = readonly [number, number, number]

export interface CameraSpec {
  position: Vec3
  target: Vec3
  /** Vertical field of view in degrees at `aspect` and on wider viewports. */
  fov: number
  /** Viewport aspect the framing was designed for; see `fovForAspect`. */
  aspect: number
}

// --- Desk -------------------------------------------------------------------

export const DESK_SIZE = { width: 2.4, depth: 0.8, height: 0.58, thickness: 0.1 } as const
export const DESK_POS = [0, 0, 0] as const
export const DESK_TOP_Y = DESK_POS[1] + DESK_SIZE.height

/** Axis-aligned box the desk occupies. */
export const DESK_BOUNDS = {
  min: [DESK_POS[0] - DESK_SIZE.width / 2, DESK_POS[1], DESK_POS[2] - DESK_SIZE.depth / 2],
  max: [DESK_POS[0] + DESK_SIZE.width / 2, DESK_TOP_Y, DESK_POS[2] + DESK_SIZE.depth / 2],
} as const satisfies { min: Vec3; max: Vec3 }

// --- Character anchors ------------------------------------------------------

/** Standing height the character model is scaled to. */
export const CHARACTER_HEIGHT = 1.2

/** The hem of the character's hoodie above the floor when it stands: what rests on a seat when it sits. */
export const CHARACTER_HEM_HEIGHT = 0.16 * CHARACTER_HEIGHT

/** Height of the chair's seat surface. */
export const SEAT_HEIGHT = 0.41

/** The chair sits slightly right of the desk centre, as in the reference. */
const SEAT_X = 0.05

/**
 * Where the seated character's hips rest on the seat. The character's body is
 * about 0.6 m deep and sits lower than the desktop, so the seat is this far
 * behind the desk's back edge to keep the belly out of the desk.
 */
export const SEAT_POS = [SEAT_X, SEAT_HEIGHT, -0.71] as const

/** The floor under the seated character: the `position` to give it while it sits. */
export const SEAT_GROUND_POS = [SEAT_POS[0], 0, SEAT_POS[2]] as const

/**
 * The character perches on the front edge of the seat (its legs are too
 * short to bend over it), so the chair stands this far behind the hips.
 */
const CHAIR_BEHIND_SEAT = 0.42

export const CHAIR_POS = [SEAT_X, 0, SEAT_POS[2] - CHAIR_BEHIND_SEAT] as const

/** Yaw (radians, about +y) of the seated character: 0 faces +z, the camera. */
export const SEAT_FACING = 0

/** Where the character stands, in front of the desk, to hand over the file. */
export const HANDOFF_POS = [SEAT_X, 0, 1] as const

/** Yaw of the character while it hands the file over: towards the camera. */
export const HANDOFF_FACING = 0

/** Half the width of the character's round body, which is what has to fit past the furniture. */
export const CHARACTER_BODY_RADIUS = 0.31

/**
 * The way from the seat to the hand-off spot, as ground points: along the
 * back of the desk, round its left end (the gap to the sofa on the right is
 * too narrow) and across its front. The way back is the same in reverse.
 */
export const WALK_OUT_PATH: readonly Vec3[] = [
  SEAT_GROUND_POS,
  [-1.75, 0, -0.75],
  [-1.75, 0, HANDOFF_POS[2]],
  HANDOFF_POS,
]

/** The corners of the walk are rounded to arcs of this radius, so the character turns as it goes. */
export const WALK_CORNER_RADIUS = 0.5

/**
 * Centre of the laptop's base, resting on the desktop in front of the seat: as
 * near the seat as the desk's back edge allows, because the character's short
 * arms have to reach its keys.
 */
export const LAPTOP_POS = [SEAT_X, DESK_TOP_Y, -0.21] as const

// --- Furniture and props ----------------------------------------------------

export const WALL_Z = -1.8

export const BOOKSHELF_POS = [-2.03, 0, -1.32] as const
/** The bookshelf and sofa are turned a little to face the camera. */
export const BOOKSHELF_YAW = 0.19
/** The bookshelf's frame; its footprint is centred on its position. */
export const BOOKSHELF_SIZE = { width: 1, height: 1.78, depth: 0.42 } as const
export const DRAWER_POS = [-0.74, 0, 0.08] as const
/** The drawer unit's footprint, centred on its position. */
export const DRAWER_SIZE = { width: 0.44, depth: 0.5 } as const
export const SOFA_POS = [2.04, 0, -0.55] as const
export const SOFA_YAW = -0.2
/**
 * The side table stands in front of the sofa's right arm, far enough to the
 * right and to the front to leave the floor before the cushion free.
 */
export const SIDE_TABLE_POS = [2.3, 0, 0.4] as const
export const LAMP_POS = [-0.74, DESK_TOP_Y, -0.08] as const
/** Where the cup stands: as near the seat as it could go, because the character has to lean over to reach it. */
export const CUP_POS = [0.55, DESK_TOP_Y, -0.17] as const

// --- The sofa ---------------------------------------------------------------

/**
 * The armchair's measures, in its own frame: origin on the floor under its
 * middle, facing +z.
 */
export const SOFA_SIZE = {
  /** Each arm is a fat ring standing on the floor at x = ±`x`, seen edge-on from the front. */
  arm: { tube: 0.125, height: 0.665, x: 0.46 },
  /** The backrest is one tube arched between the arms. */
  back: { tube: 0.12, radius: 0.27, baseY: 0.28, legLength: 0.25, z: -0.2 },
  /** The cushion is a rounded box between the arms. */
  cushion: { width: 0.72, height: 0.27, depth: 0.68, radius: 0.125, y: 0.36, z: 0.03 },
} as const

/** The side table's outer measures; its footprint is centred on its position. */
export const SIDE_TABLE_SIZE = { width: 0.46, height: 0.47, depth: 0.3 } as const

/** The point of the room that is `x` to the left of the sofa's middle and `z` in front of it, on the floor. */
export function onSofa(x: number, z: number): Vec3 {
  const cos = Math.cos(SOFA_YAW)
  const sin = Math.sin(SOFA_YAW)
  return [SOFA_POS[0] + x * cos + z * sin, 0, SOFA_POS[2] - x * sin + z * cos]
}

/** A character on the sofa faces the way the sofa does. */
export const SOFA_FACING = SOFA_YAW

/** The top of the cushion above the floor. */
export const SOFA_SEAT_HEIGHT = SOFA_SIZE.cushion.y + SOFA_SIZE.cushion.height / 2

/** How far in front of the sofa's middle the hips of a character sitting back in it are (m). */
const SOFA_SEAT_Z = 0.22

/** The floor point under the hips of a character seated on the sofa: in the middle of the cushion, its back at the backrest. */
export const SOFA_SEAT_POS = onSofa(0, SOFA_SEAT_Z)

/** How far a seated body is lifted off the floor for the hem of its hoodie to rest on the cushion. */
export const SOFA_LIFT = SOFA_SEAT_HEIGHT - CHARACTER_HEM_HEIGHT

/**
 * Where the character stands before it hops onto the sofa, and where it lands
 * when it hops off: on the floor in front of the cushion, its back to the
 * sofa, a body's width clear of it. It stands a little towards the desk, which
 * is where it comes from and goes to, and clear of the side table.
 */
export const SOFA_STAND_POS = onSofa(-0.14, SOFA_SIZE.cushion.z + SOFA_SIZE.cushion.depth / 2 + CHARACTER_BODY_RADIUS + 0.02)

/**
 * The way from the seat to the spot in front of the sofa, as ground points:
 * the way to the hand-off spot as far as the desk's front, on along the front,
 * and then up to the sofa along the line a character faces that has just
 * hopped off it. So it sets off on its run back without a turn, and on its
 * way there it walks up to the sofa and turns its back to it. The way back
 * is the same in reverse.
 */
export const SOFA_PATH: readonly Vec3[] = [
  ...WALK_OUT_PATH.slice(0, -1),
  [SOFA_STAND_POS[0] + (HANDOFF_POS[2] - SOFA_STAND_POS[2]) * Math.tan(SOFA_FACING), 0, HANDOFF_POS[2]],
  SOFA_STAND_POS,
]

// --- Cameras ----------------------------------------------------------------

/** Viewports narrower than this (CSS px) use `CAMERA_MOBILE`. */
export const MOBILE_BREAKPOINT = 768

/** Front view framing the whole room: bookshelf left, desk centre, sofa right. */
export const CAMERA: CameraSpec = {
  position: [0.14, 1.67, 8.9],
  target: [0.14, 0.76, 0],
  fov: 22,
  aspect: 1728 / 1117,
}

/** Pulled-back portrait view that keeps the desk and chair fully in frame. */
export const CAMERA_MOBILE: CameraSpec = {
  position: [SEAT_X, 1.9, 11],
  target: [SEAT_X, 0.35, 0],
  fov: 32,
  aspect: 390 / 844,
}

export function cameraFor(viewportWidth: number): CameraSpec {
  return viewportWidth < MOBILE_BREAKPOINT ? CAMERA_MOBILE : CAMERA
}

/**
 * Vertical fov (degrees) to use at `aspect`: the designed fov, widened on
 * viewports narrower than the design so the same horizontal extent stays in view.
 */
export function fovForAspect(camera: CameraSpec, aspect: number): number {
  if (aspect >= camera.aspect) return camera.fov
  const halfHeight = Math.tan((camera.fov * Math.PI) / 360)
  return (Math.atan((halfHeight * camera.aspect) / aspect) * 360) / Math.PI
}
