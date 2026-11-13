import { useFrame } from '@react-three/fiber'
import { useCallback, useRef, useState } from 'react'
import { HANDOFF_FACING, HANDOFF_POS, SEAT_FACING, SEAT_GROUND_POS } from '../scene/layout'
import { Character, type CharacterPlacement } from './Character'
import { isLoop, type ClipReviewRequest, type ReviewPlace } from './clipReview'
import { MAX_STEP } from './playback'

const PLACEMENTS: Record<ReviewPlace, CharacterPlacement> = {
  desk: { position: [...SEAT_GROUND_POS], facing: SEAT_FACING },
  floor: { position: [...HANDOFF_POS], facing: HANDOFF_FACING },
}

/** A clip played on its own holds its last pose this long (s) before it starts again. */
const PAUSE_BEFORE_REPEAT = 0.8

function ignore() {}

/**
 * A review aid for development only: a character that nothing drives, playing
 * the clips of `request` one after the other, round and round. A clip that
 * ends hands over to the next at once, as it would in the product, so that a
 * list shows how clips join; a looping clip is shown for `request.hold`
 * seconds. A single clip is started afresh after a short pause.
 */
export function ClipReview({ request }: { request: ClipReviewRequest }) {
  const { clips, place, look, speed, hold } = request
  /** How many clips have been played so far: the one shown is that many along the list, counted round. */
  const [played, setPlayed] = useState(0)
  const clip = clips[played % clips.length]
  const alone = clips.length === 1
  /** Seconds until the next clip starts, or null while the clip shown decides that by ending. */
  const untilNext = useRef<number | null>(null)
  const shown = useRef<number | null>(null)

  if (shown.current !== played) {
    shown.current = played
    untilNext.current = isLoop(clip) && !alone ? hold : null
  }

  useFrame((_, delta) => {
    if (untilNext.current === null) return
    untilNext.current -= Math.min(delta, MAX_STEP)
    if (untilNext.current <= 0) setPlayed(played + 1)
  })

  const onClipFinished = useCallback(() => {
    if (alone) untilNext.current = PAUSE_BEFORE_REPEAT
    else setPlayed((count) => count + 1)
  }, [alone])

  return (
    <Character
      // A clip that follows itself would not start again: a fresh character does.
      key={alone ? played : 0}
      clip={clip}
      clipSpeed={speed}
      placement={PLACEMENTS[place]}
      lookTarget={look}
      badge="hidden"
      holdingFile={clip === 'holdFile'}
      onClipFinished={onClipFinished}
      onFolderClick={ignore}
    />
  )
}
