# ovice 3D 에이전트 오피스 (프로토타입) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프롬프트를 받으면 3D 캐릭터가 책상에서 일하는 모습을 연출하고 결과 문서를 건네주는 웹 프로토타입을 만든다.

**Architecture:** 순수 로직(store, AgentRunner, 캐릭터 상태 기계)은 React/Three와 분리해 단위 테스트한다. 3D 장면(R3F)과 2D UI(React DOM)는 Zustand store만 구독하며 서로 직접 참조하지 않는다. 캐릭터 동작은 이름 기반 클립 레지스트리로 호출하고, GLB에 같은 이름의 애니메이션이 있으면 그것을 우선한다.

**Tech Stack:** Vite 5, React 18, TypeScript 5 (strict), three, @react-three/fiber 8, @react-three/drei 9, zustand 4, react-markdown 9, vitest + @testing-library/react + jsdom, @playwright/test, Vercel.

**Spec:** `docs/superpowers/specs/2026-11-12-ovice-agent-office-design.md`

## Global Constraints

- 패키지 매니저 npm. `npm run build`(= `tsc -b && vite build`)와 `npm test`(= `vitest run`)가 항상 통과해야 커밋한다.
- 색상은 `src/theme/tokens.ts`에서만 정의하고 다른 곳은 import해서 쓴다 (하드코딩 금지). Task 1에서 레퍼런스 이미지(4번 가구 사진, 1~3번 UI 스크린샷)를 스포이트로 찍어 spec 4.2 초안 값을 보정한다.
- 말풍선/진행 문구(영문, 그대로 사용):
  - reading `Reading your request...` / searching `I'm searching for information on the web...` / comparing `Comparing what I found...` / writing `Writing up the report...`
  - done `The research is ready.` + `Let me hand you the file.` / cancel `Okay, stopping.` / error `Something went wrong.`
- UI 한국어 문구: 준비 중 토스트 `준비 중인 기능이에요`, 실제 모드 안내 `실제 모드는 준비 중이에요. 프로토타입 모드로 계속할게요.`, 결과 문서 배지 `예시 결과물`, 실패 버튼 `다시 시도`.
- MockRunner 단계 시간(ms): reading 2500, searching 4500, comparing 3000, writing 3500 (합계 13.5초). URL에 `?fast=1`이면 모든 시간 ×0.05.
- 캐릭터 상수: 커서 정지 판정 1200ms, 인사 최소 간격 8000ms, 머리 좌우 최대 45°(초과분 몸통 회전, 몸통 최대 30°).
- localStorage 키: `ovice.tasks.v1`, `ovice.settings.v1`. 접근 실패 시 예외 없이 메모리로만 동작.
- 동시 작업 1개. 결과 Markdown은 raw HTML 렌더링 금지.
- GLB는 `public/models/ovice_guy.glb` (원본: 업로드된 `ovic_guy_rig_edit_1.glb`, 7.2MB).

## Review Focus

1. **작업 도중 새로고침** — 저장된 `running` 작업이 영원히 진행 중으로 남으면 안 된다. 로드 시 `cancelled`로 바꾼다. (Task 2 테스트)
2. **프롬프트에 HTML/Markdown 문법** (`<img onerror>`, `# 제목`) — 결과 문서 제목·본문에서 HTML로 실행되면 안 되고 텍스트로 보여야 한다. (Task 3, Task 8 테스트)
3. **Enter 연타 / 진행 중 재전송** — 작업이 두 개 생기면 안 된다. (Task 4 테스트)
4. **커서가 창 밖으로 나가거나 터치 기기** — 캐릭터가 커서 보기 상태에 갇히면 안 된다. pointerleave는 "커서 정지"로 취급, 터치 탭은 커서 이동으로 취급. (Task 5 테스트)
5. **GLB 로드 실패 / WebGL 미지원** — 화면이 하얗게 죽지 말고 UI는 동작, 장면 자리에 안내 문구. (Task 7 테스트)

---

### Task 1: 프로젝트 기반 + 빈 3D 화면 + Vercel 준비

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `vercel.json`, `.gitignore`, `src/main.tsx`, `src/app/App.tsx`, `src/theme/tokens.ts`, `src/test/setup.ts`, `public/models/ovice_guy.glb`
- Test: `src/theme/tokens.test.ts`

