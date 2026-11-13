import type { ReactNode } from 'react'
import { tokens } from '../theme/tokens'
import { Icon } from './Icon'
import { showComingSoon } from './toast'
import './dock.css'

/** The id of the panel, for the button that opens it. */
export const LIBRARY_PANEL_ID = 'library-panel'

const ROUND = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/**
 * The nine example tiles: small drawings on a 90 × 90 grid, in the colours of
 * the office. They stand for library content that does not exist yet.
 */
const TILES: { name: string; art: ReactNode }[] = [
  {
    name: '예시: 사이드 테이블',
    art: (
      <>
        <rect width="90" height="90" fill={tokens.laptopGray} />
        <path {...ROUND} stroke={tokens.black} strokeWidth="13" d="M63 25H35a9 9 0 0 0-9 9v22a9 9 0 0 0 9 9h28" />
        <path {...ROUND} stroke={tokens.uiGrey} strokeWidth="2" d="M61 22H37" />
      </>
    ),
  },
  {
    name: '예시: 노란 램프',
    art: (
      <>
        <rect width="90" height="90" fill={tokens.bg} />
        <ellipse cx="45" cy="76" rx="15" ry="6" fill={tokens.yellow} />
        <rect x="37.5" y="34" width="15" height="42" rx="7.5" fill={tokens.yellow} />
        <circle cx="45" cy="21" r="11" fill={tokens.yellow} />
        <circle cx="45" cy="21" r="6.5" fill={tokens.white} />
      </>
    ),
  },
  {
    name: '예시: 웃는 얼굴',
    art: (
      <>
        <rect width="90" height="90" fill={tokens.white} />
        <circle cx="45" cy="45" r="28" fill="none" stroke={tokens.bookBlue} strokeWidth="9" />
        <path {...ROUND} stroke={tokens.bookBlue} strokeWidth="5" d="M38 33v12M52 33v12M32 53q13 13 26 0" />
      </>
    ),
  },
  {
    name: '예시: 클립',
    art: (
      <>
        <rect width="90" height="90" fill={tokens.white} />
        <path
          {...ROUND}
          stroke={tokens.laptopGray}
          strokeWidth="7"
          d="M52 46H40a5 5 0 0 1 0-10h13a11 11 0 0 1 0 22H38a17 17 0 0 1 0-34h16a22 22 0 0 1 18 9"
        />
        <path
          {...ROUND}
          stroke={tokens.white}
          strokeWidth="1.6"
          d="M52 45H40a4 4 0 0 1 0-8h13a10 10 0 0 1 0 20H38a16 16 0 0 1 0-32h16"
        />
      </>
    ),
  },
  {
    name: '예시: 색면 구성',
    art: (
      <>
        <rect width="90" height="90" fill={tokens.cream} />
        <rect x="33" y="12" width="13" height="38" fill={tokens.yellow} />
        <rect x="33" y="37" width="25" height="13" fill={tokens.yellow} />
        <rect x="46" y="25" width="26" height="13" fill={tokens.bookRed} />
        <rect x="58" y="38" width="14" height="24" fill={tokens.black} />
        <rect x="46" y="50" width="12" height="12" fill={tokens.bookRed} />
        <rect x="46" y="62" width="12" height="12" fill={tokens.black} />
        <rect x="20" y="62" width="13" height="12" fill={tokens.bookBlue} />
        <circle cx="53" cy="17" r="6.5" fill={tokens.bookBlue} />
        <circle cx="26" cy="32" r="6.5" fill={tokens.bookRed} />
        <circle cx="40" cy="68" r="6.5" fill={tokens.bookRed} />
      </>
    ),
  },
  {
    name: '예시: 튜브 의자',
    art: (
      <>
        <rect width="90" height="90" fill={tokens.bookOlive} />
        <path {...ROUND} stroke={tokens.cream} strokeWidth="3" d="M0 14h46M0 26h40M0 38h30" opacity="0.5" />
        <path {...ROUND} stroke={tokens.plantGreen} strokeWidth="15" d="M66 96V46a14 14 0 0 1 28 0" />
        <path {...ROUND} stroke={tokens.plantGreen} strokeWidth="15" d="M32 96V62a12 12 0 0 1 12-12h50" />
      </>
    ),
  },
  {
    name: '예시: 과녁 의자',
    art: (
      <>
        <rect width="90" height="90" fill={tokens.white} />
        <path {...ROUND} stroke={tokens.orange} strokeWidth="6" d="M31 52v30M59 52v30M34 40l-2 10M56 40l2 10" />
        <rect x="24" y="47" width="42" height="9" rx="4.5" fill={tokens.orange} />
        <circle cx="45" cy="26" r="14" fill="none" stroke={tokens.orange} strokeWidth="8" />
        <circle cx="45" cy="26" r="4" fill={tokens.orange} />
      </>
    ),
  },
  {
    name: '예시: 흰 건물',
    art: (
      <>
        <rect width="90" height="90" fill={tokens.bookBlue} />
        <circle cx="76" cy="14" r="9" fill={tokens.white} opacity="0.55" />
        <circle cx="64" cy="10" r="6" fill={tokens.white} opacity="0.55" />
        <path fill={tokens.white} d="M12 10 50 4v86H12z" />
        <path fill={tokens.bg} d="M56 54l28-9v45H56z" />
        <path fill={tokens.navy} d="M36 26h12v4H36zM38 47h10v4H38zM34 68h14v4H34zM62 60h8v3h-8zM62 70h8v3h-8zM74 64h6v3h-6z" />
      </>
    ),
  },
  {
    name: '예시: 세워 둔 노트북',
    art: (
      <>
        <rect width="90" height="90" fill={tokens.skyblue} />
        <rect y="56" width="90" height="34" fill={tokens.cream} />
        <path fill={tokens.laptopGray} d="M41 12l7 2-26 72-9-4z" />
        <path fill={tokens.chrome} d="M45 12h7l27 70-9 4z" />
        <path {...ROUND} stroke={tokens.navy} strokeWidth="2" d="M30 60l-3 9M34 49l-2 5" />
      </>
    ),
  },
]

/** The panel above the dock with example tiles and a search pill. Nothing in it does anything yet. */
export function LibraryPanel() {
  return (
    <section id={LIBRARY_PANEL_ID} className="panel panel--library" aria-label="라이브러리" tabIndex={-1}>
      <div className="tiles">
        {TILES.map(({ name, art }) => (
          <button key={name} type="button" className="tile" aria-label={name} onClick={showComingSoon}>
            <svg viewBox="0 0 90 90" aria-hidden="true" focusable="false">
              {art}
            </svg>
          </button>
        ))}
      </div>
      {/* A button, not a field: there is nothing to search, and a field that takes text would suggest there is. */}
      <button type="button" className="search" onClick={showComingSoon}>
        <span className="search__disc">
          <Icon name="sparkles" size={26} />
        </span>
        Search library
      </button>
    </section>
  )
}
