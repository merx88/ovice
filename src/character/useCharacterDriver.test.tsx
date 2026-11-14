import { act, renderHook } from '@testing-library/react'
import { StrictMode, type JSXElementConstructor, type ReactNode } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { MESSAGES, STEP_MESSAGES } from '../agent/messages'
import * as env from '../app/env'
import {
  CAMERA,
  CHARACTER_BODY_RADIUS,
  DESK_BOUNDS,
  HANDOFF_FACING,
  HANDOFF_POS,
  MOBILE_BREAKPOINT,
  SEAT_FACING,
  SEAT_GROUND_POS,
  SOFA_FACING,
  SOFA_LIFT,
  SOFA_SEAT_POS,
  SOFA_STAND_POS,
} from '../scene/layout'
import { useCharacterSignals } from '../store/characterSignals'
import { useChatActivity } from '../store/chatActivity'
import { useSettings } from '../store/settings'
import { useTasks, type Task } from '../store/tasks'
import { bubbleAnchorAt, DONE_FIRST_LINE_MS } from './bubble'
import { RUN_PACE, WALK_PACE } from './clipForState'
import { CLIPS, type ClipName } from './clips'
import { SEAT_SPOT_CLIPS } from './clips/hop'
import { RUN_SPEED } from './clips/run'
import { SEAT_LIFT } from './clips/shared'
import { GREET_INTERVAL_MS, HEAD_MAX_YAW, POINTER_STILL_MS, SOFA_AFTER_MS } from './constants'
import { computeLookYaw, lookAngles } from './lookAt'
import { RUN_TURNING } from './path'
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
 * the end of finite clips, as the character does. `wrapper` goes round the
 * component that calls the hook.
 */
