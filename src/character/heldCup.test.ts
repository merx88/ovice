import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { CUP_POS } from '../scene/layout'
import { carryCup, CUP_REST, heldCup } from './heldCup'

/** A hand somewhere, turned somehow and scaled as the model's bones are. */
function hand(position: [number, number, number], turn: [number, number, number] = [0.3, -0.8, 0.5]): Matrix4 {
  return new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...turn)), new Vector3(1.52, 1.52, 1.52))
}

function expectSameMatrix(actual: Matrix4, expected: Matrix4) {
  actual.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index], 9))
}

afterEach(() => carryCup(false, new Matrix4()))

describe('the cup in the hand', () => {
  it('stands in its place on the desk until it is taken', () => {
    expect(heldCup.held).toBe(false)
    expect(new Vector3().setFromMatrixPosition(CUP_REST).toArray()).toEqual([...CUP_POS])
    // Upright and its own size.
    expectSameMatrix(CUP_REST, new Matrix4().makeTranslation(CUP_POS[0], CUP_POS[1], CUP_POS[2]))
  })

  it('is taken where it stands, without a jump, wherever the hand is', () => {
    carryCup(true, hand([0.51, 0.7, -0.35]))
    expect(heldCup.held).toBe(true)
    expectSameMatrix(heldCup.matrix, CUP_REST)
  })

  it('moves as one with the hand from then on', () => {
    const taken = hand([0.51, 0.7, -0.35])
    carryCup(true, taken)
    // The hand goes somewhere else and turns: the same move takes the cup along.
    const move = new Matrix4().compose(new Vector3(-0.3, 0.25, 0.1), new Quaternion().setFromEuler(new Euler(-0.6, 0.4, 0.2)), new Vector3(1, 1, 1))
    carryCup(true, move.clone().multiply(taken))
    expectSameMatrix(heldCup.matrix, move.clone().multiply(CUP_REST))
    // It keeps its size however the hand's bone is scaled.
    const scale = new Vector3()
    heldCup.matrix.decompose(new Vector3(), new Quaternion(), scale)
    for (const s of scale.toArray()) expect(s).toBeCloseTo(1, 9)
  })

  it('comes back to exactly where it stood when the hand comes back to where it took it', () => {
    const taken = hand([0.51, 0.7, -0.35])
    carryCup(true, taken)
    carryCup(true, hand([0.2, 0.95, -0.3], [-1.2, 0.2, 0.9]))
    carryCup(true, taken.clone())
    expectSameMatrix(heldCup.matrix, CUP_REST)
  })

  it('is let go of, and taken afresh the next time', () => {
    carryCup(true, hand([0.51, 0.7, -0.35]))
    carryCup(true, hand([0.2, 0.95, -0.3]))
    carryCup(false, hand([0.2, 0.95, -0.3]))
    expect(heldCup.held).toBe(false)
    // Another hand position altogether: the cup is again taken as it stands.
    carryCup(true, hand([0.4, 0.8, -0.2], [0, 0, 0]))
    expectSameMatrix(heldCup.matrix, CUP_REST)
  })
})
