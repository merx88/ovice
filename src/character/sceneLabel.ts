// The picture of the office in a sentence, for those who cannot see it: what
// the character in it is doing, and where. Korean, like the rest of the
// interface; the lines the character says itself are its speech bubble's.
import type { CharState, Place } from './stateMachine'

/** The picture before the character has appeared in it: its model is still loading. */
export const EMPTY_OFFICE_LABEL = '3D 사무실에 캐릭터가 아직 나타나지 않았어요.'

/**
 * What the picture shows while the character is in `state`. `place` says
 * where it waits, which is all that tells waiting at the desk from resting
 * on the sofa; on its ways the state says where it is going.
 */
export function sceneLabel(state: CharState, place: Place): string {
  switch (state) {
    case 'resting':
    case 'watching':
    case 'greeting':
    case 'fidgeting':
      return place === 'sofa'
        ? '3D 사무실의 캐릭터가 소파에 앉아 쉬고 있어요.'
        : '3D 사무실의 캐릭터가 책상에 앉아 기다리고 있어요.'
    case 'goingToSofa':
      return '3D 사무실의 캐릭터가 소파로 걸어가고 있어요.'
    case 'rushingToDesk':
      return '3D 사무실의 캐릭터가 책상으로 뛰어가고 있어요.'
    case 'working':
      return '3D 사무실의 캐릭터가 책상에서 일하고 있어요.'
    case 'standingUp':
    case 'walkingOut':
      return '3D 사무실의 캐릭터가 결과를 전하러 책상 앞으로 나오고 있어요.'
    case 'handingFile':
      return '3D 사무실의 캐릭터가 책상 앞에서 결과 파일을 내밀고 있어요.'
    case 'returning':
      return '3D 사무실의 캐릭터가 책상으로 돌아가고 있어요.'
    case 'error':
      return '3D 사무실의 캐릭터가 일이 잘 풀리지 않아 머리를 긁적이고 있어요.'
  }
}
