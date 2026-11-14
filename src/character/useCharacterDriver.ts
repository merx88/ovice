// Brings the character to life: feeds the pointer, the chat, the passing of
// time and the tasks store into the character's state machine, and turns the
// machine's state into what the 3D character plays, where it is and what it
// tells the interface. The rules it applies live in the pure files next to
// this one; this is the only place with listeners, subscriptions and a frame
// loop.
import { useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import { PAGE_LOADED_AT } from '../app/env'
import {
  CHARACTER_HEIGHT,
  HANDOFF_FACING,
  MOBILE_BREAKPOINT,
  SEAT_FACING,
  SEAT_GROUND_POS,
  SOFA_FACING,
  SOFA_PATH,
  SOFA_SEAT_POS,
  WALK_CORNER_RADIUS,
  WALK_OUT_PATH,
} from '../scene/layout'
import { useCharacterSignals } from '../store/characterSignals'
import { useChatActivity } from '../store/chatActivity'
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
import {
  clipAwaitedBy,
  clipSpeedFor,
  clipToPlay,
  firstPhase,
  phaseAfterClip,
  RUN_PACE,
  WALK_PACE,
  type TravelPhase,
} from './clipForState'
import { CLIPS, type ClipName } from './clips'
import { SEAT_SPOT_CLIPS } from './clips/hop'
import { RUN_SPEED } from './clips/run'
import { SEAT_LIFT } from './clips/shared'
import { WALK_SPEED } from './clips/walk'
import { LOOK_EDGE_YAW } from './constants'
import { damp, lookPlaneDistance } from './lookAt'
import {
  measurePath,
  roundCorners,
  RUN_TURNING,
  samplePath,
  stepWalker,
  turnBetween,
  WALK_TURNING,
  type Path,
  type PathSample,
  type Turning,
  type Walker,
} from './path'
import { MAX_STEP } from './playback'
import { initialMachine, transition, type CharEvent, type CharMachine, type CharState } from './stateMachine'
import type { BadgeStatus } from './statusSymbols'
import { runningTask, taskEvents, taskEventsAtFirstSight, type TasksSnapshot } from './taskEvents'

/** The way between the seat (at distance 0) and the hand-off spot (at its full length). */
const ROUTE = measurePath(roundCorners(WALK_OUT_PATH, WALK_CORNER_RADIUS))
/**
 * The way between the seat (at distance 0) and the spot in front of the sofa
 * (at its full length). The two routes only meet at the seat, which is where
 * the character is whenever it changes from one to the other.
 */
const SOFA_ROUTE = measurePath(roundCorners(SOFA_PATH, WALK_CORNER_RADIUS))
/**
 * Back at its chair the character sits down once it faces the desk to within
 * this (radians): its hands come down where the desk is, so it turns first.
 */
const FACES_DESK_WITHIN = 0.1
/** How quickly the bubble's anchor follows the body up and down as it stands up or sits down (1/s). */
const ANCHOR_RATE = 5

/** Where the character is to go on the floor, and how it gets there. */
interface Leg {
  route: Path
  /** How far along the route (m). */
  goal: number
  /** The way it is to face there. */
  facing: number
  /** How fast it is moved (m/s); the clip it moves to is sped up to match (see `clipSpeedFor`). */
  speed: number
  turning: Turning
}

const WALKING = { speed: WALK_SPEED * WALK_PACE, turning: WALK_TURNING } as const
const RUNNING = { speed: RUN_SPEED * RUN_PACE, turning: RUN_TURNING } as const
const TO_SEAT: Leg = { route: ROUTE, goal: 0, facing: SEAT_FACING, ...WALKING }
const TO_HANDOFF: Leg = { route: ROUTE, goal: ROUTE.length, facing: HANDOFF_FACING, ...WALKING }
/** Still at its chair, on the way that leads to the sofa: getting up. */
const UP_FOR_SOFA: Leg = { route: SOFA_ROUTE, goal: 0, facing: SEAT_FACING, ...WALKING }
const TO_SOFA: Leg = { route: SOFA_ROUTE, goal: SOFA_ROUTE.length, facing: SOFA_FACING, ...WALKING }
const RUN_TO_SEAT: Leg = { route: SOFA_ROUTE, goal: 0, facing: SEAT_FACING, ...RUNNING }

/**
 * Where the character is to be on the floor in this state and phase, or null
 * while a clip that is played from the sofa's seat spot has it: lounging
 * there, and hopping on or off.
 */
function legFor({ state, place }: CharMachine, phase: TravelPhase): Leg | null {
  switch (state) {
    case 'walkingOut':
    case 'handingFile':
      return TO_HANDOFF
    case 'goingToSofa':
      if (phase === 'rising') return UP_FOR_SOFA
      return phase === 'moving' ? TO_SOFA : null
    case 'rushingToDesk':
      return phase === 'moving' || phase === 'settling' ? RUN_TO_SEAT : null
    default:
      return place === 'sofa' ? null : TO_SEAT
  }
}

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
  /** Where the character is on the floor: how far along its route, and which way it faces. */
  walker: Walker
  /** How far the journey it is on has come (see `TravelPhase`); means nothing in a state that is no journey. */
  phase: TravelPhase
  /** The last use of the chat that the machine has been told of (see `ChatActivityState.at`). */
  chatAt: number
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
  /** Whether the character was placed on the sofa's seat spot in the last frame. */
  onSeatSpot: boolean
  /** The hop the character is shown doing, and how long it has been doing it (s): where its body is meanwhile. */
  hop: { clip: ClipName | null; time: number }
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
    // What the chat was used for before the character appeared needs no telling: its wait starts as it appears.
    chatAt: useChatActivity.getState().at,
    seen: null,
    handoverTaskId: null,
    cancelledAt: null,
    announcedAt: null,
    firstLineOverAt: null,
    pointer: { x: 0, y: 0 },
    onSeatSpot: false,
    hop: { clip: null, time: 0 },
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

const CLIP_FINISHED: CharEvent = { type: 'clipFinished' }

/** Whether `state` is a way to the sofa or back from it. */
function isSofaTrip(state: CharState): boolean {
  return state === 'goingToSofa' || state === 'rushingToDesk'
}

/**
 * The machine as it is once a way to the sofa or back from it is over, in one
 * cut: for reduced motion, which has no walk, no run and no hop, and waits
 * for no clip. Any other machine is returned as it is.
 */
function cutTripShort(driver: Driver, machine: CharMachine, now: number): CharMachine {
  if (!isSofaTrip(machine.state)) return machine
  if (machine.state === 'rushingToDesk') {
    // At its chair, wherever it was. (On the sofa it is as soon as it is shown lounging there.)
    driver.walker.distance = 0
    driver.walker.facing = SEAT_FACING
  }
  return transition(machine, CLIP_FINISHED, now)
}

/** One event for every frame's tick; the machine reads the time it is given, not the event's. */
const tick: CharEvent & { type: 'tick' } = { type: 'tick', now: 0, canLounge: false }
const sample: PathSample = { position: [0, 0, 0], heading: 0 }
const body: [number, number, number] = [0, 0, 0]
const eye = new Vector3()
const throughPointer = new Vector3()

/**
 * Writes the point the pointer is over into `target`: where the ray from the
 * camera through the pointer meets an upright plane between the character and
 * the camera. The plane stands where the edges of the view are `LOOK_EDGE_YAW`
 * to the side of the seat, so that following the pointer from the desk never
 * turns the body. From the sofa the same point is looked at: a pointer over
 * the character there is on the line to the camera, straight ahead of it.
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
 * Writes the point on the floor the character's body is over into `into`:
 * where it is placed, or, `time` seconds into the hop `hop`, where that hop
 * has carried it from there.
 */
function bodyOver(placement: CharacterPlacement, hop: ClipName | null, time: number, into: [number, number, number]): void {
  const carried = hop === null ? undefined : CLIPS[hop].sample(time)['root 1']?.pos
  const across = carried?.[0] ?? 0
  const ahead = carried?.[2] ?? 0
  const cos = Math.cos(placement.facing)
  const sin = Math.sin(placement.facing)
  into[0] = placement.position[0] + across * cos + ahead * sin
  into[1] = placement.position[1]
  into[2] = placement.position[2] - across * sin + ahead * cos
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
  /** The clip of the latest render: the one the character has been shown, and plays in the next frame. */
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
      const { state, queued, place } = driver.machine
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
        place,
        present: true,
      })
    },
    [driver],
  )

  /** Puts an event to the machine. Returns whether the machine took it. */
  const dispatch = useCallback(
    (event: CharEvent, now: number): boolean => {
      const before = driver.machine
      let after = transition(before, event, now)
      if (after === before) return false
      // With reduced motion the character changes place in one cut, the moment it is sent.
      if (useSettings.getState().reduceMotion) after = cutTripShort(driver, after, now)
      driver.machine = after
      if (after.state !== before.state) driver.phase = firstPhase(after.state, before, driver.phase)
      if (isHandingOver(after.state) !== isHandingOver(before.state)) {
        // The first line of the hand-over is said from here on, or the hand-over is over.
        driver.announcedAt = isHandingOver(after.state) ? now : null
        driver.firstLineOverAt = isHandingOver(after.state) ? now + DONE_FIRST_LINE_MS : null
      }
      if (
        after.state !== before.state ||
        after.fidget !== before.fidget ||
        after.queued !== before.queued ||
        after.place !== before.place
      ) {
        sync(now)
      }
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

  // --- The chat ----------------------------------------------------------------
  useEffect(() => {
    const onChat = ({ at }: { at: number }) => {
      // Each use of the chat is told once, however often this effect is set up.
      if (at === driver.chatAt) return
      driver.chatAt = at
      dispatch({ type: 'chatActivity' }, performance.now())
    }
    // The chat may have been used between the character's first render and this.
    onChat(useChatActivity.getState())
    return useChatActivity.subscribe(onChat)
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
      useCharacterSignals
        .getState()
        .publish({ bubble: [], badge: 'idle', charState: 'resting', place: 'desk', present: false })
    }
  }, [driver, dispatch, sync])

  // --- Every frame -------------------------------------------------------------
  // Before the character's own frame callback, so that it finds this frame's placement.
  useFrame(({ camera, size }, delta) => {
    const now = performance.now()
    // The same step the character's animation takes, so that feet and ground keep pace.
    const step = Math.min(delta, MAX_STEP)
    const reduceMotion = useSettings.getState().reduceMotion

    tick.now = now
    // The sofa is a place to wait where the picture shows it: the narrow view frames the desk alone.
    tick.canLounge = size.width >= MOBILE_BREAKPOINT
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

    const { walker, placement } = driver
    // Reduced motion switched on while it is on its way to the sofa or back: the way is over at once.
    if (reduceMotion && isSofaTrip(driver.machine.state)) dispatch(CLIP_FINISHED, now)

    // What the character has been shown is what it plays in this frame, and where it is placed goes
    // by that and by nothing else: a hop is played from the sofa's seat spot, and the placement may
    // only change in the very frame in which the character starts on the clip that needs it (see
    // `carryOver.ts`). A clip the driver has asked for reaches the character a render later.
    const shown = renderedClip.current
    const onSeatSpot = SEAT_SPOT_CLIPS.includes(shown)
    const leg = legFor(driver.machine, driver.phase)
    let arrived = false
    if (leg === null) {
      // On the sofa, or hopping onto or off it: on the floor that is the spot in front of it.
      if (onSeatSpot) {
        walker.distance = SOFA_ROUTE.length
        walker.facing = SOFA_FACING
      }
    } else if (reduceMotion) {
      walker.distance = leg.goal
      walker.facing = leg.facing
      arrived = true
    } else if (!onSeatSpot && !driver.onSeatSpot) {
      // (Not before it is shown on its feet, nor in the frame in which it is: the hop off the sofa
      // lands it on the spot in front of it, and that is where the run has to find it.)
      arrived = stepWalker(walker, leg.route, leg.goal, leg.facing, leg.speed, step, leg.turning)
    }
    driver.onSeatSpot = onSeatSpot

    if (onSeatSpot) {
      placement.position[0] = SOFA_SEAT_POS[0]
      placement.position[1] = SOFA_SEAT_POS[1]
      placement.position[2] = SOFA_SEAT_POS[2]
      placement.facing = SOFA_FACING
    } else {
      samplePath(leg?.route ?? SOFA_ROUTE, walker.distance, sample)
      placement.position[0] = sample.position[0]
      placement.position[1] = sample.position[1]
      placement.position[2] = sample.position[2]
      placement.facing = walker.facing
    }

    // A walk and a run have no end of their own: arriving is what ends them.
    const { state } = driver.machine
    if (arrived && state === 'walkingOut') {
      dispatch(CLIP_FINISHED, now)
    } else if (arrived && state === 'goingToSofa' && driver.phase === 'moving') {
      // In front of the sofa, its back to it: the hop.
      driver.phase = 'settling'
      sync(now)
    } else if (
      arrived &&
      (state === 'returning' || state === 'rushingToDesk') &&
      driver.phase === 'moving' &&
      Math.abs(turnBetween(walker.facing, SEAT_FACING)) <= FACES_DESK_WITHIN &&
      // If the character sat down a moment ago and has not been shown anything else
      // since, it would not play sitting down again: wait for the render in between.
      shown !== 'sitDown'
    ) {
      driver.phase = 'settling'
      sync(now)
    }

    // Where it looks.
    const { machine } = driver
    if ((machine.state === 'watching' || machine.state === 'greeting') && camera instanceof PerspectiveCamera) {
      projectPointer(driver.pointer, camera, size, driver.lookTarget)
    }

    // Where its bubble goes: beside its head, wherever its body is. The character starts a clip in
    // the frame it is first shown it, so that is when a hop's time begins here too.
    const { hop } = driver
    const hopping = shown === 'hopOn' || shown === 'hopOff' ? shown : null
    hop.time = hopping !== null && hopping === hop.clip ? hop.time + step : 0
    hop.clip = hopping
    bodyOver(placement, hop.clip, hop.time, body)
    driver.lift = damp(driver.lift, bubbleLift(machine.state, machine.place, driver.phase), ANCHOR_RATE, step)
    bubbleAnchorAt(body, driver.lift, useCharacterSignals.getState().bubbleAnchor.current)
  }, -1)

  const onClipFinished = useCallback(
    (clip: ClipName) => {
      // The end of a clip only counts for the state, and the phase of it, that is playing the
      // clip; any other belongs to something the character has already left.
      const { state, fidget, place } = driver.machine
      if (clip !== clipToPlay(state, fidget, null, place, driver.phase)) return
      const next = phaseAfterClip(state, driver.phase)
      if (next !== null) {
        driver.phase = next
        sync(performance.now())
      } else if (clip === clipAwaitedBy(state, fidget, place)) {
        dispatch(CLIP_FINISHED, performance.now())
      }
    },
    [driver, dispatch, sync],
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
