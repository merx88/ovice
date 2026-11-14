// A review aid for development only: which clips to play on a character that
// nothing drives, where it is and what it looks at. The page reads it from the
// address:
//
//   ?clip=wave                  one clip, played again and again
//   ?clip=standUp,walk,sitDown  several, one after the other, round and round
//   &at=desk|floor|sofa         where the character is (default: where the first clip belongs); at the
//                               sofa, the walking and running clips are shown standing in front of it
//   &look=0.5,1.2,3             a point in the room to look at
//   &speed=1.5                  how fast the clips play
//   &hold=2                     how long (s) a looping clip is shown before the next one
//
// Nothing here is part of the product: `OfficeScene` only asks in development.
import { CLIP_NAMES, CLIPS, type ClipName } from './clips'
import { SEAT_SPOT_CLIPS } from './clips/hop'

/** Where the reviewed character is: on its chair at the desk, standing on the open floor in front of it, or on the sofa. */
export type ReviewPlace = 'desk' | 'floor' | 'sofa'

export interface ClipReviewRequest {
  /** The clips to play, in order; after the last comes the first again. */
  clips: ClipName[]
  place: ReviewPlace
  /** A point in world space to look at, or null to look straight ahead. */
  look: [number, number, number] | null
  /** How fast the clips play, 1 being the pace they were written at. */
  speed: number
  /** Seconds a looping clip is shown before the next clip of the list. */
  hold: number
}

const PLACES: readonly ReviewPlace[] = ['desk', 'floor', 'sofa']

/** The clips that are played standing on the floor, and those that are played on the sofa; every other clip is played at the desk. */
const STANDING_CLIPS: readonly ClipName[] = ['walk', 'run', 'holdFile']
const SOFA_CLIPS = SEAT_SPOT_CLIPS

/** Where `clip` is at home. */
export function placeOf(clip: ClipName): ReviewPlace {
  if (STANDING_CLIPS.includes(clip)) return 'floor'
  return SOFA_CLIPS.includes(clip) ? 'sofa' : 'desk'
}

function isClipName(name: string): name is ClipName {
  return (CLIP_NAMES as string[]).includes(name)
}

function positive(text: string | null, fallback: number): number {
  const value = Number(text)
  return text !== null && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * What the address asks to be reviewed, or null when it names no clip.
 * `search` is the query string of the page (`window.location.search`).
 */
export function parseClipReview(search: string): ClipReviewRequest | null {
  const query = new URLSearchParams(search)
  const clips = (query.get('clip') ?? '').split(',').filter(isClipName)
  if (clips.length === 0) return null

  const at = query.get('at')
  const point = (query.get('look') ?? '').split(',').map(Number)
  return {
    clips,
    place: PLACES.find((place) => place === at) ?? placeOf(clips[0]),
    look: point.length === 3 && point.every(Number.isFinite) ? [point[0], point[1], point[2]] : null,
    speed: positive(query.get('speed'), 1),
    hold: positive(query.get('hold'), 3),
  }
}

/** Whether `clip` runs until something else ends it. */
export function isLoop(clip: ClipName): boolean {
  return CLIPS[clip].duration === null
}
