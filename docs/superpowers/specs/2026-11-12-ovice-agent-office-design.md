# ovice — 3D AI 에이전트 오피스 (프로토타입) 설계

- 작성일: 2026-11-12
- 상태: 설계 승인됨, 구현 계획 작성 전

## 1. 목표

AI 에이전트가 일하는 과정을 3D 캐릭터로 시각화하는 웹사이트. 사용자가 프롬프트를 입력하면
캐릭터가 책상에서 일하는 모습과 진행 상태를 보여주고, 완료되면 결과 파일을 직접 건네준다.
(참고 개념: Grok 봇, Claude Duet, OpenAI 닷 같은 캐릭터형 에이전트)

### 이번 범위 (프로토타입)
- 에이전트는 **프로토타입 모드**로만 동작: 정해진 단계 흐름을 연출하고 예시 결과 문서를 생성한다.
- **실제 모드**(진짜 AI 호출)는 설정에서 선택지로만 존재하고 "준비 중" 안내를 띄운다.
  단, 나중에 교체 가능하도록 에이전트 실행부를 인터페이스로 분리한다.
- 추가 화면/동작은 이후 사용자가 별도로 요청한다.

### 성공 기준
- 대기 중 캐릭터가 커서를 따라보고, 커서가 멈추면 인사하고, 이후 딴짓을 한다.
- 프롬프트 전송 → 작업 중 연출(캐릭터·머리 위 아이콘·말풍선·진행 바) → 완료 시 캐릭터가 걸어 나와 파일을 건넴 → 폴더 클릭 시 문서가 열림.
- 레퍼런스 이미지의 색감과 레이아웃을 그대로 따른다.

## 2. 기술 스택

- React + TypeScript + Vite
- React Three Fiber + drei (3D), Zustand (상태), Vitest (단위 테스트), Playwright (화면 확인)
- 배포: **Vercel**. GitHub 저장소를 Vercel에 연결해 브랜치 푸시마다 미리보기 배포, 기본 브랜치는 프로덕션 배포.
  Vite 정적 빌드(`dist/`)를 그대로 올리며, 필요 시 `vercel.json`으로 빌드 설정을 명시한다.
- 실제 모드 도입 시 API 키는 Vercel 서버리스 함수(`api/`)에 환경변수로 보관한다 (별도 서버 불필요).

## 3. 에셋

- 캐릭터: `ovic_guy_rig_edit_1.glb` → `public/models/ovice_guy.glb`
  - 메시 2개(몸체 `tripo_mesh_84418be3`, 눈 `Cube`), 스킨 1개 / 본 19개
    (`head`, `body`, `hip`, `arm_L/R.001~003`, `Leg_L/R.001~003`, `foot_IK_L/R`, `root 1`, `master control`)
  - 포함 애니메이션 `oviceguy_RigAction`은 키프레임 2개짜리 사실상 정지 포즈 → 모든 동작은 새로 만든다.
- 가구·소품: 3D 모델 없음 → **코드로 직접 3D 모델링** (아래 4.1).

## 4. 화면 구성

### 4.1 3D 장면 (모두 실제 3D 렌더링)
- 밝은 회색 벽 + 옅은 회색 바닥, 부드러운 그림자, 환경맵 반사
- 왼쪽: 크롬 테두리 책장 (오렌지/블랙 라운드 칸 교대, 책·화분·소품)
- 가운데: 크림색 라운드 책상, 하늘색 바퀴 서랍장, 노란 램프, 핑크 컵, 노트북
- 책상 뒤: 오렌지 과녁 모양 의자 (캐릭터 좌석)
- 오른쪽: 실버 튜브 소파 + 블랙 사이드 테이블
- 형태: 라운드 박스, 튜브 곡선, 원통/토러스 조합. 재질: 크롬(금속 반사), 광택 플라스틱
- 캐릭터, 노트북, 건네는 파란 폴더, 머리 위 상태 아이콘(입체 과녁)도 3D
- 카메라: 정면 고정 + 커서에 따른 약한 시차 효과 (설정에서 끌 수 있음)

