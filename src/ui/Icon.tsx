import type { CSSProperties, ReactNode } from 'react'

const STROKE = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Every icon of the interface, drawn on a 24 × 24 grid in the colour of the text around it. */
const SHAPES = {
  /** The map pin of the office pill. */
  pin: (
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M12 2C8.1 2 5 5.1 5 8.9c0 4.9 5.6 11.5 6.3 12.3a.9.9 0 0 0 1.4 0C13.4 20.4 19 13.8 19 8.9 19 5.1 15.9 2 12 2zm0 9.5a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z"
    />
  ),
  /** The small filled triangle that marks a menu. */
  caret: <path fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" d="M8 10.2h8l-4 4.6z" />,
  bell: (
    <path
      fill="currentColor"
      d="M12 2.5A1.5 1.5 0 0 1 13.5 4v.6A6 6 0 0 1 18 10.4v4.1l1.6 2.3a.8.8 0 0 1-.66 1.2H5.06a.8.8 0 0 1-.66-1.2L6 14.5v-4.1a6 6 0 0 1 4.5-5.8V4A1.5 1.5 0 0 1 12 2.5zM9.8 19.4h4.4a2.2 2.2 0 0 1-4.4 0z"
    />
  ),
  gear: (
    <path
      fill="currentColor"
      fillRule="evenodd"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinejoin="round"
      d="M10.14 5.05 10.42 2.53h3.16l.28 2.52 1.74.71 1.97-1.58 2.25 2.25-1.58 1.97.71 1.74 2.52.28v3.16l-2.52.28-.71 1.74 1.58 1.97-2.25 2.25-1.97-1.58-1.74.71-.28 2.52h-3.16l-.28-2.52-1.74-.71-1.97 1.58-2.25-2.25 1.58-1.97-.71-1.74-2.52-.28v-3.16l2.52-.28.71-1.74-1.58-1.97 2.25-2.25L8.4 5.76zM12 8.9a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 1 0 0-6.2z"
    />
  ),
  plus: <path {...STROKE} strokeLinecap="butt" strokeWidth="2" d="M12 3v18M3 12h18" />,
  /** The burst in front of the model's name. */
  spark: (
    <path
      {...STROKE}
      strokeWidth="1.9"
      d="M12 9.7V2.8M13.63 10.37l3.74-3.74M14.3 12h6.9M13.63 13.63l3.74 3.74M12 14.3v6.9M10.37 13.63l-3.74 3.74M9.7 12H2.8M10.37 10.37 6.63 6.63"
    />
  ),
  chevronDown: <path {...STROKE} strokeWidth="2.4" d="m6 9.5 6 5.5 6-5.5" />,
  chevronRight: <path {...STROKE} strokeWidth="2.2" d="m9.5 6 6 6-6 6" />,
  arrowUp: <path {...STROKE} strokeWidth="2.2" d="M12 20V5M5.5 11.5 12 5l6.5 6.5" />,
  chat: (
    <path
      fill="currentColor"
      d="M5.5 4h13A2.5 2.5 0 0 1 21 6.5v8a2.5 2.5 0 0 1-2.5 2.5H8l-3.6 3.3A.85.85 0 0 1 3 19.7V6.5A2.5 2.5 0 0 1 5.5 4z"
    />
  ),
  /** A clipboard with a tick: the tasks, and a task in progress. */
  tasks: (
    <path
      fill="currentColor"
      d="M6.2 4.2h11.6A2.2 2.2 0 0 1 20 6.4v12.9a2.2 2.2 0 0 1-2.2 2.2H6.2A2.2 2.2 0 0 1 4 19.3V6.4a2.2 2.2 0 0 1 2.2-2.2zM10 2h4a1.4 1.4 0 0 1 1.4 1.4V5A1.4 1.4 0 0 1 14 6.4h-4A1.4 1.4 0 0 1 8.6 5V3.4A1.4 1.4 0 0 1 10 2zM7.73 13.77l3.19 3.19 5.47-5.81-1.38-1.3-4.13 4.39-1.81-1.81z"
    />
  ),
  /** Three spines on a shelf. */
  library: (
    <g fill="currentColor">
      <rect x="3" y="3" width="5" height="18" rx="1.2" />
      <rect x="10" y="3" width="4" height="18" rx="1.2" />
      <rect x="16" y="3" width="5" height="18" rx="1.2" />
    </g>
  ),
  /** Two four-pointed stars: searching the library. */
  sparkles: (
    <path
      fill="currentColor"
      d="M10 5.5c.6 5.1 3.4 7.9 8.5 8.5-5.1.6-7.9 3.4-8.5 8.5-.6-5.1-3.4-7.9-8.5-8.5 5.1-.6 7.9-3.4 8.5-8.5zM18.5 1.5c.3 2.4 1.6 3.7 4 4-2.4.3-3.7 1.6-4 4-.3-2.4-1.6-3.7-4-4 2.4-.3 3.7-1.6 4-4z"
    />
  ),
  close: <path {...STROKE} strokeWidth="2.4" d="m6 6 12 12M18 6 6 18" />,
  download: <path {...STROKE} strokeWidth="2.2" d="M12 4v10.5M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />,
  /** An exclamation mark: something went wrong. */
  alert: <path {...STROKE} strokeWidth="2.8" d="M12 5.5v8M12 18.3v.2" />,
} as const satisfies Record<string, ReactNode>

export type IconName = keyof typeof SHAPES

export interface IconProps {
  name: IconName
  /** Width and height in the pixels of the reference screens; 24 when left out. */
  size?: number
}

/** A decorative icon. Whatever it stands for has to be said by the control it sits in. */
export function Icon({ name, size }: IconProps) {
  const style = size === undefined ? undefined : ({ '--icon': size } as CSSProperties)
  return (
    <svg className="icon" style={style} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {SHAPES[name]}
    </svg>
  )
}
