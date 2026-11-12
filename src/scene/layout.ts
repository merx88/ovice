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

/** Centre of the laptop's base, resting on the desktop in front of the seat. */
export const LAPTOP_POS = [SEAT_X, DESK_TOP_Y, -0.16] as const

// --- Furniture and props ----------------------------------------------------

export const WALL_Z = -1.8

export const BOOKSHELF_POS = [-2.03, 0, -1.32] as const
/** The bookshelf and sofa are turned a little to face the camera. */
export const BOOKSHELF_YAW = 0.19
export const DRAWER_POS = [-0.74, 0, 0.08] as const
export const SOFA_POS = [2.04, 0, -0.55] as const
export const SOFA_YAW = -0.2
export const SIDE_TABLE_POS = [2.2, 0, 0.3] as const
export const LAMP_POS = [-0.74, DESK_TOP_Y, -0.08] as const
export const CUP_POS = [0.62, DESK_TOP_Y, -0.05] as const

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