### 4.2 색상 토큰 (레퍼런스에서 추출, 구현 시 이미지에서 정밀 보정)
| 토큰 | 값(초안) | 용도 |
|---|---|---|
| bg | `#EEEFF1` | 벽/배경 |
| floor | `#D9DADC` | 바닥 |
| orange | `#FF6B2C` | 의자, 책장 칸, 진행 바 |
| black | `#1E1E1E` | 책장 칸, UI 다크 |
| cream | `#F3E6D8` | 책상 |
| chrome | 금속 실버 | 책장 프레임, 소파, 캐릭터 슈트 |
| yellow | `#F5C518` | 램프, 작업 중 아이콘 |
| skyblue | `#9DB4D6` | 서랍장 |
| folderBlue | `#1E6FF0` | 파일 폴더 |
| mint | `#3DDBB0` | 완료 아이콘 |

### 4.3 오버레이 UI (2D HTML)
| 요소 | 동작 |
|---|---|
| 좌상단 "o" 로고 | 표시만 |
| 상단 Office / Agents / Projects 탭 | Office 활성, 나머지 클릭 시 "준비 중" |
| 우상단 오피스 선택 ("Researcher's office" ▾) | "준비 중" |
| 우상단 알림 벨 | "준비 중" |
| 우상단 설정 버튼 (신규) | 설정 창 열기 |
| 말풍선 | 2D, 캐릭터 3D 위치에 고정되어 따라다님 |
| 하단 프롬프트 입력창 | 동작. `+` 첨부, `Claude ▾` 모델 선택은 "준비 중" |
| 오렌지 진행 바 | 작업 중 입력창 대체, 프롬프트 표시, ✕ 취소 |
| 우하단 채팅 버튼 | "준비 중" |
| 우하단 할 일 버튼 | 작업 목록 패널 (지난 결과 다시 열기) |
| 우하단 라이브러리 버튼 | 패널 열기/닫기, 내용은 예시 아이콘 그리드 + Search library |
| 문서 뷰어 | 결과 문서 읽기 + `.md` 다운로드 |

반응형: 데스크톱 우선. 모바일은 카메라를 당겨 캐릭터 중심, 패널은 하단 시트.

## 5. 캐릭터 상태 기계

```
[쉬는 중] --커서 움직임--> [커서 보기] --커서 1.2초 정지--> [인사] --끝--> [딴짓] --끝--> [쉬는 중]
[커서 보기]/[딴짓] 중 커서 움직임 -> [커서 보기]
대기 계열 어디서든 프롬프트 전송 -> [작업 중]
[작업 중] --완료--> [일어나기] -> [걸어 나오기] -> [파일 건네기] --문서 닫힘--> [돌아가 앉기] -> [쉬는 중]
[작업 중] --취소--> [쉬는 중] (말풍선 "Okay, stopping.")
[작업 중] --실패--> [오류] (머리 긁기, "Something went wrong.") -> [쉬는 중]
```

- 쉬는 중: 의자에 기대 숨쉬기, 가끔 눈 깜빡임
- 커서 보기: 머리 좌우 최대 약 45°, 초과분은 몸통이 함께 회전, 부드러운 보간
- 인사: 한 손 흔들기. 최소 8초 간격 (간격 내면 인사 없이 커서 보기 유지 후 딴짓)
- 딴짓: 커피 마시기 / 기지개 / 두리번거리기 / 노트북 두드리기 중 랜덤
- 작업 중: 타이핑 ↔ 턱 괴고 고민 교대, 커서 추적 안 함
- 파일 건네기: 파란 폴더를 화면 쪽으로 내밂. 폴더 클릭 시 문서 뷰어 열림

### 애니메이션 구현
- 모든 동작은 이름으로 호출되는 클립(`idle`, `wave`, `typing`, `think`, `sip`, `stretch`, `lookAround`, `tap`, `standUp`, `walk`, `holdFile`, `sitDown`, `scratchHead`).
- 현재는 본 회전을 코드로 조합한 절차적 클립. GLB에 같은 이름의 애니메이션이 있으면 그것을 우선 사용한다.
- 커서 추적은 다른 클립 위에 덧입혀지는 추가 레이어.

