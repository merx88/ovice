// The single source of truth for colors. Values were sampled from the
// reference renders; every other file imports from here.
export const tokens = {
  bg: '#F4F4F6',
  floor: '#DCDCDC',
  orange: '#F5570A',
  black: '#1A1919',
  cream: '#F6E8E0',
  chrome: '#D3D1D6',
  yellow: '#F9B605',
  skyblue: '#90A6C1',
  mint: '#54DABF',
  pink: '#F7D9D7',
  white: '#FFFFFF',
  danger: '#E5393B',
  // The status badge while the agent is working.
  badgeYellow: '#D8C168',
  // Small props in the office scene (books, plants, laptop).
  plantGreen: '#5F8A2B',
  bookOlive: '#A5AD82',
  bookRed: '#FB5E45',
  bookBlue: '#4F80CB',
  navy: '#263768',
  laptopGray: '#B5B4B6',

  // --- The 2D interface, sampled from the reference screens (1728 px wide) ---
  // The progress pill and the pin of the office pill (ref 1).
  uiOrange: '#FF7647',
  // Dark surfaces: office pill, bell, dock, prompt panel (ref 2). It is what 80 % black looks like over the wall.
  uiDark: '#323232',
  // The logo, the active tab, the outline of the prompt panel, icons on white discs (ref 2).
  uiBlack: '#000000',
  // The round buttons of the dock (ref 2).
  uiButton: '#474747',
  // The face of the send button (ref 2).
  uiSend: '#5B5B5B',
  // The face of the model chip and the caret disc of the office pill (ref 2); muted text on white.
  uiGrey: '#707070',
  // The prompt field and the ring of the send button (ref 2).
  uiField: '#999999',
  // The outline of the model chip (ref 2).
  uiChipEdge: '#C6C6C6',
  // The ring round whatever has the keyboard's focus: a blue that shows on the pale page and on the dark surfaces.
  uiFocus: '#0E8BF3',
  // The search pill of the library panel (ref 2); hairlines and muted text on dark surfaces.
  uiSilver: '#D6D6D6',
  // The speech bubble, shaded from its top edge to its bottom edge (refs 1 and 3).
  bubbleTop: '#F0EFF4',
  bubbleBottom: '#F7F6F9',
} as const
