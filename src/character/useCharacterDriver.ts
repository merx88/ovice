// Brings the character to life: feeds the pointer, the passing of time and the
// tasks store into the character's state machine, and turns the machine's
// state into what the 3D character plays, where it stands and what it tells
// the interface. The rules it applies live in the pure files next to this one;
// this is the only place with listeners, subscriptions and a frame loop.
import { useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import { PAGE_LOADED_AT } from '../app/env'
import {
  CHARACTER_HEIGHT,
  HANDOFF_FACING,
  SEAT_FACING,
  SEAT_GROUND_POS,
  WALK_CORNER_RADIUS,
  WALK_OUT_PATH,
} from '../scene/layout'
import { useCharacterSignals } from '../store/characterSignals'
import { useSettings } from '../store/settings'
import { useTasks, type Task } from '../store/tasks'
import {
  badgeForState,
  bubbleAnchorAt,
  bubbleFor,
  bubbleLift,
  CANCEL_BUBBLE_MS,
  DONE_FIRST_LINE_MS,
} from './bubble'
import type { CharacterPlacement, CharacterProps } from './Character'
import { clipAwaitedBy, clipSpeedFor, clipToPlay, WALK_PACE, type TravelPhase } from './clipForState'
import type { ClipName } from './clips'
import { SEAT_LIFT } from './clips/shared'
import { WALK_SPEED } from './clips/walk'
import { LOOK_EDGE_YAW } from './constants'
import { damp, lookPlaneDistance } from './lookAt'
import { measurePath, roundCorners, samplePath, stepWalker, turnBetween, type PathSample, type Walker } from './path'
import { MAX_STEP } from './playback'
import { initialMachine, transition, type CharEvent, type CharMachine, type CharState } from './stateMachine'
import type { BadgeStatus } from './statusSymbols'
import { runningTask, taskEvents, taskEventsAtFirstSight, type TasksSnapshot } from './taskEvents'

/** The way between the seat (at distance 0) and the hand-off spot (at its full length). */
const ROUTE = measurePath(roundCorners(WALK_OUT_PATH, WALK_CORNER_RADIUS))
/** How fast the character is moved along it (m/s); its walk clip is sped up to match. */
const WALK_GROUND_SPEED = WALK_SPEED * WALK_PACE
/**
 * Back at its chair the character sits down once it faces the desk to within
 * this (radians): its hands come down where the desk is, so it turns first.
 */
const FACES_DESK_WITHIN = 0.1
/** How quickly the bubble's anchor follows the body up and down as it stands up or sits down (1/s). */
const ANCHOR_RATE = 5

/** What the character is rendered from. React renders again only when one of these changes. */
interface View {
  clip: ClipName
  badge: BadgeStatus
  holdingFile: boolean
  /** Whether the character looks at the pointer. */
  looking: boolean
}

/** Everything the driver keeps between events and frames, outside React. */
interface Driver {
  machine: CharMachine
  /** Where the character is on the route and which way it faces. */
  walker: Walker
  /** How far a way back to the chair has come: `settling` once the character has reached it and sits down. */
  phase: TravelPhase
  /** The tasks as they were when the driver last looked; null until it has looked once. */
  seen: TasksSnapshot | null
  /** The task whose result is being handed over: what the folder opens. */
  handoverTaskId: string | null
  /** When a task was last cancelled (ms), until the line about it has been said or another task starts. */
  cancelledAt: number | null
  /** When the character began to announce the result it is bringing out (ms); null while it brings none. */
  announcedAt: number | null
  /** When the first line of the hand-over has had its time (ms), until that moment has been acted on. */
  firstLineOverAt: number | null
  /** Where the pointer last was, in CSS pixels from the viewport's top left. */
  pointer: { x: number; y: number }
  /** How far the bubble's anchor is raised for sitting, on its way to where it belongs. */
  lift: number
  /** Handed to the character once and changed in place from then on. */
  placement: CharacterPlacement
  lookTarget: [number, number, number]
}

function createDriver(now: number): Driver {
  return {
    machine: initialMachine(now),
    walker: { distance: 0, facing: SEAT_FACING },
    phase: 'moving',
    seen: null,
    handoverTaskId: null,
    cancelledAt: null,
    announcedAt: null,
    firstLineOverAt: null,
    pointer: { x: 0, y: 0 },
    lift: SEAT_LIFT,
    placement: { position: [...SEAT_GROUND_POS], facing: SEAT_FACING },
    lookTarget: [SEAT_GROUND_POS[0], CHARACTER_HEIGHT, SEAT_GROUND_POS[2] + 1],
  }
}

function viewOf({ machine, phase }: Driver, running: Task | undefined): View {
  const step = running?.step ?? null
  return {
    clip: clipToPlay(machine.state, machine.fidget, step, machine.place, phase),
    badge: badgeForState(machine.state, machine.queued, step),
    holdingFile: machine.state === 'handingFile',
    looking: machine.state === 'watching' || machine.state === 'greeting',
  }
}

/** Whether the character is bringing a result out: from standing up to holding the file. */
function isHandingOver(state: CharState): boolean {
  return state === 'standingUp' || state === 'walkingOut' || state === 'handingFile'
}

function sameView(a: View, b: View): boolean {
  return a.clip === b.clip && a.badge === b.badge && a.holdingFile === b.holdingFile && a.looking === b.looking
}

/**
 * One event for every frame's tick; the machine reads the time it is given, not the event's.
 * The sofa is not offered as a place to wait yet.
 */
const tick: CharEvent & { type: 'tick' } = { type: 'tick', now: 0, canLounge: false }
const sample: PathSample = { position: [0, 0, 0], heading: 0 }
const eye = new Vector3()
const throughPointer = new Vector3()

/**
 * Writes the point the pointer is over into `target`: where the ray from the
 * camera through the pointer meets an upright plane between the character and
 * the camera. The plane stands where the edges of the view are `LOOK_EDGE_YAW`
 * to the side of the seat, so that following the pointer never turns the body.
 */
function projectPointer(
  pointer: { x: number; y: number },
  camera: PerspectiveCamera,
  size: { width: number; height: number; left: number; top: number },
  target: [number, number, number],
): void {
  const x = Math.min(1, Math.max(-1, ((pointer.x - size.left) / size.width) * 2 - 1))
  const y = Math.min(1, Math.max(-1, 1 - ((pointer.y - size.top) / size.height) * 2))
  eye.setFromMatrixPosition(camera.matrixWorld)
  throughPointer.set(x, y, 0.5).unproject(camera).sub(eye)
  // The camera looks along -z, at the character; anything else has no plane to meet.
  if (throughPointer.z >= 0) return

  const seatZ = SEAT_GROUND_POS[2]
  const viewHalfWidth = Math.tan((camera.fov * Math.PI) / 360) * camera.aspect
  const planeZ = seatZ + lookPlaneDistance(eye.z - seatZ, viewHalfWidth, LOOK_EDGE_YAW)
  const reach = (planeZ - eye.z) / throughPointer.z
  target[0] = eye.x + throughPointer.x * reach
  target[1] = eye.y + throughPointer.y * reach
  target[2] = planeZ
}

/**
 * Drives the character and returns the props to render `<Character>` with.
 * Call it once, inside the canvas. While it is mounted it also keeps the
 * character signals store up to date for the interface.
 */
export function useCharacterDriver(): CharacterProps {
  const held = useRef<Driver | null>(null)
  const driver = (held.current ??= createDriver(performance.now()))
  const [view, setView] = useState(() => viewOf(driver, runningTask(useTasks.getState())))
  /** The view last handed to React, which may not have rendered it yet. */
  const asked = useRef(view)
  /** The clip of the latest render, which is the one the character can have seen. */
  const renderedClip = useRef(view.clip)
  renderedClip.current = view.clip

  /** Brings what is rendered and what the interface is told in line with the machine. */
  const sync = useCallback(
    (now: number) => {
      const running = runningTask(useTasks.getState())
      const next = viewOf(driver, running)
      // Only a view that differs is handed to React: being asked to keep what it has can cost it a render all the same.
      if (!sameView(asked.current, next)) {
        asked.current = next
        setView(next)
      }
      const { state, queued } = driver.machine
      useCharacterSignals.getState().publish({
        bubble: bubbleFor({
          state,
          queued,
          message: running?.message ?? null,
          sinceCancel: driver.cancelledAt === null ? null : now - driver.cancelledAt,
          sinceDone: driver.announcedAt === null ? null : now - driver.announcedAt,
        }),
        badge: next.badge,
        charState: state,
      })
    },
    [driver],
  )

  /** Puts an event to the machine. Returns whether the machine took it. */
  const dispatch = useCallback(
    (event: CharEvent, now: number): boolean => {
      const before = driver.machine
      const after = transition(before, event, now)
      if (after === before) return false
      driver.machine = after
      if (after.state !== before.state) driver.phase = 'moving'
      if (isHandingOver(after.state) !== isHandingOver(before.state)) {
        // The first line of the hand-over is said from here on, or the hand-over is over.
        driver.announcedAt = isHandingOver(after.state) ? now : null
        driver.firstLineOverAt = isHandingOver(after.state) ? now + DONE_FIRST_LINE_MS : null
      }
      if (after.state !== before.state || after.fidget !== before.fidget || after.queued !== before.queued) sync(now)
      return true
    },
    [driver, sync],
  )

  // --- The pointer -----------------------------------------------------------
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      driver.pointer.x = event.clientX
      driver.pointer.y = event.clientY
      dispatch({ type: 'pointerMove' }, performance.now())
    }
    const onLeave = () => {
      dispatch({ type: 'pointerLeave' }, performance.now())
    }
    const page = document.documentElement
    // A tap is a pointerdown without any pointermove before it.
    window.addEventListener('pointermove', onPointer)
    window.addEventListener('pointerdown', onPointer)
    page.addEventListener('pointerleave', onLeave)
    page.addEventListener('mouseleave', onLeave)
    window.addEventListener('blur', onLeave)
    return () => {
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerdown', onPointer)
      page.removeEventListener('pointerleave', onLeave)
      page.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('blur', onLeave)
    }
  }, [driver, dispatch])

  // --- The tasks ---------------------------------------------------------------
  useEffect(() => {
    const onTasks = (tasks: TasksSnapshot) => {
      const now = performance.now()
      // The first sight comes once in the driver's life, however often this effect is set up.
      // The page-load time is a reading of the wall clock, as the time a task is stamped with is.
      const events =
        driver.seen === null ? taskEventsAtFirstSight(tasks, PAGE_LOADED_AT) : taskEvents(driver.seen, tasks)
      for (const event of events) {
        if (event.type === 'taskStarted') driver.cancelledAt = null
        if (event.type === 'taskCancelled') driver.cancelledAt = now
        const taken = dispatch(event, now)
        if (taken && event.type === 'taskDone') driver.handoverTaskId = event.taskId
      }
      driver.seen = tasks
      // The running task's step or progress line may have changed without any event.
      sync(now)
    }
    // Whatever is in the store by now is history, except a task that is running
    // and a result that was ready before the character was there to hand it over.
    onTasks(useTasks.getState())
    const unsubscribe = useTasks.subscribe(onTasks)
    return () => {
      unsubscribe()
      useCharacterSignals.getState().publish({ bubble: [], badge: 'idle', charState: 'resting' })
    }
  }, [driver, dispatch, sync])

  // --- Every frame -------------------------------------------------------------
  // Before the character's own frame callback, so that it finds this frame's placement.
  useFrame(({ camera, size }, delta) => {
    const now = performance.now()
    // The same step the character's animation takes, so that feet and ground keep pace.
    const step = Math.min(delta, MAX_STEP)

    tick.now = now
    dispatch(tick, now)
    if (driver.cancelledAt !== null && now - driver.cancelledAt >= CANCEL_BUBBLE_MS) {
      driver.cancelledAt = null
      sync(now)
    }
    if (driver.firstLineOverAt !== null && now >= driver.firstLineOverAt) {
      // A character that has already arrived goes on to its second line now.
      driver.firstLineOverAt = null
      sync(now)
    }

    // Where the character is: on its way to the hand-off spot, or to its seat.
    const { walker, placement } = driver
    const out = driver.machine.state === 'walkingOut' || driver.machine.state === 'handingFile'
    const goal = out ? ROUTE.length : 0
    const goalFacing = out ? HANDOFF_FACING : SEAT_FACING
    let arrived = true
    if (useSettings.getState().reduceMotion) {
      walker.distance = goal
      walker.facing = goalFacing
    } else {
      arrived = stepWalker(walker, ROUTE, goal, goalFacing, WALK_GROUND_SPEED, step)
    }
    samplePath(ROUTE, walker.distance, sample)
    placement.position[0] = sample.position[0]
    placement.position[1] = sample.position[1]
    placement.position[2] = sample.position[2]
    placement.facing = walker.facing

    if (arrived && driver.machine.state === 'walkingOut') {
      // A walk has no end of its own: arriving is what ends this one.
      dispatch({ type: 'clipFinished' }, now)
    } else if (
      arrived &&
      driver.machine.state === 'returning' &&
      driver.phase === 'moving' &&
      Math.abs(turnBetween(walker.facing, SEAT_FACING)) <= FACES_DESK_WITHIN &&
      // If the character sat down a moment ago and has not been shown anything else
      // since, it would not play sitting down again: wait for the render in between.
      renderedClip.current !== clipAwaitedBy('returning', null, 'desk')
    ) {
      driver.phase = 'settling'
      sync(now)
    }

    // Where it looks.
    const { state } = driver.machine
    if ((state === 'watching' || state === 'greeting') && camera instanceof PerspectiveCamera) {
      projectPointer(driver.pointer, camera, size, driver.lookTarget)
    }

    // Where its bubble goes.
    driver.lift = damp(driver.lift, bubbleLift(state, driver.machine.place, driver.phase), ANCHOR_RATE, step)
    bubbleAnchorAt(placement.position, driver.lift, useCharacterSignals.getState().bubbleAnchor.current)
  }, -1)

  const onClipFinished = useCallback(
    (clip: ClipName) => {
      // The end of a clip only counts for the state that is waiting for it; any
      // other belongs to a state the machine has already left.
      const { state, fidget, place } = driver.machine
      if (clip !== clipAwaitedBy(state, fidget, place)) return
      dispatch({ type: 'clipFinished' }, performance.now())
    },
    [driver, dispatch],
  )

  const onFolderClick = useCallback(() => {
    if (driver.handoverTaskId !== null) useTasks.getState().setViewing(driver.handoverTaskId)
    dispatch({ type: 'fileOpened' }, performance.now())
  }, [driver, dispatch])

  return {
    clip: view.clip,
    clipSpeed: clipSpeedFor(view.clip),
    placement: driver.placement,
    lookTarget: view.looking ? driver.lookTarget : null,
    badge: view.badge,
    holdingFile: view.holdingFile,
    onClipFinished,
    onFolderClick,
  }
}