## 6. 작업 흐름

1. 프롬프트 전송 (Enter 또는 ↑, 빈 입력 무시). 작업 중에는 새 프롬프트를 받지 않는다 (동시 작업 1개).
2. Task 생성: `{ id, prompt, status: running|done|cancelled|failed, step, result?, createdAt, finishedAt? }`
3. AgentRunner가 단계 이벤트를 발생시킨다. 프로토타입 기준 총 약 12~15초:
   1. `reading` — "Reading your request..." (고민 포즈)
   2. `searching` — "I'm searching for information on the web..." (타이핑)
   3. `comparing` — "Comparing what I found..." (고민 포즈)
   4. `writing` — "Writing up the report..." (타이핑)
   5. `done` — 결과 문서 전달
4. 결과 문서: 프롬프트를 제목으로 한 마크다운 (요약, 항목별 정리, 출처 예시). 상단에 "예시 결과물" 표시.
5. 실패 시 진행 바가 빨간색 "다시 시도" 버튼으로 바뀌고, 누르면 같은 프롬프트로 새 Task를 시작한다.
6. 작업 목록은 localStorage에 저장 (읽기/쓰기 실패 시 메모리로만 동작).

### AgentRunner 인터페이스
```ts
type AgentStep = 'reading' | 'searching' | 'comparing' | 'writing';
type AgentEvent =
  | { type: 'step'; step: AgentStep; message: string }
  | { type: 'done'; result: { title: string; markdown: string } }
  | { type: 'error'; message: string };

interface AgentRunner {
  run(prompt: string, onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<void>;
}
```
- `MockRunner`: 시간차로 이벤트 발생, AbortSignal로 취소.
- `RealRunner`: 현재 미구현. 설정에서 선택 시 "준비 중" 안내 후 모드는 프로토타입으로 유지.

## 7. 설정

- 에이전트 모드: 프로토타입 / 실제(준비 중)
- 카메라 시차 효과 켜기/끄기
- 애니메이션 줄이기 (기본값은 OS의 reduced-motion 설정을 따름)
- 설정은 localStorage에 저장

## 8. 코드 구조

```
src/
  app/App.tsx
  scene/OfficeScene.tsx, Lighting.tsx, CameraRig.tsx
  scene/furniture/Bookshelf, Desk, Drawer, Chair, Sofa, SideTable, Props
  character/Character.tsx, stateMachine.ts, lookAt.ts, StatusBadge.tsx, clips/*
  agent/types.ts, MockRunner.ts, RealRunner.ts, mockReport.ts
  store/ (Zustand: tasks, settings, character 신호)
  ui/TopBar, PromptBar, ProgressBar, SpeechBubble, Dock, LibraryPanel,
     TasksPanel, DocViewer, SettingsDialog, ComingSoon
  theme/tokens.ts
public/models/ovice_guy.glb
```

데이터 흐름: PromptBar → store(Task 생성) → AgentRunner → 단계 이벤트 → store 갱신 →
캐릭터 상태 기계·말풍선·진행 바가 store를 구독. 캐릭터와 UI는 store로만 연결된다.

## 9. 테스트

- Vitest: 상태 기계 전이(인사 간격, 작업 중 커서 무시, 취소/실패 경로), MockRunner 이벤트 순서와 취소,
  store 저장/복원(저장소 실패 포함), 결과 문서 생성.
- Playwright: 대기 화면 → 프롬프트 전송 → 진행 → 폴더 클릭 → 문서 열림 흐름 스크린샷 확인.
  테스트에서는 MockRunner 시간을 단축하는 옵션을 쓴다.

## 10. 범위 밖 (이번에 하지 않음)

실제 AI 연결, 백엔드, 로그인, 여러 오피스/에이전트 전환, Agents/Projects 화면, 알림, 채팅, 파일 첨부,
모델 선택, 라이브러리 실제 내용.
(Vercel 프로젝트 생성·GitHub 연결은 사용자가 Vercel 대시보드에서 직접 한다. 코드 쪽은 Vercel에서 바로 빌드되도록 준비한다.)