**Interfaces:**
- Produces: `tokens` 객체 — `{ bg, floor, orange, black, cream, chrome, yellow, skyblue, folderBlue, mint, pink, white, danger }` (모두 `#RRGGBB` 문자열), `fastMode(): boolean` (`src/theme/tokens.ts`가 아니라 `src/app/env.ts`에), `App` 컴포넌트.

- [ ] **Step 1:** `npm create vite@latest . -- --template react-ts` 후 의존성 설치 (Tech Stack 목록). `vite.config.ts`에 vitest 설정(`environment: 'jsdom'`, `setupFiles: 'src/test/setup.ts'`). `vercel.json`: `{ "framework": "vite", "buildCommand": "npm run build", "outputDirectory": "dist" }`. GLB 복사.
- [ ] **Step 2: 실패하는 테스트** `tokens.test.ts`: 모든 키가 `/^#[0-9A-F]{6}$/i`에 맞는지, `fastMode()`가 `?fast=1`에서 true, 그 외 false.
- [ ] **Step 3:** `npm test` → FAIL 확인.
- [ ] **Step 4:** 레퍼런스 이미지에서 색을 찍어 `tokens.ts` 작성, `env.ts` 작성. `App`은 전체 화면 `<Canvas shadows>`에 `tokens.bg` 배경만 그린다. 폰트는 Pretendard(한글)+Inter(영문)를 Google Fonts/CDN으로.
- [ ] **Step 5:** `npm test` PASS, `npm run build` 성공, `npm run dev`로 회색 빈 화면 확인.
- [ ] **Step 6: 커밋** `feat: scaffold vite react three project`

### Task 2: Store (설정 + 작업 목록 + 안전한 저장)

**Files:**
- Create: `src/store/storage.ts`, `src/store/settings.ts`, `src/store/tasks.ts`
- Test: `src/store/storage.test.ts`, `src/store/settings.test.ts`, `src/store/tasks.test.ts`

**Interfaces:**
- Produces:
  - `safeLoad<T>(key: string, fallback: T): T`, `safeSave(key: string, value: unknown): void`
  - `type AgentMode = 'prototype' | 'real'`; `useSettings` — `{ mode: AgentMode; parallax: boolean; reduceMotion: boolean; setMode(m): { ok: boolean }; setParallax(b); setReduceMotion(b) }`. `setMode('real')`은 모드를 바꾸지 않고 `{ ok: false }` 반환. `reduceMotion` 기본값은 `matchMedia('(prefers-reduced-motion: reduce)')`.
  - `type TaskStatus = 'running' | 'done' | 'cancelled' | 'failed'`; `type AgentStep = 'reading' | 'searching' | 'comparing' | 'writing'`
  - `interface Task { id: string; prompt: string; status: TaskStatus; step: AgentStep | null; message: string | null; result: { title: string; markdown: string } | null; error: string | null; createdAt: number; finishedAt: number | null }`
  - `useTasks` — `{ tasks: Task[]; activeId: string | null; viewingId: string | null; create(prompt): Task; update(id, patch: Partial<Task>); setViewing(id | null) }`. 최신 작업이 배열 앞.

- [ ] **Step 1: 실패하는 테스트**
  - storage: localStorage가 throw하도록 mock해도 `safeLoad`가 fallback 반환, `safeSave`가 throw하지 않음; 깨진 JSON이면 fallback.
  - settings: `setMode('real')` → `{ok:false}`이고 `mode === 'prototype'`; parallax 변경이 `ovice.settings.v1`에 저장되고 새 store 생성 시 복원.
  - tasks: `create('x')` → status `running`, `activeId` 설정; `update(id,{status:'done'})` → `activeId` null; 저장 후 재생성 시 복원; **저장 데이터에 `running`이 있으면 로드 시 `cancelled` + `finishedAt` 설정, `activeId` null** (Review Focus 1).
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** 구현. 테스트에서 재생성 가능하도록 각 store는 `createSettingsStore()`/`createTasksStore()` 팩토리 + 기본 인스턴스 export. id는 `crypto.randomUUID()`.
- [ ] **Step 4:** `npm test` PASS.
- [ ] **Step 5: 커밋** `feat: add settings and tasks stores with safe persistence`

