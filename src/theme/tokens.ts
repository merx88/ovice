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
  folderBlue: '#0E8BF3',
  mint: '#54DABF',
  pink: '#F7D9D7',
  white: '#FFFFFF',
  danger: '#E5393B',
  // Small props in the office scene (books, plants, laptop).
  plantGreen: '#5F8A2B',
  bookOlive: '#A5AD82',
  bookRed: '#FB5E45',
  bookBlue: '#4F80CB',
  navy: '#263768',
  laptopGray: '#B5B4B6',
} as const
