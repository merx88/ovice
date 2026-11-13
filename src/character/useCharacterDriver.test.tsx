import { act, renderHook } from '@testing-library/react'
import { PerspectiveCamera } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MESSAGES, STEP_MESSAGES } from '../agent/messages'
import {
  CAMERA,
  CHARACTER_BODY_RADIUS,
  DESK_BOUNDS,
  HANDOFF_FACING,
  HANDOFF_POS,
  SEAT_FACING,
  SEAT_GROUND_POS,
} from '../scene/layout'
import { useCharacterSignals } from '../store/characterSignals'
import { useSettings } from '../store/settings'
import { useTasks, type Task } from '../store/tasks'
import { bubbleAnchorAt } from './bubble'
import { WALK_PACE } from './clipForState'
import { CLIPS, type ClipName } from './clips'
import { SEAT_LIFT } from './clips/shared'
import { GREET_INTERVAL_MS, POINTER_STILL_MS } from './constants'
import { computeLookYaw, lookAngles } from './lookAt'
import { advancePlayback, createPlayback, MAX_STEP } from './playback'
import { FIDGETS } from './stateMachine'
import { useCharacterDriver } from './useCharacterDriver'

/** The frame callback the driver registers; the tests call it in place of the render loop. */
const loop = vi.hoisted(() => ({
  callback: null as ((state: { camera: unknown; size: unknown }, delta: number) => void) | null,
  priority: 0,
}))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: NonNullable<typeof loop.callback>, priority = 0) => {
    loop.callback = callback
    loop.priority = priority
  },
}))

const FRAME = 1 / 60
const VIEW = { width: 1728, height: 1117, left: 0, top: 0 }
const RESULT = { title: 'Report', markdown: '# Report' }

const camera = new PerspectiveCamera(CAMERA.fov, CAMERA.aspect, 0.5, 80)
camera.position.set(...CAMERA.position)
camera.lookAt(...CAMERA.target)
camera.updateMatrixWorld()

/** The time `performance.now()` reports, in ms. */
let clock = 0

/**
 * Mounts the driver with a stand-in for the 3D character: it plays whatever
 * clip the driver asks for through the real playback bookkeeping and reports
 * the end of finite clips, as the character does.
 */
function mount() {
  let renders = 0
  const playback = createPlayback()
  const hook = renderHook(() => {
    renders++
    return useCharacterDriver()
  })
  const props = () => hook.result.current

  /**
   * One frame: the driver's callback first, then the character's playback.
   * The character plays what it was last rendered with, so whatever the
   * driver changes in a frame reaches it a frame later. `apply` runs the two
   * callbacks: through `act` by default, which renders what they changed.
   */
  function frame(seconds = FRAME, apply: (work: () => void) => void = act) {
    clock += seconds * 1000
    const { clip, clipSpeed, onClipFinished } = props()
    apply(() => loop.callback?.({ camera, size: VIEW }, seconds))
    const { justFinished } = advancePlayback(playback, clip, Math.min(seconds, MAX_STEP), CLIPS[clip].duration, clipSpeed)
    if (justFinished) apply(() => onClipFinished(clip))
  }

  /** Frames until `done()` holds; returns the seconds that took. */
  function until(done: () => boolean, limit = 30): number {
    let seconds = 0
    while (!done()) {
      frame()
      seconds += FRAME
      if (seconds > limit) throw new Error(`still ${signals().charState} playing ${props().clip} after ${limit} s`)
    }
    return seconds
  }

  return {
    props,
    playback,
    frame,
    until,
    run: (seconds: number) => {
      for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += FRAME) frame()
    },
    untilState: (state: string, limit?: number) => until(() => signals().charState === state, limit),
    renders: () => renders,
    unmount: hook.unmount,
  }
}

function signals() {
  const { bubble, badge, charState } = useCharacterSignals.getState()
  return { bubble, badge, charState }
}

function pointer(type: 'pointermove' | 'pointerdown', x: number, y: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }))
  })
}

function startTask(prompt = 'Research something'): Task {
  let task!: Task
  act(() => {
    task = useTasks.getState().create(prompt)
  })
  return task
}

function update(id: string, patch: Partial<Task>) {
  act(() => useTasks.getState().update(id, patch))
}

const finish = (id: string) => update(id, { status: 'done', result: RESULT, message: null, finishedAt: 1 })
const cancel = (id: string) => update(id, { status: 'cancelled', message: MESSAGES.cancel, finishedAt: 1 })
const fail = (id: string) => update(id, { status: 'failed', error: MESSAGES.error, finishedAt: 1 })

