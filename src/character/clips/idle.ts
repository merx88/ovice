import { add, breathing, seatedBase, type ProceduralClip } from './shared'

/** Sitting still with both hands by the laptop, breathing. */
export const idle: ProceduralClip = {
  duration: null,
  sample: (t) => add(seatedBase, breathing(t)),
}
