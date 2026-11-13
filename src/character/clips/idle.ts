import { add, breathing, seatedBase, type ProceduralClip } from './shared'

/** Sitting still with both hands on the laptop's keys, breathing. */
export const idle: ProceduralClip = {
  duration: null,
  sample: (t) => add(seatedBase, breathing(t)),
}
