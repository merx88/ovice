/** The pointer counts as still once it has not moved for this long. */
export const POINTER_STILL_MS = 1200

/** Minimum time between the start of one greeting and the start of the next. */
export const GREET_INTERVAL_MS = 8000

/** The head turns at most 45° to either side; the body takes up the rest. */
export const HEAD_MAX_YAW = Math.PI / 4

/** The body turns at most 30° to either side. */
export const BODY_MAX_YAW = Math.PI / 6