### Task 3: AgentRunner (Mock / Real) + 예시 리포트

**Files:**
- Create: `src/agent/types.ts`, `src/agent/MockRunner.ts`, `src/agent/RealRunner.ts`, `src/agent/mockReport.ts`, `src/agent/messages.ts`
- Test: `src/agent/MockRunner.test.ts`, `src/agent/mockReport.test.ts`

**Interfaces:**
- Consumes: `AgentStep` (Task 2)
- Produces:
  - spec 6절의 `AgentEvent`, `AgentRunner` 타입 그대로 (`types.ts`)
  - `STEP_MESSAGES: Record<AgentStep, string>`, `MESSAGES = { done: [string, string], cancel, error }` (Global Constraints 문구)
  - `class MockRunner implements AgentRunner { constructor(opts?: { timeScale?: number; failAt?: AgentStep }) }` — 단계 순서대로 `step` 이벤트, 끝나면 `done`. abort 시 이후 이벤트 없이 resolve. `failAt`은 테스트용으로 해당 단계에서 `error` 이벤트.
  - `class RealRunner implements AgentRunner` — `run`이 즉시 `error` 이벤트 `'Real mode is not ready yet.'`
  - `buildMockReport(prompt: string, now: Date): { title: string; markdown: string }`
- [ ] **Step 1: 실패하는 테스트** (vitest fake timers)
  - 이벤트 순서 `reading, searching, comparing, writing, done`, 각 메시지가 `STEP_MESSAGES`와 일치, 2500ms 직전엔 `searching` 미발생.
  - `timeScale: 0.05`면 총 675ms 안에 `done`.
  - 3000ms에 abort → 이후 이벤트 0개, promise resolve.
  - `failAt: 'comparing'` → `error` 이벤트 후 `done` 없음.
  - report: 제목은 프롬프트 앞 60자(초과 시 `…`), 줄바꿈은 공백으로; markdown 첫 줄 `> 예시 결과물`; `## 요약`, `## 주요 내용`, `## 출처 (예시)` 포함; 프롬프트 `<img src=x onerror=alert(1)>` / `# hi`가 제목에 들어갈 때 Markdown 특수문자(`\ ` * _ # < > [ ]`)가 백슬래시 이스케이프됨 (Review Focus 2).
- [ ] **Step 2:** FAIL 확인. **Step 3:** 구현 (setTimeout 체인 + AbortSignal 리스너). **Step 4:** PASS.
- [ ] **Step 5: 커밋** `feat: add agent runner interface with mock and real stubs`

### Task 4: 작업 오케스트레이션 (시작 / 취소 / 재시도)

**Files:**
- Create: `src/agent/orchestrator.ts`
- Test: `src/agent/orchestrator.test.ts`

**Interfaces:**
- Consumes: `useTasks`, `useSettings` (Task 2), `MockRunner`, `RealRunner`, `MESSAGES` (Task 3), `fastMode()` (Task 1)
- Produces: `startTask(prompt: string): Task | null`, `cancelActive(): void`, `retry(taskId: string): Task | null`, `createOrchestrator(deps: { tasks, settings, makeRunner: (mode: AgentMode) => AgentRunner })` (테스트용 팩토리, 기본 인스턴스가 위 세 함수를 export)
- [ ] **Step 1: 실패하는 테스트** (가짜 runner 주입)
  - 공백만 있는 프롬프트 → `null`, 작업 생성 안 됨.
  - `startTask` 두 번 연속 호출 → 두 번째 `null`, 작업 1개 (Review Focus 3).
  - step 이벤트 → task.step/message 갱신; done → status `done`, result 저장, `finishedAt` 설정.
  - `cancelActive()` → status `cancelled`, message `Okay, stopping.`, runner의 signal aborted.
  - error 이벤트 → status `failed`, error 메시지 저장; `retry(id)` → 같은 프롬프트로 새 작업.
  - settings.mode는 항상 prototype이므로 `makeRunner('prototype')`만 호출됨.
- [ ] **Step 2:** FAIL. **Step 3:** 구현 (작업별 AbortController 보관). **Step 4:** PASS.
- [ ] **Step 5: 커밋** `feat: add task orchestrator`

### Task 5: 캐릭터 상태 기계 (순수 로직)

**Files:**
- Create: `src/character/stateMachine.ts`, `src/character/constants.ts`
- Test: `src/character/stateMachine.test.ts`

**Interfaces:**
- Produces:
  - `type CharState = 'resting' | 'watching' | 'greeting' | 'fidgeting' | 'working' | 'standingUp' | 'walkingOut' | 'handingFile' | 'returning' | 'error'`
  - `type FidgetKind = 'sip' | 'stretch' | 'lookAround' | 'tap'`
  - `type CharEvent = { type: 'pointerMove' } | { type: 'pointerLeave' } | { type: 'tick'; now: number } | { type: 'taskStarted' } | { type: 'taskDone' } | { type: 'taskCancelled' } | { type: 'taskFailed' } | { type: 'clipFinished' } | { type: 'fileOpened' } | { type: 'viewerClosed' }`
  - `interface CharMachine { state: CharState; fidget: FidgetKind | null; lastPointerAt: number; lastGreetAt: number; enteredAt: number }`
  - `initialMachine(now: number): CharMachine`, `transition(m: CharMachine, e: CharEvent, now: number, rand?: () => number): CharMachine`
  - `constants.ts`: `POINTER_STILL_MS = 1200`, `GREET_INTERVAL_MS = 8000`, `HEAD_MAX_YAW = Math.PI/4`, `BODY_MAX_YAW = Math.PI/6`
- [ ] **Step 1: 실패하는 테스트** — spec 5절 다이어그램의 모든 화살표 하나당 테스트 하나, 추가로:
  - watching에서 pointerMove 없이 1200ms 경과 tick → greeting; 1199ms → watching 유지.
  - 직전 인사 후 8000ms 미만이면 1200ms 정지 시 greeting 대신 fidgeting.
  - pointerLeave는 즉시 정지로 간주해 다음 tick(1200ms 경과 후)에 greeting/fidgeting (Review Focus 4).
  - working 중 pointerMove 무시; working에서 taskCancelled → resting; taskFailed → error → clipFinished → resting.
  - handingFile에서 fileOpened는 상태 유지, viewerClosed → returning → clipFinished → resting.
  - fidget 종류는 `rand`로 결정 (rand=0 → 'sip', 0.99 → 'tap').
- [ ] **Step 2:** FAIL. **Step 3:** 구현 (switch 기반 순수 함수). **Step 4:** PASS.
- [ ] **Step 5: 커밋** `feat: add character state machine`

### Task 6: 3D 오피스 장면 (코드 모델링 가구)

**Files:**
- Create: `src/scene/OfficeScene.tsx`, `src/scene/Lighting.tsx`, `src/scene/CameraRig.tsx`, `src/scene/layout.ts`, `src/scene/materials.ts`, `src/scene/furniture/{Bookshelf,Desk,Drawer,Chair,Sofa,SideTable,Props}.tsx`
- Modify: `src/app/App.tsx` (Canvas 안에 `OfficeScene`)
- Test: `src/scene/layout.test.ts`, Playwright 스크린샷 (Task 10의 설정 재사용 전이므로 이 Task에서는 `scripts/snap.mjs` 간이 스크립트)

**Interfaces:**
- Consumes: `tokens`, `useSettings().parallax`
- Produces: `layout.ts` — 월드 좌표 상수 `SEAT_POS`, `SEAT_FACING`, `HANDOFF_POS`, `LAPTOP_POS`, `DESK_TOP_Y`, `CAMERA = { position, fov, target }`, 모바일용 `CAMERA_MOBILE`. 단위는 미터, 책상 폭 2.4.
- [ ] **Step 1: 실패하는 테스트** `layout.test.ts`: `HANDOFF_POS.z > SEAT_POS.z` (책상 앞), `HANDOFF_POS`가 책상 바운딩 박스와 겹치지 않음, `SEAT_POS.y`가 0보다 큼.
- [ ] **Step 2:** FAIL. **Step 3:** 구현.
  - `materials.ts`: `chrome`(MeshPhysical, metalness 1, roughness 0.15), `glossy(color)`(MeshPhysical, clearcoat 1, roughness 0.3) 공유 인스턴스.
  - 형태: drei `RoundedBox`(책상 상판·다리, 책장 칸, 서랍장), `TubeGeometry`+`CatmullRomCurve3`(소파 튜브, 의자 다리, 사이드 테이블 S자), `Torus`/`Cylinder`(의자 과녁 등받이, 램프, 컵).
  - `Lighting`: drei `Environment preset="studio"` + 방향광 그림자 + `ContactShadows`.
  - `CameraRig`: parallax true면 포인터 위치에 따라 카메라 ±0.15 이동(lerp), 화면 폭 < 768이면 `CAMERA_MOBILE`.
- [ ] **Step 4:** PASS, `node scripts/snap.mjs` 스크린샷을 레퍼런스 4번 이미지와 나란히 보고 배치·색이 맞는지 확인, 어긋나면 조정.
- [ ] **Step 5: 커밋** `feat: build office scene with procedural furniture`

### Task 7: 캐릭터 로딩 + 절차적 클립 + 시선 레이어 + 상태 아이콘

**Files:**
- Create: `src/character/Character.tsx`, `src/character/rig.ts`, `src/character/clips/index.ts`, `src/character/clips/{idle,wave,typing,think,sip,stretch,lookAround,tap,standUp,walk,holdFile,sitDown,scratchHead}.ts`, `src/character/lookAt.ts`, `src/character/StatusBadge.tsx`, `src/character/Folder.tsx`, `src/scene/SceneErrorBoundary.tsx`
- Test: `src/character/clips/index.test.ts`, `src/character/lookAt.test.ts`, `src/scene/SceneErrorBoundary.test.tsx`

**Interfaces:**
- Consumes: `layout.ts` 좌표, `HEAD_MAX_YAW`, `BODY_MAX_YAW`
- Produces:
  - `type ClipName = 'idle' | 'wave' | 'typing' | 'think' | 'sip' | 'stretch' | 'lookAround' | 'tap' | 'standUp' | 'walk' | 'holdFile' | 'sitDown' | 'scratchHead'`
  - `interface Pose { [bone: string]: { rot?: [number, number, number]; pos?: [number, number, number] } }` — 키는 GLB 본 이름 (`head`, `body`, `hip`, `arm_L.001` … `foot_IK_R`, `master control`)
  - `interface ProceduralClip { duration: number | null /* null = 반복 */; sample(t: number): Pose }`
  - `resolveClip(name: ClipName, glbClips: THREE.AnimationClip[]): { kind: 'glb'; clip: THREE.AnimationClip } | { kind: 'procedural'; clip: ProceduralClip }`
  - `computeLookYaw(targetYaw: number): { head: number; body: number }` — head는 ±HEAD_MAX_YAW로 클램프, 초과분은 body로(±BODY_MAX_YAW 클램프)
  - `<Character clip: ClipName; position: Vector3; facing: number; lookTarget: Vector3 | null; onClipFinished(): void; holdingFile: boolean; onFolderClick(): void />`
  - `<StatusBadge status: 'working' | 'done' | 'error' | null />` (working=yellow 회전, done=mint, error=danger)
  - `<SceneErrorBoundary>` — 자식 에러 시 `3D 화면을 불러오지 못했어요` 표시
- [ ] **Step 1: 실패하는 테스트**
  - `resolveClip('wave', [])` → procedural; GLB 클립 배열에 `name: 'wave'`가 있으면 glb.
  - 모든 `ClipName`이 레지스트리에 존재, 유한 duration 클립은 `sample(duration)`이 NaN 없는 Pose.
  - `computeLookYaw(0.3)` → `{head:0.3, body:0}`; `computeLookYaw(1.2)` → head `π/4`, body `π/6`; 음수 대칭.
  - `SceneErrorBoundary`가 throw하는 자식 대신 안내 문구 렌더 (Review Focus 5). `App`에서 Canvas를 이 경계로 감싸고, WebGL 미지원(`!window.WebGLRenderingContext`)이면 같은 문구.
- [ ] **Step 2:** FAIL. **Step 3:** 구현.
  - `rig.ts`: `useGLTF`로 로드, 본 이름→Bone 맵, 각 본의 rest 쿼터니언 저장. 절차적 Pose는 rest에 곱하는 오프셋.
  - 클립 전환 시 0.25초 블렌드. lookAt은 클립 적용 후 head/body에 추가 회전.
  - 앉은 자세는 `hip` 내리고 `Leg_*.001` 앞으로 90° — idle/typing/think/sip/stretch/lookAround/tap/wave는 앉은 자세 기반, walk/holdFile은 선 자세.
  - 폴더는 `holdingFile`일 때 양손 사이에 `folderBlue` RoundedBox + 탭, 클릭 시 `onFolderClick`, hover 시 커서 pointer.
- [ ] **Step 4:** PASS, 스크린샷으로 앉은 자세가 의자에 맞는지 확인, 각 클립을 `?clip=<name>` 디버그 파라미터로 하나씩 눈으로 확인.
- [ ] **Step 5: 커밋** `feat: add character rig, procedural clips, look-at and status badge`

### Task 8: 캐릭터 드라이버 (상태 기계 ↔ store ↔ 3D)

**Files:**
- Create: `src/character/useCharacterDriver.ts`, `src/character/clipForState.ts`, `src/store/characterSignals.ts`
- Modify: `src/scene/OfficeScene.tsx` (Character 배치)
- Test: `src/character/clipForState.test.ts`

**Interfaces:**
- Consumes: `transition`, `CharMachine` (Task 5), `useTasks` (Task 2), `Character` props (Task 7)
- Produces:
  - `clipForState(state: CharState, fidget: FidgetKind | null, step: AgentStep | null): ClipName` — working+reading/comparing→`think`, searching/writing→`typing`; resting/watching→`idle`; greeting→`wave`; fidgeting→fidget 이름; standingUp→`standUp`; walkingOut/returning→`walk`(returning 끝에 `sitDown`); handingFile→`holdFile`; error→`scratchHead`
  - `useCharacterSignals` (zustand) — `{ bubble: string[]; bubbleAnchor: [number, number, number]; badge: 'working'|'done'|'error'|null; charState: CharState }` UI가 구독
- [ ] **Step 1: 실패하는 테스트** `clipForState` 매핑 표 전체.
- [ ] **Step 2:** FAIL. **Step 3:** 구현.
  - window `pointermove`/`pointerdown`(터치 포함) → `pointerMove`, document `pointerleave` → `pointerLeave`; `useFrame`에서 `tick`.
  - tasks 구독: 활성 작업 생성→`taskStarted`, done→`taskDone`, cancelled→`taskCancelled`, failed→`taskFailed`. `viewingId`가 null로 바뀌면 `viewerClosed`.
  - 위치: walkingOut은 `SEAT_POS`→`HANDOFF_POS` 1.6초 보간, returning은 역방향. lookTarget은 포인터 NDC를 장면 평면에 투영.
  - 말풍선: working이면 task.message, handingFile이면 `MESSAGES.done`, 취소 직후 2초간 cancel 문구, error면 error 문구, 그 외 없음. 앵커는 머리 본 월드 좌표 + (0.35, 0.25, 0).
  - `reduceMotion`이면 walk 보간 생략(순간이동)하고 parallax 무시.
- [ ] **Step 4:** PASS. dev 서버에서 대기→커서→인사→딴짓, `?fast=1`로 작업 흐름을 눈으로 확인.
- [ ] **Step 5: 커밋** `feat: drive character from state machine and tasks`

### Task 9: 오버레이 UI

**Files:**
- Create: `src/ui/{TopBar,ComingSoon,PromptBar,ProgressBar,SpeechBubble,Dock,LibraryPanel,TasksPanel,DocViewer,SettingsDialog,Icon}.tsx`, `src/ui/ui.css`, `src/ui/toast.ts`
- Modify: `src/app/App.tsx`
- Test: `src/ui/PromptBar.test.tsx`, `src/ui/SettingsDialog.test.tsx`, `src/ui/DocViewer.test.tsx`, `src/ui/TasksPanel.test.tsx`

**Interfaces:**
- Consumes: `startTask`, `cancelActive`, `retry` (Task 4), `useTasks`, `useSettings` (Task 2), `useCharacterSignals` (Task 8)
- Produces: `showComingSoon(): void` (`toast.ts`), 각 컴포넌트는 props 없이 store 구독 (`SpeechBubble`만 R3F drei `<Html>`로 Canvas 안에 배치)
- [ ] **Step 1: 실패하는 테스트**
  - PromptBar: 빈/공백 입력 Enter → `startTask` 미호출; 텍스트 Enter → 1회 호출 후 입력 비움; Shift+Enter는 줄바꿈; 활성 작업 있으면 ProgressBar가 대신 렌더되고 프롬프트 텍스트 표시, ✕ 클릭 → `cancelActive`; 최신 작업 `failed`이면 `다시 시도` 버튼 → `retry(id)`. `+`·`Claude ▾` 클릭 → 준비 중 토스트.
  - SettingsDialog: 실제 모드 선택 → 안내 문구 `실제 모드는 준비 중이에요. 프로토타입 모드로 계속할게요.` 표시, 라디오는 프로토타입 유지; parallax/reduceMotion 토글이 store 반영.
  - DocViewer: `예시 결과물` 배지; 본문에 `<img src=x onerror=alert(1)>`가 있어도 `img` 요소가 생기지 않음 (Review Focus 2); 다운로드 버튼이 `<title>.md` 파일명으로 Blob 생성; Esc/닫기 → `setViewing(null)`.
  - TasksPanel: 작업 0개면 `아직 맡긴 작업이 없어요`; done 작업 클릭 → `setViewing(id)`; 상태별 라벨(진행 중/완료/취소됨/실패).
- [ ] **Step 2:** FAIL. **Step 3:** 구현. 레이아웃·크기·라운드는 레퍼런스 스크린샷 기준 (상단 탭 알약 높이 ~64px, 입력창 다크 라운드 패널 폭 ~780px, 진행 바 오렌지 알약, 우하단 3버튼 다크 알약, 라이브러리 패널 3×3 그리드 + `Search library`). 아이콘은 inline SVG(`Icon.tsx`). 768px 미만: 탭 축소, 패널은 하단 시트, 좌우 여백 16px. 모든 버튼에 `aria-label`, 키보드 포커스 표시.
- [ ] **Step 4:** PASS, 스크린샷으로 레퍼런스 1~3번과 비교.
- [ ] **Step 5: 커밋** `feat: add overlay ui`

### Task 10: E2E 흐름 검증 + 배포 확인

**Files:**
- Create: `playwright.config.ts`, `e2e/flow.spec.ts`
- Modify: `package.json` (`"e2e": "playwright test"`), `README.md` (실행·배포 방법, 한국어)

**Interfaces:**
- Consumes: 전체 앱, `?fast=1`

- [ ] **Step 1: 테스트 작성** `flow.spec.ts` (Chromium, `webServer: npm run build && npm run preview`, 사전 설치된 브라우저 사용, `--trace off`):
  - 첫 화면에 Office 탭, 입력창 표시, 콘솔 에러 0개.
  - `?fast=1`에서 프롬프트 입력 → 진행 바에 프롬프트 표시 → 말풍선 `Let me hand you the file.` 등장 → 캔버스의 폴더 클릭(테스트용 `data-testid="folder-hit"` DOM 핫스팟을 Html로 노출) → 문서 뷰어에 `예시 결과물` → 닫기 → 할 일 패널에 완료 1건.
  - 진행 중 ✕ → `Okay, stopping.` 표시, 입력창 복귀.
  - 새로고침 후 할 일 패널에 작업 유지.
  - 390×844 뷰포트에서 가로 스크롤 없음.
- [ ] **Step 2:** `npm run e2e -- --trace off` 실행, 실패 원인 수정 후 PASS.
- [ ] **Step 3:** `npm run build` 출력이 `dist/`에 생기고 GLB가 `dist/models/`에 포함되는지 확인.
- [ ] **Step 4: 커밋 + 푸시** `test: add e2e flow and deployment notes` → 사용자에게 Vercel Import 안내.
