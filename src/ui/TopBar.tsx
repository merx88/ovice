import { Icon } from './Icon'
import { showComingSoon } from './toast'
import './ui.css'

const TABS = ['Office', 'Agents', 'Projects'] as const
/** The one page that exists. */
const CURRENT_TAB: (typeof TABS)[number] = 'Office'
const OFFICE_NAME = "Researcher's office"

export interface TopBarProps {
  /** Called when the gear is pressed. */
  onOpenSettings(): void
}

/** The "o" mark: a ring around a heavy letter o. */
function Logo() {
  return (
    <svg className="logo" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M32 0a32 32 0 1 0 0 64a32 32 0 1 0 0-64zM32 7a25 25 0 1 1 0 50a25 25 0 1 1 0-50zM32 18.5a15 13.5 0 1 0 0 27a15 13.5 0 1 0 0-27zM32 25a4 7 0 1 1 0 14a4 7 0 1 1 0-14z"
      />
    </svg>
  )
}

/** The bar along the top: logo, the three tabs, and the office, notifications and settings buttons. */
export function TopBar({ onOpenSettings }: TopBarProps) {
  return (
    <header className="topbar">
      <Logo />
      <nav className="tabs" aria-label="주요 메뉴">
        {TABS.map((tab) =>
          tab === CURRENT_TAB ? (
            <button key={tab} type="button" className="tab" aria-current="page">
              {tab}
            </button>
          ) : (
            <button key={tab} type="button" className="tab" onClick={showComingSoon}>
              {tab}
            </button>
          ),
        )}
      </nav>
      <div className="topbar__end">
        <button type="button" className="office" onClick={showComingSoon}>
          <span className="office__pin">
            <Icon name="pin" size={31} />
          </span>
          <span className="office__name">{OFFICE_NAME}</span>
          <span className="sr-only"> 오피스 선택</span>
          <span className="office__caret">
            <Icon name="caret" size={20} />
          </span>
        </button>
        <button type="button" className="round" aria-label="알림" onClick={showComingSoon}>
          <Icon name="bell" size={27} />
        </button>
        <button type="button" className="round" aria-label="설정" aria-haspopup="dialog" onClick={onOpenSettings}>
          <Icon name="gear" size={27} />
        </button>
      </div>
    </header>
  )
}
