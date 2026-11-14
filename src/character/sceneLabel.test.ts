import { describe, expect, it } from 'vitest'
import { EMPTY_OFFICE_LABEL, sceneLabel } from './sceneLabel'
import type { CharState, Place } from './stateMachine'

const STATES: readonly CharState[] = [
  'resting',
  'watching',
  'greeting',
  'fidgeting',
  'working',
  'standingUp',
  'walkingOut',
  'handingFile',
  'returning',
  'error',
  'goingToSofa',
  'rushingToDesk',
]
const WAITING: readonly CharState[] = ['resting', 'watching', 'greeting', 'fidgeting']
const PLACES: readonly Place[] = ['desk', 'sofa']

describe('sceneLabel', () => {
  it.each(WAITING)('says that the character waits at its desk while it is %s there', (state) => {
    expect(sceneLabel(state, 'desk')).toBe('3D 사무실의 캐릭터가 책상에 앉아 기다리고 있어요.')
  })

  it.each(WAITING)('says that it rests on the sofa while it is %s there', (state) => {
    expect(sceneLabel(state, 'sofa')).toBe('3D 사무실의 캐릭터가 소파에 앉아 쉬고 있어요.')
  })

  it.each<[CharState, string]>([
    ['goingToSofa', '3D 사무실의 캐릭터가 소파로 걸어가고 있어요.'],
    ['rushingToDesk', '3D 사무실의 캐릭터가 책상으로 뛰어가고 있어요.'],
    ['working', '3D 사무실의 캐릭터가 책상에서 일하고 있어요.'],
    ['standingUp', '3D 사무실의 캐릭터가 결과를 전하러 책상 앞으로 나오고 있어요.'],
    ['walkingOut', '3D 사무실의 캐릭터가 결과를 전하러 책상 앞으로 나오고 있어요.'],
    ['handingFile', '3D 사무실의 캐릭터가 책상 앞에서 결과 파일을 내밀고 있어요.'],
    ['returning', '3D 사무실의 캐릭터가 책상으로 돌아가고 있어요.'],
    ['error', '3D 사무실의 캐릭터가 일이 잘 풀리지 않아 머리를 긁적이고 있어요.'],
  ])('describes %s, wherever the character last waited', (state, sentence) => {
    for (const place of PLACES) expect(sceneLabel(state, place)).toBe(sentence)
  })

  it('has one sentence per situation: nine of them, none of which could be taken for another', () => {
    const sentences = new Set(STATES.flatMap((state) => PLACES.map((place) => sceneLabel(state, place))))
    expect(sentences.size).toBe(9)
    for (const sentence of sentences) {
      // One Korean sentence, about the character in the office.
      expect(sentence).toMatch(/^3D 사무실의 캐릭터가 [^.]+요\.$/)
    }
  })

  it('says of an office without its character only that the character is not there yet', () => {
    expect(EMPTY_OFFICE_LABEL).toBe('3D 사무실에 캐릭터가 아직 나타나지 않았어요.')
    for (const state of STATES) for (const place of PLACES) expect(sceneLabel(state, place)).not.toBe(EMPTY_OFFICE_LABEL)
  })
})
