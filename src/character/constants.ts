/** The pointer counts as still once it has not moved for this long. */
export const POINTER_STILL_MS = 1200

/** Minimum time between the start of one greeting and the start of the next. */
export const GREET_INTERVAL_MS = 8000

/** The character goes to wait on the sofa once the chat has not been used for this long. */
export const SOFA_AFTER_MS = 10_000

/** The head turns at most 45° to either side; the body takes up the rest. */
export const HEAD_MAX_YAW = Math.PI / 4

/** The body turns at most 30° to either side. */
export const BODY_MAX_YAW = Math.PI / 6

/** The head tilts at most 20° up or down towards what it looks at. */
export const HEAD_MAX_PITCH = (20 * Math.PI) / 180

/**
 * How far the head turns for a pointer at the left or right edge of the view:
 * short of the 45° beyond which the body would follow and drag the hands
 * across the desk.
 */
export const LOOK_EDGE_YAW = (38 * Math.PI) / 180
