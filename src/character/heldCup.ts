// The coffee cup while it is in the character's hand. The character and the
// cup are far apart in the scene's tree; this is where they meet.
import { Matrix4 } from 'three'
import { CUP_POS } from '../scene/layout'

/** The cup standing in its place on the desk, in world space. */
export const CUP_REST = new Matrix4().makeTranslation(CUP_POS[0], CUP_POS[1], CUP_POS[2])

/**
 * One object for the whole app. While the character holds the cup it writes
 * the cup's place in world space here every frame, after it has posed; the
 * cup reads it later in the same frame. While `held` is false the cup stands
 * at `CUP_REST` and `matrix` means nothing.
 */
export const heldCup = { held: false, matrix: new Matrix4() }

/** Where the cup is in the hand's own frame, from the moment the hand took it. */
const inHand = new Matrix4()

/**
 * The character calls this every frame with whether its hand holds the cup
 * and where that hand is (its bone's world matrix). The cup is taken as it
 * stands, without a jump, and from then on moves as one with the hand; let go
 * of, it stands in its place again.
 */
export function carryCup(holding: boolean, hand: Matrix4): void {
  if (!holding) {
    heldCup.held = false
    return
  }
  if (!heldCup.held) inHand.copy(hand).invert().multiply(CUP_REST)
  heldCup.held = true
  heldCup.matrix.multiplyMatrices(hand, inHand)
}