function mount(wrapper?: JSXElementConstructor<{ children: ReactNode }>) {
  let renders = 0
  const playback = createPlayback()
  /** The size of the picture, which a test can change as a window is resized. */
  const view = { ...VIEW }
  const hook = renderHook(
    () => {
      renders++
      return useCharacterDriver()
    },
    { wrapper },
  )
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
    apply(() => loop.callback?.({ camera, size: view }, seconds))
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
    view,
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

/** Where the character waits, as the interface is told. */
function place() {
  return useCharacterSignals.getState().place
}

/** The chat is used: its field is focused or pressed, or its text changes. */
function chat() {
  act(() => useChatActivity.getState().report())
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
  useChatActivity.setState({ at: -Infinity })
  // Where the last test left the bubble's anchor is nothing to the next one.
  useCharacterSignals.getState().bubbleAnchor.current = bubbleAnchorAt(SEAT_GROUND_POS, SEAT_LIFT)
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
      // The last fidget in the list, a short one: after a sip the eight seconds would nearly be over.
      vi.mocked(Math.random).mockReturnValue(0.99)
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

      // (Somebody is writing in the chat meanwhile, or it would be off to the sofa by now.)
      chat()
      stage.run((GREET_INTERVAL_MS - (clock - greetedAt)) / 1000)
      pointer('pointermove', 600, 300)
      stage.until(() => signals().charState !== 'watching')
      expect(signals().charState).toBe('greeting')
    })

    it('stops a fidget to look at the pointer again', () => {
      // The second fidget in the list: a stretch.
      vi.mocked(Math.random).mockReturnValue(0.3)
      const stage = mount()
      pointer('pointermove', 200, 150)
      stage.untilState('fidgeting')
      stage.frame()
      expect(stage.props().clip).toBe('stretch')
      stage.run(0.5)
      pointer('pointermove', 900, 400)
      expect(signals().charState).toBe('watching')
      stage.frame()
      expect(stage.props().clip).toBe('idle')
      expect(stage.props().lookTarget).not.toBeNull()
    })

    it('finishes a sip before it looks at the pointer again', () => {
      const stage = mount()
      pointer('pointermove', 200, 150)
      stage.untilState('fidgeting')
      stage.frame()
      expect(stage.props().clip).toBe('sip')
      stage.run(0.5)
      pointer('pointermove', 900, 400)
      // The cup is in its hand: it neither turns to the pointer nor drops the sip.
      expect(signals().charState).toBe('fidgeting')
      stage.frame()
      expect(stage.props()).toMatchObject({ clip: 'sip', lookTarget: null })
      const rest = stage.untilState('resting')
      expect(rest).toBeGreaterThan(1)
      expect(stage.props().lookTarget).toBeNull()
      pointer('pointermove', 600, 300)
      expect(signals().charState).toBe('watching')
    })

    it('puts the cup down before it starts on a task that arrives during a sip', () => {
      const stage = mount()
      pointer('pointermove', 200, 150)
      stage.untilState('fidgeting')
      stage.run(0.5)
      const task = startTask()
      stage.frame()
      // The sip goes on, and the symbol above the head already shows the task.
      expect(signals()).toMatchObject({ charState: 'fidgeting', badge: 'thinking' })
      expect(stage.props().clip).toBe('sip')
      update(task.id, { step: 'searching', message: STEP_MESSAGES.searching })
      stage.frame()
      expect(signals()).toMatchObject({ charState: 'fidgeting', badge: 'working', bubble: [STEP_MESSAGES.searching] })
      const sipped = stage.untilState('working')
      expect(sipped).toBeGreaterThan(1)
      stage.frame()
      expect(stage.props().clip).toBe('typing')
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
      // Until the task says what it is doing, it is being thought about.
      expect(signals()).toEqual({ bubble: [], badge: 'thinking', charState: 'working' })
      expect(stage.props()).toMatchObject({ clip: 'think', badge: 'thinking', lookTarget: null })

      const expected = {
        reading: { clip: 'think', badge: 'thinking' },
        searching: { clip: 'typing', badge: 'working' },
        comparing: { clip: 'think', badge: 'thinking' },
        writing: { clip: 'typing', badge: 'working' },
      } as const
      for (const step of ['reading', 'searching', 'comparing', 'writing'] as const) {
        update(task.id, { step, message: STEP_MESSAGES[step] })
        // The symbol above the head changes with the step, at once.
        expect(signals()).toEqual({ bubble: [STEP_MESSAGES[step]], badge: expected[step].badge, charState: 'working' })
        stage.run(0.5)
        expect(stage.props()).toMatchObject(expected[step])
        expect(signals()).toEqual({ bubble: [STEP_MESSAGES[step]], badge: expected[step].badge, charState: 'working' })
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

      // Holding out the folder, in front of the desk, facing the camera: the second line has taken the first one's place.
      expect(signals()).toEqual({ bubble: [MESSAGES.done[1]], badge: 'done', charState: 'handingFile' })
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

    it('is picked up when it is already running as the character appears', () => {
      const task = startTask()
      update(task.id, { step: 'searching', message: STEP_MESSAGES.searching })
      const stage = mount()
      expect(signals()).toEqual({ bubble: [STEP_MESSAGES.searching], badge: 'working', charState: 'working' })
      expect(stage.props().clip).toBe('typing')
    })
  })

  describe('a result that was ready before the character appeared', () => {
    /** When the page was loaded (ms since 1970): a minute before these tests run. */
    const LOADED_AT = Date.now() - 60_000
    const RESTING = { bubble: [], badge: 'idle', charState: 'resting' }

    beforeEach(() => {
      vi.spyOn(env, 'PAGE_LOADED_AT', 'get').mockReturnValue(LOADED_AT)
    })

    /** A finished task as the store holds it, created `afterLoad` ms after the page was loaded: before it, if negative. */
    function finished(id: string, afterLoad: number, patch: Partial<Task> = {}): Task {
      return {
        id,
        prompt: `Prompt ${id}`,
        status: 'done',
        step: 'writing',
        message: null,
        result: RESULT,
        error: null,
        createdAt: LOADED_AT + afterLoad,
        finishedAt: LOADED_AT + afterLoad + 700,
        ...patch,
      }
    }

    /** Fills the store with what the character finds in it once its model has loaded. */
    function found(tasks: Task[], viewingId: string | null = null) {
      act(() => useTasks.setState({ tasks, activeId: null, viewingId }))
    }

    it('is handed over as if the character had watched the task finish', () => {
      found([finished('new', 5_000), finished('old', -5_000)])
      const stage = mount()

      // Standing up, in place...
      expect(signals()).toEqual({ bubble: [MESSAGES.done[0]], badge: 'done', charState: 'standingUp' })
      stage.frame()
      expect(stage.props()).toMatchObject({ clip: 'standUp', holdingFile: false })
      expect(stage.props().placement.position).toEqual([...SEAT_GROUND_POS])
      const stoodUp = stage.untilState('walkingOut')
      expect(stoodUp).toBeCloseTo(CLIPS.standUp.duration as number, 1)

      // ...walking round the desk...
      const walked = stage.untilState('handingFile')
      expect(walked).toBeGreaterThan(3.2)
      expect(walked).toBeLessThan(3.8)

      // ...and holding out the folder, which opens that result.
      expect(signals()).toEqual({ bubble: [MESSAGES.done[1]], badge: 'done', charState: 'handingFile' })
      expect(stage.props()).toMatchObject({ clip: 'holdFile', holdingFile: true })
      act(() => stage.props().onFolderClick())
      expect(useTasks.getState().viewingId).toBe('new')

      // Once it is read the character goes back to its seat and stays there.
      act(() => useTasks.getState().setViewing(null))
      stage.untilState('resting')
      stage.run(5)
      expect(signals()).toEqual(RESTING)
      expect(stage.props()).toMatchObject({ clip: 'idle', holdingFile: false })
    })

    it('counts from the millisecond the page was loaded', () => {
      found([finished('first', 0)])
      mount()
      expect(signals().charState).toBe('standingUp')
    })

    // The page's own time origin is counted on a clock that stands still while the computer sleeps, so it can
    // read hours before the page was really loaded; a task is stamped by the wall clock.
    it('goes by the wall clock where the time origin of the page has fallen behind it', () => {
      vi.spyOn(performance, 'timeOrigin', 'get').mockReturnValue(LOADED_AT - 3_600_000)
      found([finished('before the reload', -5_000)])
      const stage = mount()
      stage.run(3)
      expect(signals()).toEqual(RESTING)
      expect(stage.props()).toMatchObject({ clip: 'idle', holdingFile: false })
    })

    it('goes by the wall clock where the time origin of the page is ahead of it', () => {
      vi.spyOn(performance, 'timeOrigin', 'get').mockReturnValue(LOADED_AT + 3_600_000)
      found([finished('new', 5_000)])
      mount()
      expect(signals().charState).toBe('standingUp')
    })

    it('is left alone when an earlier page load produced it, as after a reload', () => {
      found([
        finished('held', -1),
        finished('failed', -9_000, { status: 'failed', result: null, error: 'x' }),
        finished('older', -20_000),
      ])
      const stage = mount()
      stage.run(3)
      expect(signals()).toEqual(RESTING)
      expect(stage.props()).toMatchObject({ clip: 'idle', holdingFile: false })

      // Looking at an old result and closing it again is nothing to the character either.
      act(() => useTasks.getState().setViewing('held'))
      act(() => useTasks.getState().setViewing(null))
      stage.run(1)
      expect(signals()).toEqual(RESTING)
    })

    it('is left alone when it is already open in the viewer', () => {
      found([finished('new', 5_000)], 'new')
      const stage = mount()
      stage.run(3)
      expect(signals()).toEqual(RESTING)

      // Nor does closing the viewer bring the character out.
      act(() => useTasks.getState().setViewing(null))
      stage.run(3)
      expect(signals()).toEqual(RESTING)
      expect(stage.props()).toMatchObject({ clip: 'idle', holdingFile: false })
    })

    it.each(['cancelled', 'failed'] as const)('is left alone when a later task has ended as %s since', (status) => {
      found([finished('later', 9_000, { status, result: null }), finished('new', 5_000)])
      const stage = mount()
      stage.run(3)
      expect(signals()).toEqual(RESTING)
    })

    it('is handed over once, also where the driver is set up a second time', () => {
      found([finished('new', 5_000)])
      // Strict mode runs every effect, takes it down and runs it again.
      const stage = mount(StrictMode)
      expect(signals()).toEqual({ bubble: [MESSAGES.done[0]], badge: 'done', charState: 'standingUp' })

      // Straight out, without sitting down in between.
      stage.frame()
      const states = new Set<string>()
      const out = stage.until(() => {
        states.add(signals().charState)
        return signals().charState === 'handingFile'
      })
      expect([...states]).toEqual(['standingUp', 'walkingOut', 'handingFile'])
      expect(out).toBeLessThan((CLIPS.standUp.duration as number) + 3.8)
    })
  })

  describe('the two lines of the hand-over', () => {
    /** Every bubble the interface is told about from now on, in order. */
    function bubblesSaid(): string[][] {
      const seen: string[][] = []
      onTestFinished(
        useCharacterSignals.subscribe((state, previous) => {
          if (state.bubble !== previous.bubble) seen.push(state.bubble)
        }),
      )
      return seen
    }

    it('are said one after the other: the first on the way, the second once the character has arrived', () => {
      const stage = mount()
      const task = startTask()
      update(task.id, { step: 'writing', message: STEP_MESSAGES.writing })
      stage.run(0.5)
      const seen = bubblesSaid()
      finish(task.id)

      stage.untilState('handingFile')
      stage.run(3)
      expect(seen).toEqual([[MESSAGES.done[0]], [MESSAGES.done[1]]])
      // And it goes on saying the second for as long as it holds the file out.
      stage.run(10)
      expect(signals().bubble).toEqual([MESSAGES.done[1]])
      expect(seen).toHaveLength(2)
    })

    it('give the first line a second and a half where the character does not walk', () => {
      useSettings.setState({ reduceMotion: true })
      const stage = mount()
      const task = startTask()
      stage.run(0.5)
      finish(task.id)
      const saidAt = clock
      expect(signals().bubble).toEqual([MESSAGES.done[0]])

      // It is in front of the desk as soon as it has stood up, well within that time...
      stage.untilState('handingFile')
      expect(clock - saidAt).toBeLessThan(DONE_FIRST_LINE_MS)
      expect(signals().bubble).toEqual([MESSAGES.done[0]])
      expect(stage.props().holdingFile).toBe(true)

      // ...and still says the first line until its time is up.
      stage.until(() => signals().bubble[0] === MESSAGES.done[1])
      expect(clock - saidAt).toBeGreaterThanOrEqual(DONE_FIRST_LINE_MS)
      expect(clock - saidAt).toBeLessThan(DONE_FIRST_LINE_MS + 2 * FRAME * 1000)
      expect(signals()).toEqual({ bubble: [MESSAGES.done[1]], badge: 'done', charState: 'handingFile' })
    })

    it('are timed afresh for every result that is brought out', () => {
      useSettings.setState({ reduceMotion: true })
      const stage = mount()
      for (const prompt of ['first', 'second']) {
        const task = startTask(prompt)
        stage.run(0.5)
        finish(task.id)
        const saidAt = clock
        stage.until(() => signals().bubble[0] === MESSAGES.done[1])
        expect(clock - saidAt).toBeGreaterThanOrEqual(DONE_FIRST_LINE_MS)
        expect(clock - saidAt).toBeLessThan(DONE_FIRST_LINE_MS + 2 * FRAME * 1000)
        act(() => stage.props().onFolderClick())
        act(() => useTasks.getState().setViewing(null))
        expect(signals().bubble).toEqual([])
        stage.untilState('resting')
        // Long after the first result: its line's time must not count for the second.
        stage.run(4)
      }
    })

    it('do not render the character again when the second takes the place of the first', () => {
      useSettings.setState({ reduceMotion: true })
      const stage = mount()
      finish(startTask().id)
      stage.untilState('handingFile')
      stage.run(0.1)
      const renders = stage.renders()
      stage.until(() => signals().bubble[0] === MESSAGES.done[1])
      stage.run(1)
      expect(stage.renders()).toBe(renders)
    })

    it('are never said together, nor with anything else, whatever happens meanwhile', () => {
      const seen = bubblesSaid()
      const stage = mount()
      const first = startTask('first')
      update(first.id, { step: 'searching', message: STEP_MESSAGES.searching })
      stage.run(0.5)
      finish(first.id)
      stage.untilState('handingFile')
      stage.run(2)
      // A second task while the file is held out, cancelled on the way back; then a third that is brought out.
      const second = startTask('second')
      update(second.id, { step: 'reading', message: STEP_MESSAGES.reading })
      stage.run(0.5)
      cancel(second.id)
      stage.run(0.5)
      const third = startTask('third')
      stage.run(0.3)
      finish(third.id)
      stage.untilState('handingFile')
      stage.run(2)
      act(() => stage.props().onFolderClick())
      act(() => useTasks.getState().setViewing(null))
      stage.untilState('resting')

      expect(seen.length).toBeGreaterThan(6)
      for (const bubble of seen) expect(bubble.length).toBeLessThanOrEqual(1)
      expect(seen.filter(([line]) => line === MESSAGES.done[1])).toHaveLength(2)
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
      expect(signals()).toEqual({ bubble: [], badge: 'thinking', charState: 'returning' })
      update(second.id, { step: 'reading', message: STEP_MESSAGES.reading })
      expect(signals().bubble).toEqual([STEP_MESSAGES.reading])
      stage.frame()
      expect(stage.props()).toMatchObject({ clip: 'walk', holdingFile: false, badge: 'thinking' })

      // On the way the symbol already follows what the task is doing.
      update(second.id, { step: 'searching', message: STEP_MESSAGES.searching })
      expect(signals()).toEqual({ bubble: [STEP_MESSAGES.searching], badge: 'working', charState: 'returning' })
      stage.frame()
      expect(stage.props()).toMatchObject({ clip: 'walk', badge: 'working' })
      update(second.id, { step: 'reading', message: STEP_MESSAGES.reading })

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

  describe('the wait on the sofa', () => {
    /** A step no longer than this (m) is one frame of running, with room for rounding. */
    const ONE_FRAME_OF_RUNNING = RUN_SPEED * RUN_PACE * FRAME + 1e-6

    const isSeatSpot = (placement: { position: readonly number[]; facing: number }) =>
      placement.facing === SOFA_FACING && placement.position.every((value, axis) => value === SOFA_SEAT_POS[axis])

    /**
     * The point on the floor the body is over: where the character is placed,
     * moved by where the clip it plays holds its root (only a hop holds it
     * anywhere but over the placement).
     */
    function bodyOf(stage: ReturnType<typeof mount>): [number, number] {
      const { position, facing } = stage.props().placement
      const { name, time } = stage.playback
      const root = name === null ? undefined : CLIPS[name].sample(time)['root 1']?.pos
      const across = root?.[0] ?? 0
      const ahead = root?.[2] ?? 0
      return [
        position[0] + across * Math.cos(facing) + ahead * Math.sin(facing),
        position[2] - across * Math.sin(facing) + ahead * Math.cos(facing),
      ]
    }

    interface Seen {
      /** The clip the character played in the frame. */
      clip: ClipName | null
      state: string
      badge: string
      /** Whether it was placed on the sofa's seat spot. */
      onSeatSpot: boolean
      body: [number, number]
      facing: number
    }

    /** Runs frames while `going()` holds and returns what every one of them showed; fails after `limit` seconds. */
    function film(stage: ReturnType<typeof mount>, going: () => boolean, limit = 40): Seen[] {
      const seen: Seen[] = []
      while (going()) {
        stage.frame()
        const { placement } = stage.props()
        seen.push({
          clip: stage.playback.name,
          state: signals().charState,
          badge: signals().badge,
          onSeatSpot: isSeatSpot(placement),
          body: bodyOf(stage),
          facing: placement.facing,
        })
        if (seen.length * FRAME > limit) throw new Error(`still ${signals().charState} playing ${stage.props().clip} after ${limit} s`)
      }
      return seen
    }

    /** In every frame the character is placed on the sofa's seat spot exactly when the clip it plays is played from there. */
    function expectPlacedByClip(seen: Seen[]) {
      for (const [index, frame] of seen.entries()) {
        const fromSeatSpot = frame.clip !== null && SEAT_SPOT_CLIPS.includes(frame.clip)
        expect(frame.onSeatSpot, `frame ${index}, playing ${frame.clip}`).toBe(fromSeatSpot)
      }
    }

    /** The clips in the order they were played, each named once per run of it. */
    const clipsOf = (seen: Seen[]) => seen.map(({ clip }) => clip).filter((clip, index, all) => clip !== all[index - 1])

    /** The longest step of the body over the floor between two frames (m). */
    function longestStep(seen: Seen[]): number {
      let longest = 0
      for (let index = 1; index < seen.length; index++) {
        const [x, z] = seen[index].body
        const [px, pz] = seen[index - 1].body
        longest = Math.max(longest, Math.hypot(x - px, z - pz))
      }
      return longest
    }

    /** Leaves the character alone until it lounges on the sofa. */
    function untilOnSofa(stage: ReturnType<typeof mount>) {
      stage.until(() => place() === 'sofa', 30)
      stage.run(0.5)
    }

    const AT_DESK = { position: [...SEAT_GROUND_POS], facing: SEAT_FACING }
    const ON_SOFA = { position: [...SOFA_SEAT_POS], facing: SOFA_FACING }

    describe('after ten seconds without chat input', () => {
      it('gets up, walks round the desk and along its front, hops onto the sofa and lounges there', () => {
        const stage = mount()
        stage.run(SOFA_AFTER_MS / 1000 - 0.05)
        expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
        expect(place()).toBe('desk')
        stage.run(0.1)
        expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'goingToSofa' })

        // Up from the chair, in place.
        stage.frame()
        expect(stage.props()).toMatchObject({ clip: 'standUp', clipSpeed: 1, lookTarget: null, placement: AT_DESK })
        const stoodUp = stage.until(() => stage.props().clip === 'walk')
        expect(stoodUp).toBeCloseTo(CLIPS.standUp.duration as number, 1)
        expect(stage.props().placement.position).toEqual([...SEAT_GROUND_POS])
        expect(stage.props().clipSpeed).toBe(WALK_PACE)

        // The walk: clear of the desk all the way, round its left end.
        let leftmost = Infinity
        let frontmost = -Infinity
        const walk = film(stage, () => stage.props().clip === 'walk')
        for (const { body: [x, z] } of walk) {
          leftmost = Math.min(leftmost, x)
          frontmost = Math.max(frontmost, z)
          const besideX = Math.max(DESK_BOUNDS.min[0] - x, 0, x - DESK_BOUNDS.max[0])
          const besideZ = Math.max(DESK_BOUNDS.min[2] - z, 0, z - DESK_BOUNDS.max[2])
          expect(Math.hypot(besideX, besideZ), `at ${x.toFixed(2)}, ${z.toFixed(2)}`).toBeGreaterThan(CHARACTER_BODY_RADIUS - 0.001)
        }
        expect(leftmost).toBeLessThan(DESK_BOUNDS.min[0] - CHARACTER_BODY_RADIUS)
        expect(frontmost).toBeGreaterThan(DESK_BOUNDS.max[2] + CHARACTER_BODY_RADIUS)
        expect(walk.length * FRAME).toBeGreaterThan(4.8)
        expect(walk.length * FRAME).toBeLessThan(5.9)
        // It stands in front of the sofa, its back to it; all the way there it kept its Z's and its silence.
        const [standX, standZ] = walk[walk.length - 1].body
        expect(Math.hypot(standX - SOFA_STAND_POS[0], standZ - SOFA_STAND_POS[2])).toBeLessThan(1e-9)
        expect(Math.abs(walk[walk.length - 1].facing - SOFA_FACING)).toBeLessThan(0.26)
        expect(new Set(walk.map(({ badge }) => badge))).toEqual(new Set(['idle']))
        expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'goingToSofa' })
        expect(place()).toBe('desk')

        // The hop, played from the seat spot, and then it lounges.
        expect(stage.props().clip).toBe('hopOn')
        const hop = film(stage, () => signals().charState === 'goingToSofa')
        expect(hop.length * FRAME).toBeCloseTo(CLIPS.hopOn.duration as number, 1)
        expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
        expect(place()).toBe('sofa')
        stage.frame()
        expect(stage.props()).toMatchObject({ clip: 'loungeIdle', clipSpeed: 1, badge: 'idle', holdingFile: false, lookTarget: null, placement: ON_SOFA })

        // And there it stays for as long as nobody wants anything.
        stage.run(30)
        expect(signals().charState).toBe('resting')
        expect(stage.props()).toMatchObject({ clip: 'loungeIdle', placement: ON_SOFA })
      })

      it('counts the ten seconds from the last chat input', () => {
        const stage = mount()
        stage.run(6)
        chat()
        expect(signals().charState).toBe('resting')
        stage.run(9.9)
        expect(signals().charState).toBe('resting')
        stage.run(0.2)
        expect(signals().charState).toBe('goingToSofa')
      })

      it('counts them from its appearing where the chat was used before it had appeared', () => {
        // Somebody typed while the model was still loading: that is no reason to walk off two seconds later.
        chat()
        clock += 8_000
        const stage = mount()
        stage.run(9.9)
        expect(signals().charState).toBe('resting')
        stage.run(0.2)
        expect(signals().charState).toBe('goingToSofa')
      })

      it('goes although the pointer keeps moving, and does not look at it on the way', () => {
        const stage = mount()
        // The pointer moves every half second: it never gets to wave, and the ten seconds pass all the same.
        for (let moved = 0; moved < 21; moved++) {
          pointer('pointermove', 200 + moved * 10, 150)
          stage.run(0.5)
        }
        expect(signals().charState).toBe('goingToSofa')
        pointer('pointermove', 900, 500)
        stage.frame()
        expect(signals().charState).toBe('goingToSofa')
        expect(stage.props().lookTarget).toBeNull()
      })

      it('finishes a wave and the fidget after it first', () => {
        vi.mocked(Math.random).mockReturnValue(0.3)
        const stage = mount()
        stage.run(8.5)
        pointer('pointermove', 200, 150)
        stage.untilState('greeting')
        const states = new Set<string>()
        stage.until(() => {
          states.add(signals().charState)
          return signals().charState === 'goingToSofa'
        })
        // The wave began before the ten seconds were over: it and the stretch after it are played out.
        expect([...states]).toEqual(['greeting', 'fidgeting', 'resting', 'goingToSofa'])
        expect(clock - 1000).toBeGreaterThan(SOFA_AFTER_MS + 3_000)
      })

      it('finishes a sip first: the cup goes back on the desk before it leaves', () => {
        const stage = mount()
        stage.run(6.5)
        pointer('pointermove', 200, 150)
        stage.untilState('fidgeting')
        stage.frame()
        expect(stage.props().clip).toBe('sip')
        // The ten seconds are over in the middle of the sip.
        const sipping = film(stage, () => signals().charState === 'fidgeting')
        expect(clock - 1000).toBeGreaterThan(SOFA_AFTER_MS)
        expect(sipping.length * FRAME).toBeGreaterThan((CLIPS.sip.duration as number) - 0.1)
        expect(new Set(sipping.map(({ clip }) => clip))).toEqual(new Set(['sip']))
        stage.run(0.1)
        expect(signals().charState).toBe('goingToSofa')
      })

      it('does not leave while it works, brings a result out or holds the file', () => {
        const stage = mount()
        const task = startTask()
        stage.run(15)
        expect(signals().charState).toBe('working')
        finish(task.id)
        stage.untilState('handingFile')
        stage.run(60)
        expect(signals().charState).toBe('handingFile')
        expect(place()).toBe('desk')
        // Its wait starts when it is back on its chair.
        act(() => stage.props().onFolderClick())
        act(() => useTasks.getState().setViewing(null))
        stage.untilState('resting')
        const restedAt = clock
        stage.untilState('goingToSofa')
        expect(clock - restedAt).toBeGreaterThanOrEqual(SOFA_AFTER_MS)
        expect(clock - restedAt).toBeLessThan(SOFA_AFTER_MS + 2 * FRAME * 1000)
      })

      it('does not render while it walks: only for a change of clip', () => {
        const stage = mount()
        stage.until(() => stage.props().clip === 'walk', 30)
        const renders = stage.renders()
        stage.until(() => stage.props().clip === 'hopOn')
        expect(stage.renders() - renders).toBeLessThanOrEqual(1)
      })
    })

    describe('on the sofa', () => {
      it('tells the interface where it is, with its Z\'s and nothing to say', () => {
        const stage = mount()
        const places: string[] = []
        onTestFinished(
          useCharacterSignals.subscribe((state, previous) => {
            if (state.place !== previous.place) places.push(state.place)
          }),
        )
        untilOnSofa(stage)
        expect(places).toEqual(['sofa'])
        expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
        chat()
        expect(places).toEqual(['sofa', 'desk'])
      })

      it('follows the pointer with its head, waves when the pointer is still, and fidgets as one does on a sofa', () => {
        vi.mocked(Math.random).mockReturnValue(0)
        const stage = mount()
        untilOnSofa(stage)

        pointer('pointermove', 200, 150)
        expect(signals().charState).toBe('watching')
        stage.frame()
        expect(stage.props()).toMatchObject({ clip: 'loungeIdle', placement: ON_SOFA })
        expect(stage.props().lookTarget).not.toBeNull()

        stage.run(POINTER_STILL_MS / 1000 + 0.1)
        expect(signals().charState).toBe('greeting')
        expect(stage.props().clip).toBe('loungeWave')
        expect(stage.props().lookTarget).not.toBeNull()
        const waved = stage.untilState('fidgeting')
        expect(waved).toBeCloseTo(CLIPS.loungeWave.duration as number, 0)
        stage.frame()
        // The first of the sofa's two fidgets: there is no cup to sip from and no desk to drum on.
        expect(stage.props()).toMatchObject({ clip: 'loungeStretch', lookTarget: null, placement: ON_SOFA })
        const stretched = stage.untilState('resting')
        expect(stretched).toBeCloseTo(CLIPS.loungeStretch.duration as number, 0)
        expect(place()).toBe('sofa')
        stage.frame()
        expect(stage.props()).toMatchObject({ clip: 'loungeIdle', badge: 'idle', placement: ON_SOFA })

        // The other one, and the pointer interrupts it.
        vi.mocked(Math.random).mockReturnValue(0.9)
        pointer('pointermove', 300, 150)
        stage.untilState('fidgeting')
        stage.frame()
        expect(stage.props().clip).toBe('loungeLookAround')
        pointer('pointermove', 320, 150)
        expect(signals().charState).toBe('watching')
        expect(place()).toBe('sofa')
      })

      /** The yaw a character seated on the sofa would have to turn its head by to look at `target`. */
      const yawFromSofa = (target: readonly [number, number, number]) =>
        lookAngles([SOFA_SEAT_POS[0], 1.2, SOFA_SEAT_POS[2]], SOFA_FACING, target)

      /** Where on the screen a point of the room is drawn, in pixels. */
      function onScreen(point: readonly [number, number, number]): [number, number] {
        const projected = new Vector3(...point).project(camera)
        return [((projected.x + 1) / 2) * VIEW.width, ((1 - projected.y) / 2) * VIEW.height]
      }

      it('looks straight out at the viewer when the pointer is over it', () => {
        const stage = mount()
        untilOnSofa(stage)
        const [x, y] = onScreen([SOFA_SEAT_POS[0], 1.2, SOFA_SEAT_POS[2]])
        pointer('pointermove', x, y)
        stage.frame()
        const { yaw, pitch } = yawFromSofa(stage.props().lookTarget as readonly [number, number, number])
        expect(Math.abs(yaw)).toBeLessThan(0.02)
        expect(Math.abs(pitch)).toBeLessThan(0.1)
      })

      it('looks left as far as its head goes for a pointer at the far left, and a little to the right for one at the right edge', () => {
        const stage = mount()
        untilOnSofa(stage)
        pointer('pointermove', 0, VIEW.height / 2)
        stage.frame()
        // Positive is towards its own left, which is the viewer's right.
        const left = yawFromSofa(stage.props().lookTarget as readonly [number, number, number]).yaw
        expect(left).toBeLessThan(-HEAD_MAX_YAW)
        // The head alone turns there: it stops at its limit and the body stays where it is.
        expect(computeLookYaw(left, false)).toEqual({ head: -HEAD_MAX_YAW, body: 0 })

        pointer('pointermove', VIEW.width, VIEW.height / 2)
        stage.frame()
        const right = yawFromSofa(stage.props().lookTarget as readonly [number, number, number]).yaw
        expect(right).toBeGreaterThan(0.1)
        expect(right).toBeLessThan(0.5)
      })
    })

    describe('when the chat is used', () => {
      it('hops off, runs back the way it came and sits down, ready within three and a half seconds', () => {
        const stage = mount()
        untilOnSofa(stage)
        chat()
        expect(signals()).toEqual({ bubble: [], badge: 'hidden', charState: 'rushingToDesk' })
        expect(place()).toBe('desk')

        const back = film(stage, () => signals().charState === 'rushingToDesk')
        // Seated and ready: at its desk, at rest, the Z's back above its head.
        expect(back.length * FRAME).toBeLessThan(3.5)
        expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
        expect(stage.props().placement).toEqual(AT_DESK)
        stage.frame()
        expect(stage.props()).toMatchObject({ clip: 'idle', clipSpeed: 1, badge: 'idle' })

        // What it did on the way: off the sofa, the run, onto the chair.
        expect(clipsOf(back)).toEqual(['hopOff', 'run', 'sitDown'])
        const played = (clip: ClipName) => back.filter((frame) => frame.clip === clip).length * FRAME
        expect(played('hopOff')).toBeCloseTo(CLIPS.hopOff.duration as number, 1)
        expect(played('run')).toBeGreaterThan(1.7)
        expect(played('run')).toBeLessThan(2.2)
        expect(played('sitDown')).toBeCloseTo(CLIPS.sitDown.duration as number, 1)
        // The run is not started before the hop has landed it on the floor in front of the sofa...
        const firstRun = back.findIndex(({ clip }) => clip === 'run')
        const [landedX, landedZ] = back[firstRun - 1].body
        expect(Math.hypot(landedX - SOFA_STAND_POS[0], landedZ - SOFA_STAND_POS[2])).toBeLessThan(1e-6)
        // ...it goes round the left end of the desk, and it shows no symbol all the way.
        expect(Math.min(...back.map(({ body: [x] }) => x))).toBeLessThan(DESK_BOUNDS.min[0] - CHARACTER_BODY_RADIUS)
        const onTheRun = back.filter(({ state }) => state === 'rushingToDesk')
        expect(onTheRun.length).toBe(back.length - 1)
        expect(new Set(onTheRun.map(({ badge }) => badge))).toEqual(new Set(['hidden']))
      })

      it('plays the run as fast as it is moved, so that its feet keep pace with the floor', () => {
        const stage = mount()
        untilOnSofa(stage)
        chat()
        stage.until(() => stage.playback.name === 'run')
        expect(stage.props()).toMatchObject({ clip: 'run', clipSpeed: RUN_PACE })
        const run = film(stage, () => stage.props().clip === 'run')
        // On the straight along the desk's front it covers the ground its stride does, to within half a percent.
        const straight = run.filter(({ body: [x, z] }) => Math.abs(z - HANDOFF_POS[2]) < 1e-6 && x > -1 && x < 1)
        expect(straight.length).toBeGreaterThan(10)
        const stride = RUN_SPEED * RUN_PACE * FRAME
        for (let index = 1; index < straight.length; index++) {
          const covered = straight[index - 1].body[0] - straight[index].body[0]
          expect(covered).toBeGreaterThan(stride * 0.995)
          expect(covered).toBeLessThanOrEqual(stride + 1e-9)
        }
      })

      it('changes nothing when the chat is used again while it runs', () => {
        const stage = mount()
        untilOnSofa(stage)
        chat()
        stage.until(() => stage.playback.name === 'run')
        stage.run(0.5)
        const renders = stage.renders()
        const before = { ...stage.props().placement, position: [...stage.props().placement.position] }
        clock += 1
        chat()
        chat()
        expect(signals()).toEqual({ bubble: [], badge: 'hidden', charState: 'rushingToDesk' })
        expect(stage.props().placement).toEqual(before)
        expect(stage.renders()).toBe(renders)
        const rest = stage.untilState('resting')
        expect(rest).toBeLessThan(3)
        expect(stage.props().placement).toEqual(AT_DESK)
      })

      it('goes back to the sofa when ten more seconds pass without chat input', () => {
        const stage = mount()
        untilOnSofa(stage)
        chat()
        stage.untilState('resting')
        expect(place()).toBe('desk')
        const restedAt = clock
        stage.untilState('goingToSofa', 15)
        expect(clock - restedAt).toBeGreaterThanOrEqual(SOFA_AFTER_MS)
        untilOnSofa(stage)
        expect(stage.props()).toMatchObject({ clip: 'loungeIdle', placement: ON_SOFA })
      })
    })

    describe('where it is placed', () => {
      /** The whole trip: left alone until it lounges, called back, until it rests at its desk again. */
      function wholeTrip(stage: ReturnType<typeof mount>): Seen[] {
        const out = film(stage, () => place() !== 'sofa')
        const lounging = film(stage, () => stage.playback.name !== 'loungeIdle' || stage.playback.time < 0.5)
        chat()
        const back = film(stage, () => signals().charState !== 'resting')
        return [...out, ...lounging, ...back, ...film(stage, () => stage.playback.name !== 'idle')]
      }

      it('is the sofa\'s seat spot in exactly the frames in which the clip it plays is played from there', () => {
        const stage = mount()
        const trip = wholeTrip(stage)
        expect(clipsOf(trip)).toEqual(['idle', 'standUp', 'walk', 'hopOn', 'loungeIdle', 'hopOff', 'run', 'sitDown', 'idle'])
        expectPlacedByClip(trip)
        // Each hop takes the placement with it in the frame it starts, not a frame before and not one after.
        const changes = trip.flatMap((frame, index) => (index > 0 && frame.onSeatSpot !== trip[index - 1].onSeatSpot ? [`${trip[index - 1].clip} -> ${frame.clip}`] : []))
        expect(changes).toEqual(['walk -> hopOn', 'hopOff -> run'])
      })

      it('never moves the body further between two frames than one frame of running covers, the joins of the hops included', () => {
        const stage = mount()
        const trip = wholeTrip(stage)
        expect(longestStep(trip)).toBeLessThanOrEqual(ONE_FRAME_OF_RUNNING)
        // Across the two joins the body stays where it is: the hop holds it where the walk left it, and the run starts where the hop landed it.
        for (const [from, to] of [['walk', 'hopOn'], ['hopOff', 'run']] as const) {
          const join = trip.findIndex((frame, index) => frame.clip === to && trip[index - 1]?.clip === from)
          const [x, z] = trip[join].body
          const [px, pz] = trip[join - 1].body
          expect(Math.hypot(x - px, z - pz), `${from} -> ${to}`).toBeLessThanOrEqual(ONE_FRAME_OF_RUNNING)
          // In the frame before the join and in the frame of the join it is over the spot in front of the sofa.
          for (const [sx, sz] of [trip[join - 1].body, trip[join].body]) {
            expect(Math.hypot(sx - SOFA_STAND_POS[0], sz - SOFA_STAND_POS[2]), `${from} -> ${to}`).toBeLessThan(1e-6)
          }
        }
      })

      it('never turns the placement faster than a run turns, but for the last of its turn to the sofa, which the hop takes over', () => {
        const stage = mount()
        const trip = wholeTrip(stage)
        for (let index = 1; index < trip.length; index++) {
          const turned = Math.abs(Math.atan2(Math.sin(trip[index].facing - trip[index - 1].facing), Math.cos(trip[index].facing - trip[index - 1].facing)))
          const ontoSofa = trip[index].clip === 'hopOn' && trip[index - 1].clip === 'walk'
          // It may still be a quarter of a radian short of facing away from the sofa when the hop begins: the
          // character turns the pose it comes from into the new placement, so the body does not snap round.
          expect(turned, `frame ${index}: ${trip[index - 1].clip} -> ${trip[index].clip}`).toBeLessThanOrEqual(ontoSofa ? 0.26 : RUN_TURNING.maxSpeed * FRAME + 1e-9)
        }
      })

      describe('where the character is shown a clip later than it was asked for', () => {
        /** Runs `frames` frames in which nothing is rendered, as when frames come faster than React gets a turn. */
        function starved(stage: ReturnType<typeof mount>, frames: number, each: () => void) {
          Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false)
          try {
            for (let frame = 0; frame < frames; frame++) {
              stage.frame(FRAME, (work) => work())
              each()
            }
          } finally {
            Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
          }
        }
        const rendered = () =>
          act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 30))
          })
        const fromStandSpot = ([x, z]: [number, number]) => Math.hypot(x - SOFA_STAND_POS[0], z - SOFA_STAND_POS[2])

        it('stays in front of the sofa until it is shown the hop, and is on the seat spot in the frame it starts hopping', async () => {
          const stage = mount()
          stage.until(() => stage.playback.name === 'walk', 30)
          // In front of the sofa, with the last of its turn away from it still to go.
          const turnLeft = () => Math.abs(Math.atan2(Math.sin(stage.props().placement.facing - SOFA_FACING), Math.cos(stage.props().placement.facing - SOFA_FACING)))
          stage.until(() => fromStandSpot(bodyOf(stage)) === 0 && turnLeft() < 0.4)
          expect(stage.props().clip).toBe('walk')

          // It arrives and the hop is asked for, but for a fifth of a second the character goes on being shown the walk.
          starved(stage, 12, () => {
            expect(stage.props().clip).toBe('walk')
            expect(isSeatSpot(stage.props().placement)).toBe(false)
            expect(fromStandSpot(bodyOf(stage))).toBe(0)
          })
          expect(signals().charState).toBe('goingToSofa')
          await rendered()
          expect(stage.props().clip).toBe('hopOn')
          // Still where it stood: the placement only changes in the frame in which the hop is played first.
          expect(isSeatSpot(stage.props().placement)).toBe(false)
          stage.frame()
          expect(stage.playback).toMatchObject({ name: 'hopOn', time: 0 })
          expect(stage.props().placement).toEqual(ON_SOFA)
          expect(fromStandSpot(bodyOf(stage))).toBeLessThan(1e-6)
        })

        it('stays on the seat spot until it is shown the run, and starts the run where the hop landed it', async () => {
          const stage = mount()
          untilOnSofa(stage)
          chat()
          stage.until(() => stage.playback.name === 'hopOff' && stage.playback.time + 1.5 * FRAME >= (CLIPS.hopOff.duration as number))

          // The hop off ends and the run is asked for, but the character goes on being shown the end of the hop.
          starved(stage, 12, () => {
            expect(stage.props().clip).toBe('hopOff')
            expect(stage.props().placement).toEqual(ON_SOFA)
            expect(fromStandSpot(bodyOf(stage))).toBeLessThan(0.02)
          })
          expect(stage.playback.finished).toBe(true)
          expect(signals().charState).toBe('rushingToDesk')
          await rendered()
          expect(stage.props().clip).toBe('run')
          expect(stage.props().placement).toEqual(ON_SOFA)
          // Not a step was taken meanwhile: the run starts from the spot in front of the sofa, in the frame it is first played.
          stage.frame()
          expect(stage.playback).toMatchObject({ name: 'run', time: 0 })
          expect(isSeatSpot(stage.props().placement)).toBe(false)
          expect(fromStandSpot(bodyOf(stage))).toBeLessThan(1e-6)
          // And its first step is one frame of running.
          stage.frame()
          expect(fromStandSpot(bodyOf(stage))).toBeGreaterThan(ONE_FRAME_OF_RUNNING * 0.9)
          expect(fromStandSpot(bodyOf(stage))).toBeLessThanOrEqual(ONE_FRAME_OF_RUNNING)
          stage.untilState('resting')
          expect(stage.props().placement).toEqual(AT_DESK)
        })
      })

      it('keeps the bubble\'s anchor beside the body all the way: it does not jump where the placement does', () => {
        const stage = mount()
        const { bubbleAnchor } = useCharacterSignals.getState()
        let previous = [...bubbleAnchor.current]
        let longest = 0
        const check = () => {
          longest = Math.max(longest, Math.hypot(bubbleAnchor.current[0] - previous[0], bubbleAnchor.current[2] - previous[2]))
          previous = [...bubbleAnchor.current]
          return true
        }
        film(stage, () => check() && place() !== 'sofa')
        stage.run(1.5)
        // Lounging: above the cushion, as far above the head as at the desk.
        const lounging = bubbleAnchorAt(SOFA_SEAT_POS, SOFA_LIFT)
        bubbleAnchor.current.forEach((value, axis) => expect(value).toBeCloseTo(lounging[axis], 2))
        previous = [...bubbleAnchor.current]
        chat()
        film(stage, () => check() && signals().charState !== 'resting')
        stage.run(1.5)
        expect(longest).toBeLessThanOrEqual(ONE_FRAME_OF_RUNNING)
        const seated = bubbleAnchorAt(SEAT_GROUND_POS, SEAT_LIFT)
        bubbleAnchor.current.forEach((value, axis) => expect(value).toBeCloseTo(seated[axis], 2))
      })
    })

    describe('called back on its way out', () => {
      /** Left alone until it is `seconds` into the walk to the sofa. */
      function walkingOut(seconds: number) {
        const stage = mount()
        stage.until(() => stage.playback.name === 'walk', 30)
        stage.run(seconds)
        return stage
      }

      it('turns round where it is and runs back, without a jump in place or in the way it faces', () => {
        const stage = walkingOut(2.5)
        const [turnedAtX, , turnedAtZ] = stage.props().placement.position
        // Half-way: on the far side of the desk's left end.
        expect(turnedAtX).toBeLessThan(DESK_BOUNDS.min[0])
        chat()
        expect(signals()).toEqual({ bubble: [], badge: 'hidden', charState: 'rushingToDesk' })

        const back = film(stage, () => signals().charState === 'rushingToDesk')
        expect(clipsOf(back)).toEqual(['run', 'sitDown'])
        // It spins round on the spot before it takes a step...
        const [firstX, firstZ] = back[3].body
        expect([firstX, firstZ]).toEqual([turnedAtX, turnedAtZ])
        // ...and nothing jumps: no step longer than a frame of running, no turn faster than a run turns.
        expect(longestStep(back)).toBeLessThanOrEqual(ONE_FRAME_OF_RUNNING)
        for (let index = 1; index < back.length; index++) {
          const turned = Math.abs(Math.atan2(Math.sin(back[index].facing - back[index - 1].facing), Math.cos(back[index].facing - back[index - 1].facing)))
          expect(turned).toBeLessThanOrEqual(RUN_TURNING.maxSpeed * FRAME + 1e-9)
        }
        // Never on the seat spot: it had not got as far as the sofa.
        expectPlacedByClip(back)
        expect(back.some(({ onSeatSpot }) => onSeatSpot)).toBe(false)
        // Back the way it came, which is shorter than the whole run, and seated at its desk.
        expect(back.length * FRAME).toBeLessThan(2.6)
        expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
        expect(stage.props().placement).toEqual(AT_DESK)
      })

      it('ends seated at its desk when the chat is used twice in a row', () => {
        const stage = walkingOut(3.5)
        chat()
        stage.run(0.2)
        clock += 1
        chat()
        expect(signals().charState).toBe('rushingToDesk')
        const back = film(stage, () => signals().charState === 'rushingToDesk')
        expect(clipsOf(back)).toEqual(['run', 'sitDown'])
        expect(longestStep(back)).toBeLessThanOrEqual(ONE_FRAME_OF_RUNNING)
        expect(stage.props().placement).toEqual(AT_DESK)
        expect(signals().charState).toBe('resting')
      })

      it('sits straight down again when it had only begun to get up', () => {
        const stage = mount()
        stage.untilState('goingToSofa', 15)
        stage.run(0.4)
        expect(stage.props().clip).toBe('standUp')
        chat()
        expect(signals().charState).toBe('rushingToDesk')
        const back = film(stage, () => signals().charState === 'rushingToDesk')
        expect(clipsOf(back)).toEqual(['sitDown'])
        expect(back.length * FRAME).toBeLessThan(1.1)
        expect(back.every(({ body: [x, z] }) => x === SEAT_GROUND_POS[0] && z === SEAT_GROUND_POS[2])).toBe(true)
        expect(signals().charState).toBe('resting')
      })

      it('finishes the hop onto the sofa before it hops off again', () => {
        const stage = mount()
        stage.until(() => stage.playback.name === 'hopOn', 30)
        stage.run(0.2)
        expect(signals().charState).toBe('goingToSofa')
        chat()
        expect(signals()).toEqual({ bubble: [], badge: 'hidden', charState: 'rushingToDesk' })
        expect(place()).toBe('desk')

        const back = film(stage, () => signals().charState === 'rushingToDesk')
        // The hop is played to its end (it was a third of the way in), then the hop off, the run, the chair.
        expect(clipsOf(back)).toEqual(['hopOn', 'hopOff', 'run', 'sitDown'])
        const hopped = back.filter(({ clip }) => clip === 'hopOn').length * FRAME
        expect(hopped).toBeCloseTo((CLIPS.hopOn.duration as number) - 0.2, 1)
        expect(longestStep(back)).toBeLessThanOrEqual(ONE_FRAME_OF_RUNNING)
        expectPlacedByClip(back)
        expect(back.filter(({ onSeatSpot }) => onSeatSpot).length).toBeGreaterThan(30)
        expect(signals().charState).toBe('resting')
        expect(stage.props().placement).toEqual(AT_DESK)
      })

      it('finishes the hop also when the call comes in the very frame it arrives in front of the sofa', () => {
        const stage = mount()
        // The hop has been asked for, but the character has not been shown it yet.
        stage.until(() => stage.props().clip === 'hopOn', 30)
        expect(stage.playback.name).toBe('walk')
        chat()
        const back = film(stage, () => signals().charState === 'rushingToDesk')
        expect(clipsOf(back)).toEqual(['hopOn', 'hopOff', 'run', 'sitDown'])
        expect(longestStep(back)).toBeLessThanOrEqual(ONE_FRAME_OF_RUNNING)
        expectPlacedByClip(back)
        expect(stage.props().placement).toEqual(AT_DESK)
      })
    })

    describe('a task started while it is away from its desk', () => {
      it('started on the sofa: shows its symbol and its line while the character runs, is worked on once it is seated, and is handed over', () => {
        const stage = mount()
        untilOnSofa(stage)
        const task = startTask()
        expect(signals()).toEqual({ bubble: [], badge: 'thinking', charState: 'rushingToDesk' })
        update(task.id, { step: 'searching', message: STEP_MESSAGES.searching })
        expect(signals()).toEqual({ bubble: [STEP_MESSAGES.searching], badge: 'working', charState: 'rushingToDesk' })

        const back = film(stage, () => signals().charState === 'rushingToDesk')
        // It runs; the work clip only starts when it is on its chair.
        expect(clipsOf(back)).toEqual(['hopOff', 'run', 'sitDown'])
        expect(new Set(back.map(({ badge }) => badge))).toEqual(new Set(['working']))
        expect(back.length * FRAME).toBeLessThan(3.5)
        expect(signals()).toEqual({ bubble: [STEP_MESSAGES.searching], badge: 'working', charState: 'working' })
        expect(stage.props().placement).toEqual(AT_DESK)
        stage.frame()
        expect(stage.props().clip).toBe('typing')

        // And when it is done the file is brought out, and opens this task.
        finish(task.id)
        stage.untilState('handingFile')
        expect(stage.props().placement.position[2]).toBe(HANDOFF_POS[2])
        act(() => stage.props().onFolderClick())
        expect(useTasks.getState().viewingId).toBe(task.id)
      })

      it('already done when the character sits down: it gets up again and hands the result over', () => {
        const stage = mount()
        untilOnSofa(stage)
        const task = startTask()
        stage.run(0.5)
        finish(task.id)
        expect(signals()).toEqual({ bubble: [], badge: 'done', charState: 'rushingToDesk' })

        const states: string[] = []
        stage.until(() => {
          if (states[states.length - 1] !== signals().charState) states.push(signals().charState)
          return signals().charState === 'handingFile'
        })
        // It sits down first, as it does on the way back from a hand-over.
        expect(states).toEqual(['rushingToDesk', 'standingUp', 'walkingOut', 'handingFile'])
        expect(signals().bubble).toEqual([MESSAGES.done[1]])
        act(() => stage.props().onFolderClick())
        expect(useTasks.getState().viewingId).toBe(task.id)
      })

      it('failed on the way: the trouble shows once it is seated', () => {
        const stage = mount()
        untilOnSofa(stage)
        const task = startTask()
        stage.run(1)
        fail(task.id)
        expect(signals()).toEqual({ bubble: [], badge: 'error', charState: 'rushingToDesk' })
        stage.untilState('error')
        expect(signals().bubble).toEqual([MESSAGES.error])
        expect(stage.props().placement).toEqual(AT_DESK)
        stage.untilState('resting')
      })

      it('cancelled on the way: it says so while it runs, and rests at its desk', () => {
        const stage = mount()
        untilOnSofa(stage)
        const task = startTask()
        stage.run(1)
        cancel(task.id)
        expect(signals()).toEqual({ bubble: [MESSAGES.cancel], badge: 'hidden', charState: 'rushingToDesk' })
        stage.untilState('resting')
        expect(stage.props().placement).toEqual(AT_DESK)
        stage.run(2.1)
        expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
      })

      it('a second one in place of a first that finished meanwhile: the second is worked on, the first stays in the list', () => {
        const stage = mount()
        untilOnSofa(stage)
        const first = startTask('first')
        stage.run(0.5)
        finish(first.id)
        const second = startTask('second')
        expect(signals()).toEqual({ bubble: [], badge: 'thinking', charState: 'rushingToDesk' })
        stage.untilState('working')
        finish(second.id)
        stage.untilState('handingFile')
        act(() => stage.props().onFolderClick())
        expect(useTasks.getState().viewingId).toBe(second.id)
        expect(useTasks.getState().tasks.map(({ status }) => status)).toEqual(['done', 'done'])
      })

      it.each([
        ['while it gets up', 'standUp', ['sitDown']],
        ['on the way out', 'walk', ['run', 'sitDown']],
        ['during the hop onto the sofa', 'hopOn', ['hopOn', 'hopOff', 'run', 'sitDown']],
      ] as const)('started %s: it comes back and works on it', (_, during, clips) => {
        const stage = mount()
        stage.until(() => stage.playback.name === during, 30)
        stage.run(during === 'walk' ? 2 : 0.2)
        const task = startTask()
        update(task.id, { step: 'reading', message: STEP_MESSAGES.reading })
        expect(signals()).toEqual({ bubble: [STEP_MESSAGES.reading], badge: 'thinking', charState: 'rushingToDesk' })
        const back = film(stage, () => signals().charState === 'rushingToDesk')
        expect(clipsOf(back)).toEqual(clips)
        expect(longestStep(back)).toBeLessThanOrEqual(ONE_FRAME_OF_RUNNING)
        expectPlacedByClip(back)
        expect(signals()).toEqual({ bubble: [STEP_MESSAGES.reading], badge: 'thinking', charState: 'working' })
        expect(stage.props().placement).toEqual(AT_DESK)
        stage.frame()
        expect(stage.props().clip).toBe('think')
        finish(task.id)
        stage.untilState('handingFile')
      })
    })

    describe('the status symbol', () => {
      it('is hidden only while it runs back with nothing queued', () => {
        const stage = mount()
        const shown: [string, string][] = []
        onTestFinished(
          useCharacterSignals.subscribe((state) => {
            const last = shown[shown.length - 1]
            if (!last || last[0] !== state.charState || last[1] !== state.badge) shown.push([state.charState, state.badge])
          }),
        )
        untilOnSofa(stage)
        pointer('pointermove', 200, 150)
        stage.untilState('fidgeting')
        chat()
        stage.untilState('resting')
        // A whole round with nothing but the chat: Z's everywhere but on the run.
        expect(shown).toEqual([
          ['goingToSofa', 'idle'],
          ['resting', 'idle'],
          ['watching', 'idle'],
          ['greeting', 'idle'],
          ['fidgeting', 'idle'],
          ['rushingToDesk', 'hidden'],
          ['resting', 'idle'],
        ])
        expect(stage.props().badge).toBe('idle')
      })

      it('is the task\'s on the run when a task called it back, and hidden again if that task is cancelled', () => {
        const stage = mount()
        untilOnSofa(stage)
        const task = startTask()
        stage.frame()
        expect(stage.props().badge).toBe('thinking')
        update(task.id, { step: 'writing', message: STEP_MESSAGES.writing })
        stage.frame()
        expect(stage.props().badge).toBe('working')
        cancel(task.id)
        stage.frame()
        expect(stage.props().badge).toBe('hidden')
      })
    })

    describe('where the sofa is not in the picture', () => {
      it('never leaves its desk on a view as narrow as a phone\'s', () => {
        const stage = mount()
        stage.view.width = 390
        stage.view.height = 844
        stage.run(30)
        expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
        expect(place()).toBe('desk')
        expect(stage.props()).toMatchObject({ clip: 'idle', placement: AT_DESK })
      })

      it('goes by the width the desktop view starts at', () => {
        const narrow = mount()
        narrow.view.width = MOBILE_BREAKPOINT - 1
        narrow.run(12)
        expect(signals().charState).toBe('resting')
        narrow.unmount()

        clock += 1000
        const wide = mount()
        wide.view.width = MOBILE_BREAKPOINT
        wide.run(10.1)
        expect(signals().charState).toBe('goingToSofa')
      })

      it('comes back when the window is narrowed while it lounges', () => {
        const stage = mount()
        untilOnSofa(stage)
        stage.view.width = 600
        stage.frame()
        expect(signals()).toEqual({ bubble: [], badge: 'hidden', charState: 'rushingToDesk' })
        const back = film(stage, () => signals().charState === 'rushingToDesk')
        expect(clipsOf(back)).toEqual(['hopOff', 'run', 'sitDown'])
        expect(stage.props().placement).toEqual(AT_DESK)
        // And there it stays, until the window is wide again.
        stage.run(15)
        expect(signals().charState).toBe('resting')
        stage.view.width = 1200
        stage.untilState('goingToSofa', 1)
      })

      it('turns round when the window is narrowed while it is on its way', () => {
        const stage = mount()
        stage.until(() => stage.playback.name === 'walk', 30)
        stage.run(3)
        stage.view.width = 600
        stage.frame()
        expect(signals().charState).toBe('rushingToDesk')
        const back = film(stage, () => signals().charState === 'rushingToDesk')
        expect(longestStep(back)).toBeLessThanOrEqual(ONE_FRAME_OF_RUNNING)
        expect(stage.props().placement).toEqual(AT_DESK)
        expect(signals().charState).toBe('resting')
      })
    })

    describe('with reduced motion', () => {
      beforeEach(() => {
        useSettings.setState({ reduceMotion: true })
      })

      it('is on the sofa in one cut once the ten seconds are over: no walk, no hop, nothing waited for', () => {
        const stage = mount()
        stage.run(SOFA_AFTER_MS / 1000 - 0.05)
        expect(stage.props().placement).toEqual(AT_DESK)
        const cut = film(stage, () => stage.playback.name !== 'loungeIdle', 1)
        // Within a few frames, and straight from sitting at the desk to lounging.
        expect(cut.length).toBeLessThan(8)
        expect(new Set(cut.map(({ clip }) => clip))).toEqual(new Set(['idle', 'loungeIdle']))
        expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
        expect(place()).toBe('sofa')
        expect(stage.props()).toMatchObject({ clip: 'loungeIdle', placement: ON_SOFA })
        // It changes place in the frame it is first shown lounging, and in no other.
        for (const frame of cut) expect(frame.onSeatSpot).toBe(frame.clip === 'loungeIdle')
        expect(cut.filter(({ onSeatSpot }) => !onSeatSpot).every(({ body: [x, z] }) => x === SEAT_GROUND_POS[0] && z === SEAT_GROUND_POS[2])).toBe(true)
      })

      it('is back at its desk in one cut when the chat is used: no hop, no run, and ready at once', () => {
        const stage = mount()
        stage.until(() => stage.playback.name === 'loungeIdle', 12)
        expect(stage.props().placement).toEqual(ON_SOFA)
        chat()
        // Seated and ready the moment it is called: it never is on its way.
        expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
        expect(place()).toBe('desk')
        // The very next frame shows it at its desk, straight from lounging.
        const cut = film(stage, () => stage.playback.name !== 'idle', 1)
        expect(cut).toHaveLength(1)
        expect(cut[0]).toMatchObject({ clip: 'idle', onSeatSpot: false, body: [SEAT_GROUND_POS[0], SEAT_GROUND_POS[2]] })
        expect(stage.props()).toMatchObject({ clip: 'idle', placement: AT_DESK })
      })

      it('never plays a walk, a run or a hop through any number of rounds', () => {
        const stage = mount()
        const played = new Set<string>()
        const states = new Set<string>()
        const note = (seen: Seen[]) =>
          seen.forEach(({ clip, state }) => {
            played.add(String(clip))
            states.add(state)
          })
        for (let round = 0; round < 3; round++) {
          note(film(stage, () => stage.playback.name !== 'loungeIdle', 12))
          expect(place()).toBe('sofa')
          chat()
          note(film(stage, () => stage.playback.name !== 'idle', 1))
          expect(place()).toBe('desk')
        }
        expect([...played].sort()).toEqual(['idle', 'loungeIdle'])
        // Nor is it ever seen on its way: it waits here, and then it waits there.
        expect([...states]).toEqual(['resting'])
      })

      it('runs the whole way back when reduced motion is switched off while it lounges', () => {
        const stage = mount()
        stage.until(() => stage.playback.name === 'loungeIdle', 12)
        stage.run(1)
        act(() => useSettings.setState({ reduceMotion: false }))
        chat()
        const back = film(stage, () => signals().charState === 'rushingToDesk')
        // Off the sofa onto the floor in front of it, and from there round the desk: no step is skipped.
        expect(clipsOf(back)).toEqual(['hopOff', 'run', 'sitDown'])
        expect(longestStep(back)).toBeLessThanOrEqual(ONE_FRAME_OF_RUNNING)
        expectPlacedByClip(back)
        expect(back.filter(({ clip }) => clip === 'run').length * FRAME).toBeGreaterThan(1.7)
        expect(stage.props().placement).toEqual(AT_DESK)
      })

      it('works at once on a task started on the sofa, and hands it over', () => {
        const stage = mount()
        stage.until(() => stage.playback.name === 'loungeIdle', 12)
        const task = startTask()
        stage.run(0.1)
        expect(signals()).toEqual({ bubble: [], badge: 'thinking', charState: 'working' })
        expect(stage.props()).toMatchObject({ clip: 'think', placement: AT_DESK })
        finish(task.id)
        stage.untilState('handingFile')
        expect(stage.props().placement).toEqual({ position: [...HANDOFF_POS], facing: HANDOFF_FACING })
      })
    })

    describe('when reduced motion is switched on on the way', () => {
      it.each([
        ['while it walks to the sofa', 'walk', 2, 'sofa'],
        ['during the hop onto it', 'hopOn', 0.2, 'sofa'],
      ] as const)('%s: it is on the sofa at once', (_, during, seconds, where) => {
        const stage = mount()
        stage.until(() => stage.playback.name === during, 30)
        stage.run(seconds)
        act(() => useSettings.setState({ reduceMotion: true }))
        stage.run(0.1)
        expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
        expect(place()).toBe(where)
        expect(stage.props()).toMatchObject({ clip: 'loungeIdle', placement: ON_SOFA })
      })

      it.each([
        ['while it hops off the sofa', 'hopOff', 0.1],
        ['while it runs back', 'run', 1],
        ['while it sits down', 'sitDown', 0.3],
      ] as const)('%s: it is at its desk at once, at rest', (_, during, seconds) => {
        const stage = mount()
        untilOnSofa(stage)
        chat()
        stage.until(() => stage.playback.name === during)
        stage.run(seconds)
        act(() => useSettings.setState({ reduceMotion: true }))
        stage.run(0.1)
        expect(signals()).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
        expect(stage.props()).toMatchObject({ clip: 'idle', placement: AT_DESK })
      })
    })

    describe('the end of a clip that is no longer its business', () => {
      const late = (stage: ReturnType<typeof mount>, clip: ClipName) => act(() => stage.props().onClipFinished(clip))

      it('does not seat it on the sofa before it has hopped there, nor at its desk before it is back', () => {
        const stage = mount()
        stage.until(() => stage.playback.name === 'walk', 30)
        stage.run(1)
        for (const clip of ['standUp', 'hopOn', 'hopOff', 'sitDown', 'loungeWave'] as const) late(stage, clip)
        expect(signals().charState).toBe('goingToSofa')
        expect(stage.props().clip).toBe('walk')

        untilOnSofa(stage)
        chat()
        stage.until(() => stage.playback.name === 'run')
        for (const clip of ['standUp', 'hopOn', 'hopOff', 'sitDown', 'loungeStretch'] as const) late(stage, clip)
        expect(signals().charState).toBe('rushingToDesk')
        expect(stage.props().clip).toBe('run')
        stage.untilState('resting')
        expect(stage.props().placement).toEqual(AT_DESK)
      })

      it('does not end the wave or a fidget on the sofa unless it is theirs', () => {
        const stage = mount()
        untilOnSofa(stage)
        pointer('pointermove', 200, 150)
        stage.untilState('greeting')
        for (const clip of ['wave', 'hopOn', 'loungeStretch', 'sitDown'] as const) late(stage, clip)
        expect(signals().charState).toBe('greeting')
        late(stage, 'loungeWave')
        expect(signals().charState).toBe('fidgeting')
        for (const clip of ['stretch', 'loungeWave', 'loungeLookAround'] as const) late(stage, clip)
        expect(signals().charState).toBe('fidgeting')
        late(stage, 'loungeStretch')
        expect(signals().charState).toBe('resting')
        expect(place()).toBe('sofa')
      })
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