/** The yaw the seated character would have to turn its head by to look at `target`. */
function yawTo(target: readonly [number, number, number]): number {
  return lookAngles([SEAT_GROUND_POS[0], 1.15, SEAT_GROUND_POS[2]], SEAT_FACING, target).yaw
}

beforeEach(() => {
  clock = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  // The first fidget in the list, every time.
  vi.spyOn(Math, 'random').mockReturnValue(0)
  localStorage.clear()
  useTasks.setState({ tasks: [], activeId: null, viewingId: null })
  useSettings.setState({ reduceMotion: false })
  loop.callback = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useCharacterDriver', () => {
  describe('at rest', () => {
    it('seats the character at its desk, idle, looking straight ahead', () => {
      const stage = mount()
      expect(stage.props()).toMatchObject({
        clip: 'idle',
        clipSpeed: 1,
        badge: 'idle',
        holdingFile: false,
        lookTarget: null,
        placement: { position: [...SEAT_GROUND_POS], facing: SEAT_FACING },
      })
      expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
      stage.run(3)
      expect(stage.props().clip).toBe('idle')
      expect(signals().charState).toBe('resting')
    })

    it('runs before the character in every frame, without taking over rendering', () => {
      mount()
      expect(loop.callback).not.toBeNull()
      expect(loop.priority).toBeLessThan(0)
    })

    it('does not render while nothing changes', () => {
      const stage = mount()
      stage.run(0.5)
      const before = stage.renders()
      stage.run(5)
      expect(stage.renders()).toBe(before)
    })
  })

  describe('the pointer', () => {
    it('makes the character look at it as soon as it moves', () => {
      const stage = mount()
      pointer('pointermove', 200, 150)
      expect(signals().charState).toBe('watching')
      stage.frame()

      const { lookTarget, clip } = stage.props()
      expect(clip).toBe('idle')
      expect(lookTarget).not.toBeNull()
      const [x, y, z] = lookTarget as readonly [number, number, number]
      // Upper left of the view: to the left of the character, above its head, in front of the desk.
      expect(x).toBeLessThan(SEAT_GROUND_POS[0] - 1)
      expect(y).toBeGreaterThan(1.4)
      expect(z).toBeGreaterThan(DESK_BOUNDS.max[2])
      expect(z).toBeLessThan(CAMERA.position[2])
    })

    it('counts a tap as the pointer too', () => {
      const stage = mount()
      pointer('pointerdown', 1500, 900)
      stage.frame()
      expect(signals().charState).toBe('watching')
      const [x, y] = stage.props().lookTarget as readonly [number, number, number]
      expect(x).toBeGreaterThan(SEAT_GROUND_POS[0] + 1)
      expect(y).toBeLessThan(0.6)
    })

    it('follows the pointer in place: one target, and no render per move', () => {
      const stage = mount()
      pointer('pointermove', 200, 150)
      stage.frame()
      const target = stage.props().lookTarget as readonly [number, number, number]
      const before = [...target]
      const renders = stage.renders()

      for (let x = 300; x <= 1500; x += 100) {
        pointer('pointermove', x, 150)
        stage.frame()
      }

      expect(stage.props().lookTarget).toBe(target)
      expect(target[0]).toBeGreaterThan(before[0] + 2)
      expect(stage.renders()).toBe(renders)
    })

    it.each([
      ['left', 0],
      ['right', VIEW.width],
      ['far outside the view', VIEW.width * 3],
    ])('turns the head but never the body for a pointer at the %s edge', (_, x) => {
      const stage = mount()
      pointer('pointermove', x, VIEW.height / 2)
      stage.frame()
      const yaw = yawTo(stage.props().lookTarget as readonly [number, number, number])
      expect(Math.abs(yaw)).toBeGreaterThan((30 * Math.PI) / 180)
      expect(computeLookYaw(yaw).body).toBe(0)
    })

    it('waves once the pointer has been still, then fidgets, then rests', () => {
      const stage = mount()
      pointer('pointermove', 200, 150)
      stage.run(POINTER_STILL_MS / 1000 - 0.1)
      expect(signals().charState).toBe('watching')
      stage.run(0.2)
      expect(signals().charState).toBe('greeting')
      expect(stage.props().clip).toBe('wave')
      // It keeps looking at whoever it is waving to.
      expect(stage.props().lookTarget).not.toBeNull()

      const waved = stage.untilState('fidgeting')
      expect(waved).toBeCloseTo(CLIPS.wave.duration as number, 0)
      expect(stage.props().clip).toBe(FIDGETS[0])
      // A fidget moves the head itself.
      expect(stage.props().lookTarget).toBeNull()

      const fidgeted = stage.untilState('resting')
      expect(fidgeted).toBeCloseTo(CLIPS[FIDGETS[0]].duration as number, 0)
      expect(stage.props()).toMatchObject({ clip: 'idle', lookTarget: null, badge: 'idle' })
    })

    it('does not wave again so soon, but does once enough time has passed', () => {
      const stage = mount()
      pointer('pointermove', 200, 150)
      stage.untilState('greeting')
      const greetedAt = clock
      stage.untilState('resting')

      pointer('pointermove', 400, 300)
      stage.until(() => signals().charState !== 'watching')
      expect(clock - greetedAt).toBeLessThan(GREET_INTERVAL_MS)
      expect(signals().charState).toBe('fidgeting')
      stage.untilState('resting')

      stage.run((GREET_INTERVAL_MS - (clock - greetedAt)) / 1000)
      pointer('pointermove', 600, 300)
      stage.until(() => signals().charState !== 'watching')
      expect(signals().charState).toBe('greeting')
    })

    it('stops a fidget to look at the pointer again', () => {
      const stage = mount()
      pointer('pointermove', 200, 150)
      stage.untilState('fidgeting')
      stage.run(0.5)
      pointer('pointermove', 900, 400)
      expect(signals().charState).toBe('watching')
      stage.frame()
      expect(stage.props().clip).toBe('idle')
      expect(stage.props().lookTarget).not.toBeNull()
    })

    it('keeps going when the pointer leaves the page or the window loses focus', () => {
      const stage = mount()
      pointer('pointermove', 200, 150)
      stage.run(0.5)
      act(() => {
        document.documentElement.dispatchEvent(new MouseEvent('pointerleave'))
        document.documentElement.dispatchEvent(new MouseEvent('mouseleave'))
        window.dispatchEvent(new Event('blur'))
      })
      expect(signals().charState).toBe('watching')
      stage.run(1)
      expect(signals().charState).toBe('greeting')
    })
  })

  describe('a task', () => {
    it('is worked on at the laptop, thinking and typing by turns, with its progress in the bubble', () => {
      const stage = mount()
      const task = startTask()
      expect(signals()).toEqual({ bubble: [], badge: 'working', charState: 'working' })
      expect(stage.props()).toMatchObject({ clip: 'think', badge: 'working', lookTarget: null })

      const expected = { reading: 'think', searching: 'typing', comparing: 'think', writing: 'typing' } as const
      for (const step of ['reading', 'searching', 'comparing', 'writing'] as const) {
        update(task.id, { step, message: STEP_MESSAGES[step] })
        stage.run(0.5)
        expect(stage.props().clip).toBe(expected[step])
        expect(signals()).toEqual({ bubble: [STEP_MESSAGES[step]], badge: 'working', charState: 'working' })
      }
    })

    it('does not render for a change of the tasks that changes nothing the character shows', () => {
      const stage = mount()
      const task = startTask()
      update(task.id, { step: 'reading', message: STEP_MESSAGES.reading })
      stage.run(0.5)
      const renders = stage.renders()

      // Another step with the same clip, another line, and somebody reading an old result.
      update(task.id, { step: 'comparing', message: STEP_MESSAGES.comparing })
      update(task.id, { message: 'Still comparing...' })
      act(() => useTasks.getState().setViewing(task.id))
      act(() => useTasks.getState().setViewing(null))
      stage.run(0.5)

      expect(signals().bubble).toEqual(['Still comparing...'])
      expect(stage.renders()).toBe(renders)
    })

    it('interrupts whatever the character was idly doing', () => {
      const stage = mount()
      pointer('pointermove', 200, 150)
      stage.untilState('greeting')
      startTask()
      expect(signals().charState).toBe('working')
      stage.frame()
      expect(stage.props()).toMatchObject({ clip: 'think', lookTarget: null })
      // The wave that was cut short does not come back to end anything.
      stage.run(4)
      expect(signals().charState).toBe('working')
    })

    it('ignores the pointer while it works', () => {
      const stage = mount()
      startTask()
      pointer('pointermove', 200, 150)
      stage.run(2)
      expect(signals().charState).toBe('working')
      expect(stage.props().lookTarget).toBeNull()
    })

    it('ends with the character standing up, walking round the desk and holding out the file', () => {
      const stage = mount()
      const task = startTask()
      update(task.id, { step: 'writing', message: STEP_MESSAGES.writing })
      stage.run(1)
      finish(task.id)

      // Standing up, in place.
      expect(signals()).toEqual({ bubble: [MESSAGES.done[0]], badge: 'done', charState: 'standingUp' })
      stage.frame()
      expect(stage.props()).toMatchObject({ clip: 'standUp', clipSpeed: 1, holdingFile: false })
      const stoodUp = stage.untilState('walkingOut')
      expect(stoodUp).toBeCloseTo(CLIPS.standUp.duration as number, 1)
      expect(stage.props().placement.position).toEqual([...SEAT_GROUND_POS])

      // Walking, with the clip sped up to the pace it is moved at.
      stage.frame()
      expect(stage.props()).toMatchObject({ clip: 'walk', clipSpeed: WALK_PACE, holdingFile: false, lookTarget: null })
      expect(signals()).toEqual({ bubble: [MESSAGES.done[0]], badge: 'done', charState: 'walkingOut' })
      const renders = stage.renders()
      let leftmost = Infinity
      let walked = 0
      while (signals().charState === 'walkingOut') {
        stage.frame()
        walked += FRAME
        const [x, y, z] = stage.props().placement.position
        leftmost = Math.min(leftmost, x)
        expect(y).toBe(0)
        // Never through the desk, nor closer to it than it sits.
        const besideX = Math.max(DESK_BOUNDS.min[0] - x, 0, x - DESK_BOUNDS.max[0])
        const besideZ = Math.max(DESK_BOUNDS.min[2] - z, 0, z - DESK_BOUNDS.max[2])
        expect(Math.hypot(besideX, besideZ), `at ${x.toFixed(2)}, ${z.toFixed(2)}`).toBeGreaterThan(CHARACTER_BODY_RADIUS - 0.001)
        if (walked > 10) throw new Error('never arrived')
      }
      expect(leftmost).toBeLessThan(DESK_BOUNDS.min[0] - CHARACTER_BODY_RADIUS)
      expect(walked).toBeGreaterThan(3.2)
      expect(walked).toBeLessThan(3.8)
      // One render for arriving; none for the steps on the way.
      expect(stage.renders() - renders).toBeLessThanOrEqual(1)

      // Holding out the folder, in front of the desk, facing the camera.
      expect(signals()).toEqual({ bubble: [...MESSAGES.done], badge: 'done', charState: 'handingFile' })
      expect(stage.props()).toMatchObject({ clip: 'holdFile', clipSpeed: 1, holdingFile: true, badge: 'done' })
      stage.run(1)
      expect(stage.props().placement).toEqual({ position: [...HANDOFF_POS], facing: HANDOFF_FACING })
      // It waits there for as long as it takes.
      stage.run(20)
      expect(signals().charState).toBe('handingFile')
    })

    it('opens through the folder, and closing the viewer sends the character back to its seat', () => {
      const stage = mount()
      const task = startTask()
      finish(task.id)
      stage.untilState('handingFile')

      act(() => stage.props().onFolderClick())
      expect(useTasks.getState().viewingId).toBe(task.id)
      stage.run(2)
      expect(signals().charState).toBe('handingFile')

      act(() => useTasks.getState().setViewing(null))
      expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'returning' })
      stage.frame()
      expect(stage.props()).toMatchObject({ clip: 'walk', clipSpeed: WALK_PACE, holdingFile: false })

      // Walks all the way back before it sits down.
      const walked = stage.until(() => stage.props().clip === 'sitDown')
      expect(walked).toBeGreaterThan(3.2)
      expect(walked).toBeLessThan(3.8)
      expect(signals().charState).toBe('returning')
      expect(stage.props().placement.position).toEqual([...SEAT_GROUND_POS])
      // And it has turned to the desk before it does.
      expect(Math.abs(stage.props().placement.facing - SEAT_FACING)).toBeLessThan(0.11)

      const sat = stage.untilState('resting')
      expect(sat).toBeCloseTo(CLIPS.sitDown.duration as number, 1)
      expect(stage.props()).toMatchObject({
        clip: 'idle',
        badge: 'idle',
        holdingFile: false,
        placement: { position: [...SEAT_GROUND_POS], facing: SEAT_FACING },
      })
    })

    it('is brought round the desk and back the same way every time', () => {
      const stage = mount()
      for (const prompt of ['first', 'second']) {
        const task = startTask(prompt)
        finish(task.id)
        stage.untilState('handingFile')
        stage.run(0.5)
        act(() => stage.props().onFolderClick())
        expect(useTasks.getState().viewingId).toBe(task.id)
        act(() => useTasks.getState().setViewing(null))

        // On its feet, walking, until it is back at its chair; only there does it sit down.
        stage.frame()
        while (stage.props().clip !== 'sitDown') {
          expect(stage.props().clip).toBe('walk')
          expect(signals().charState).toBe('returning')
          stage.frame()
        }
        expect(stage.props().placement.position).toEqual([...SEAT_GROUND_POS])
        stage.untilState('resting')
        stage.run(0.5)
      }
    })

    it('leaves alone whatever is in the store when the character appears', () => {
      act(() => {
        const old = useTasks.getState().create('An old task')
        useTasks.getState().update(old.id, { status: 'done', result: RESULT, finishedAt: 1 })
        const failed = useTasks.getState().create('Another old task')
        useTasks.getState().update(failed.id, { status: 'failed', error: 'x', finishedAt: 1 })
      })
      const stage = mount()
      stage.run(3)
      expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
      expect(stage.props()).toMatchObject({ clip: 'idle', holdingFile: false })

      // Looking at an old result and closing it again is nothing to the character either.
      act(() => useTasks.getState().setViewing(useTasks.getState().tasks[1].id))
      act(() => useTasks.getState().setViewing(null))
      stage.run(1)
      expect(signals().charState).toBe('resting')
    })

    it('is picked up when it is already running as the character appears', () => {
      const task = startTask()
      update(task.id, { step: 'searching', message: STEP_MESSAGES.searching })
      const stage = mount()
      expect(signals()).toEqual({ bubble: [STEP_MESSAGES.searching], badge: 'working', charState: 'working' })
      expect(stage.props().clip).toBe('typing')
    })
  })

  describe('a cancelled task', () => {
    it('has the character say so for two seconds and rest', () => {
      const stage = mount()
      const task = startTask()
      update(task.id, { step: 'searching', message: STEP_MESSAGES.searching })
      stage.run(1)
      cancel(task.id)

      expect(signals()).toEqual({ bubble: [MESSAGES.cancel], badge: 'idle', charState: 'resting' })
      stage.frame()
      expect(stage.props().clip).toBe('idle')
      stage.run(1.9)
      expect(signals().bubble).toEqual([MESSAGES.cancel])
      stage.run(0.2)
      expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
    })

    it('stops being talked about as soon as the next task starts', () => {
      const stage = mount()
      cancel(startTask().id)
      stage.run(0.5)
      const next = startTask()
      expect(signals().bubble).toEqual([])
      update(next.id, { step: 'reading', message: STEP_MESSAGES.reading })
      expect(signals().bubble).toEqual([STEP_MESSAGES.reading])
      // The two seconds of the cancelled task run out without a trace.
      stage.run(2)
      expect(signals().bubble).toEqual([STEP_MESSAGES.reading])
      // And the line does not come back when this task is over.
      finish(next.id)
      stage.untilState('handingFile')
      act(() => useTasks.getState().setViewing(next.id))
      act(() => useTasks.getState().setViewing(null))
      expect(signals().bubble).toEqual([])
    })
  })

  describe('a failed task', () => {
    it('has the character scratch its head and say so, then rest', () => {
      const stage = mount()
      const task = startTask()
      update(task.id, { step: 'comparing', message: STEP_MESSAGES.comparing })
      stage.run(1)
      fail(task.id)

      expect(signals()).toEqual({ bubble: [MESSAGES.error], badge: 'error', charState: 'error' })
      stage.frame()
      expect(stage.props()).toMatchObject({ clip: 'scratchHead', badge: 'error' })
      const scratched = stage.untilState('resting')
      expect(scratched).toBeCloseTo(CLIPS.scratchHead.duration as number, 0)
      expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
    })
  })

  describe('a task started while the last one is being handed over', () => {
    function handingOver() {
      const stage = mount()
      const first = startTask('first')
      finish(first.id)
      stage.untilState('handingFile')
      return { stage, first }
    }

    it('sends the character back to work on it', () => {
      const { stage } = handingOver()
      const second = startTask('second')
      expect(signals()).toEqual({ bubble: [], badge: 'working', charState: 'returning' })
      update(second.id, { step: 'reading', message: STEP_MESSAGES.reading })
      expect(signals().bubble).toEqual([STEP_MESSAGES.reading])
      stage.frame()
      expect(stage.props()).toMatchObject({ clip: 'walk', holdingFile: false, badge: 'working' })

      stage.untilState('working')
      expect(stage.props().placement).toEqual({ position: [...SEAT_GROUND_POS], facing: SEAT_FACING })
      stage.frame()
      expect(stage.props().clip).toBe('think')
    })

    it('has the folder open the task it is handing over, each time', () => {
      const { stage, first } = handingOver()
      act(() => stage.props().onFolderClick())
      expect(useTasks.getState().viewingId).toBe(first.id)
      act(() => useTasks.getState().setViewing(null))

      // The second task finishes while the character is still walking back.
      const second = startTask('second')
      stage.run(1)
      finish(second.id)
      expect(signals()).toEqual({ bubble: [], badge: 'done', charState: 'returning' })

      // It sits down first, then gets up again and brings the second result.
      stage.untilState('standingUp')
      expect(signals().bubble).toEqual([MESSAGES.done[0]])
      stage.untilState('handingFile')
      act(() => stage.props().onFolderClick())
      expect(useTasks.getState().viewingId).toBe(second.id)
    })

    it('shows the trouble once the character is back when that task fails on the way', () => {
      const { stage } = handingOver()
      const second = startTask('second')
      stage.run(1)
      fail(second.id)
      expect(signals()).toEqual({ bubble: [], badge: 'error', charState: 'returning' })
      stage.untilState('error')
      expect(signals().bubble).toEqual([MESSAGES.error])
      stage.untilState('resting')
    })

    it('says it is stopping on the way back when that task is cancelled', () => {
      const { stage } = handingOver()
      const second = startTask('second')
      stage.run(1)
      cancel(second.id)
      expect(signals()).toEqual({ bubble: [MESSAGES.cancel], badge: 'idle', charState: 'returning' })
      stage.run(2.1)
      expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'returning' })
      stage.untilState('resting')
    })

    it('does not say it is stopping about a task that started after the cancelled one', () => {
      const { stage } = handingOver()
      cancel(startTask('second').id)
      expect(signals().bubble).toEqual([MESSAGES.cancel])
      stage.run(0.3)

      // The third task is done before the character is back, within two seconds of the cancellation.
      const third = startTask('third')
      stage.run(0.5)
      finish(third.id)
      expect(signals()).toEqual({ bubble: [], badge: 'done', charState: 'returning' })
      stage.run(0.5)
      expect(signals().bubble).toEqual([])
    })

    it('turns the character round in the middle of the walk out', () => {
      const stage = mount()
      const first = startTask('first')
      finish(first.id)
      stage.untilState('walkingOut')
      stage.run(1.5)
      const [turnedAtX, , turnedAtZ] = stage.props().placement.position
      expect(turnedAtX).toBeLessThan(DESK_BOUNDS.min[0])

      startTask('second')
      expect(signals().charState).toBe('returning')
      const back = stage.untilState('working')
      // Back the way it came, which is shorter than the whole round.
      expect(back).toBeLessThan(3.5)
      expect(stage.props().placement).toEqual({ position: [...SEAT_GROUND_POS], facing: SEAT_FACING })
      expect([turnedAtX, turnedAtZ]).not.toEqual([SEAT_GROUND_POS[0], SEAT_GROUND_POS[2]])
    })

    it('sits the character straight back down when it had only just stood up', () => {
      const stage = mount()
      finish(startTask('first').id)
      stage.run(0.4)
      expect(signals().charState).toBe('standingUp')
      startTask('second')
      expect(signals().charState).toBe('returning')
      stage.run(0.1)
      expect(stage.props().clip).toBe('sitDown')
      expect(stage.props().placement.position).toEqual([...SEAT_GROUND_POS])
      const sat = stage.untilState('working')
      expect(sat).toBeLessThan(1.2)
    })
  })

  describe('the end of a clip', () => {
    const late = (stage: ReturnType<typeof mount>, clip: ClipName) => act(() => stage.props().onClipFinished(clip))

    it('is dropped when it belongs to a state the character has left', () => {
      const stage = mount()
      const task = startTask()
      late(stage, 'wave')
      late(stage, 'sip')
      expect(signals().charState).toBe('working')

      fail(task.id)
      late(stage, 'wave')
      late(stage, 'standUp')
      late(stage, 'sitDown')
      expect(signals().charState).toBe('error')
      late(stage, 'scratchHead')
      expect(signals().charState).toBe('resting')
    })

    it('does not end a greeting or a fidget unless it is theirs', () => {
      const stage = mount()
      pointer('pointermove', 200, 150)
      stage.untilState('greeting')
      late(stage, 'scratchHead')
      late(stage, FIDGETS[0])
      expect(signals().charState).toBe('greeting')
      late(stage, 'wave')
      expect(signals().charState).toBe('fidgeting')
      late(stage, 'wave')
      late(stage, FIDGETS[1])
      expect(signals().charState).toBe('fidgeting')
      late(stage, FIDGETS[0])
      expect(signals().charState).toBe('resting')
    })

    it('never cuts the walk out or the hand-over short', () => {
      const stage = mount()
      finish(startTask().id)
      stage.untilState('walkingOut')
      for (const clip of ['standUp', 'sitDown', 'wave', 'scratchHead'] as const) late(stage, clip)
      expect(signals().charState).toBe('walkingOut')
      stage.untilState('handingFile')
      for (const clip of ['standUp', 'sitDown', 'wave', 'scratchHead'] as const) late(stage, clip)
      expect(signals().charState).toBe('handingFile')
    })

    it('does not seat a character that is still walking back', () => {
      const stage = mount()
      finish(startTask().id)
      stage.untilState('handingFile')
      startTask('second')
      stage.run(1)
      late(stage, 'standUp')
      expect(signals().charState).toBe('returning')
      expect(stage.props().clip).toBe('walk')
    })
  })

  describe('sitting down twice in a row', () => {
    it('waits until the character has been shown something else in between, or it would never finish sitting', async () => {
      const stage = mount()
      finish(startTask('first').id)
      stage.untilState('handingFile')
      // The second task is done before the character is back: it will sit down and get up again.
      const second = startTask('second')
      stage.run(1)
      finish(second.id)
      stage.until(() => stage.playback.name === 'sitDown')
      stage.until(() => stage.playback.time + 1.5 * FRAME >= (CLIPS.sitDown.duration as number))
      expect(signals().charState).toBe('returning')

      // From here on nothing is rendered, as when frames and events pile up faster than React gets a turn.
      const unrendered = (work: () => void) => work()
      Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false)
      try {
        // The character finishes sitting down, and gets up for the second result...
        stage.frame(FRAME, unrendered)
        expect(signals().charState).toBe('standingUp')
        // ...a third task starts at once, which sends it straight back to its chair...
        useTasks.getState().create('third')
        expect(signals().charState).toBe('returning')
        // ...and the next frame finds it there already.
        stage.frame(FRAME, unrendered)
        // All the while, what the character was shown last is the clip it has just finished.
        expect(stage.props().clip).toBe('sitDown')
        expect(stage.playback.finished).toBe(true)
      } finally {
        Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
      }
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30))
      })

      // Once React has caught up the character is shown the walk first, and then sits down afresh.
      expect(stage.props().clip).toBe('walk')
      const sat = stage.untilState('working', 5)
      expect(sat).toBeGreaterThan((CLIPS.sitDown.duration as number) - 0.05)
      expect(sat).toBeLessThan((CLIPS.sitDown.duration as number) + 0.2)
    })
  })

  describe('with reduced motion', () => {
    beforeEach(() => {
      useSettings.setState({ reduceMotion: true })
    })

    it('puts the character at the hand-off spot at once instead of walking it there', () => {
      const stage = mount()
      finish(startTask().id)
      stage.untilState('walkingOut')
      expect(stage.props().placement.position).toEqual([...SEAT_GROUND_POS])
      stage.frame()
      expect(signals().charState).toBe('handingFile')
      expect(stage.props().placement).toEqual({ position: [...HANDOFF_POS], facing: HANDOFF_FACING })
      expect(stage.props()).toMatchObject({ clip: 'holdFile', holdingFile: true })
    })

    it('puts it back on its chair at once and has it sit down', () => {
      const stage = mount()
      const task = startTask()
      finish(task.id)
      stage.untilState('handingFile')
      act(() => useTasks.getState().setViewing(task.id))
      act(() => useTasks.getState().setViewing(null))
      stage.frame()
      expect(stage.props().placement).toEqual({ position: [...SEAT_GROUND_POS], facing: SEAT_FACING })
      expect(stage.props().clip).toBe('sitDown')
      expect(signals().charState).toBe('returning')
      const sat = stage.untilState('resting')
      expect(sat).toBeCloseTo(CLIPS.sitDown.duration as number, 1)
    })
  })

  describe('the bubble anchor', () => {
    it('is one object that follows the character without telling anyone', () => {
      const stage = mount()
      const { bubbleAnchor } = useCharacterSignals.getState()
      stage.run(0.5)
      expect(bubbleAnchor.current).toEqual(bubbleAnchorAt(SEAT_GROUND_POS, SEAT_LIFT))

      finish(startTask().id)
      stage.untilState('walkingOut')
      const told = vi.fn()
      const unsubscribe = useCharacterSignals.subscribe(told)
      stage.run(2)
      // Mid-walk: beside the character, wherever it is, and nobody was notified.
      const [x, , z] = stage.props().placement.position
      expect(bubbleAnchor.current[0]).toBeCloseTo(bubbleAnchorAt([x, 0, z], 0)[0])
      expect(bubbleAnchor.current[2]).toBeCloseTo(z)
      expect(told).not.toHaveBeenCalled()
      unsubscribe()

      stage.untilState('handingFile')
      stage.run(1.5)
      const atHandoff = bubbleAnchorAt(HANDOFF_POS, 0)
      bubbleAnchor.current.forEach((value, axis) => expect(value).toBeCloseTo(atHandoff[axis], 2))
      expect(useCharacterSignals.getState().bubbleAnchor).toBe(bubbleAnchor)
    })

    it('comes down smoothly as the character stands up, and goes back up as it sits down', () => {
      const stage = mount()
      const { bubbleAnchor } = useCharacterSignals.getState()
      const task = startTask()
      stage.run(0.5)
      const seated = bubbleAnchor.current[1]
      finish(task.id)

      let previous = seated
      for (let frames = 0; frames < 54; frames++) {
        stage.frame()
        const height = bubbleAnchor.current[1]
        expect(height).toBeLessThanOrEqual(previous)
        expect(previous - height).toBeLessThan(0.03)
        previous = height
      }
      expect(seated - previous).toBeGreaterThan(SEAT_LIFT * 0.9)

      stage.untilState('handingFile')
      act(() => useTasks.getState().setViewing(task.id))
      act(() => useTasks.getState().setViewing(null))
      stage.until(() => stage.props().clip === 'sitDown')
      // Still down as the character reaches its chair (it has just begun to rise with it).
      expect(bubbleAnchor.current[1]).toBeLessThan(seated - SEAT_LIFT * 0.9)
      stage.untilState('resting')
      stage.run(1)
      expect(bubbleAnchor.current[1]).toBeCloseTo(seated, 2)
    })
  })

  describe('when the character goes away', () => {
    it('stops listening to the pointer and to the tasks, and clears what it told the interface', () => {
      const added = vi.spyOn(window, 'addEventListener')
      const removed = vi.spyOn(window, 'removeEventListener')
      const pageAdded = vi.spyOn(document.documentElement, 'addEventListener')
      const pageRemoved = vi.spyOn(document.documentElement, 'removeEventListener')
      const stage = mount()
      const listened = (calls: unknown[][]) =>
        calls.filter(([type]) => ['pointermove', 'pointerdown', 'blur', 'pointerleave', 'mouseleave'].includes(type as string))
      expect(listened(added.mock.calls).map(([type]) => type)).toEqual(['pointermove', 'pointerdown', 'blur'])
      expect(listened(pageAdded.mock.calls).map(([type]) => type)).toEqual(['pointerleave', 'mouseleave'])

      const task = startTask()
      update(task.id, { step: 'reading', message: STEP_MESSAGES.reading })
      expect(signals().charState).toBe('working')
      stage.unmount()

      expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
      // Every listener that was added is removed, with the very same function.
      expect(listened(removed.mock.calls)).toEqual(listened(added.mock.calls))
      expect(listened(pageRemoved.mock.calls)).toEqual(listened(pageAdded.mock.calls))
      pointer('pointermove', 200, 150)
      finish(task.id)
      expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
    })
  })
})
