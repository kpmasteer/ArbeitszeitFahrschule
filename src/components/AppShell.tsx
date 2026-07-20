import {
  BarChart3,
  CalendarDays,
  CalendarSync,
  Home,
  Plus,
  Settings,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Logo } from './Logo'

export type AppPage = 'home' | 'calendar' | 'capture' | 'insights' | 'sync' | 'settings'

interface AppShellProps {
  readonly page: AppPage
  readonly onNavigate: (page: AppPage) => void
  readonly children: ReactNode
  readonly syncCount: number
}

const primaryNav = [
  { id: 'home' as const, label: 'Start', icon: Home },
  { id: 'calendar' as const, label: 'Kalender', icon: CalendarDays },
  { id: 'capture' as const, label: 'Erfassen', icon: Plus },
  { id: 'insights' as const, label: 'Auswertung', icon: BarChart3 },
  { id: 'sync' as const, label: 'Kalender-Sync', shortLabel: 'Sync', icon: CalendarSync },
]

export function AppShell({ page, onNavigate, children, syncCount }: AppShellProps) {
  return (
    <div className="app-frame">
      <aside className="sidebar" aria-label="Hauptnavigation">
        <button className="sidebar__brand" onClick={() => onNavigate('home')} aria-label="Zur Startseite">
          <Logo inverse />
        </button>
        <nav className="sidebar__nav">
          {primaryNav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`sidebar__item ${page === id ? 'is-active' : ''}`}
              onClick={() => onNavigate(id)}
              aria-current={page === id ? 'page' : undefined}
            >
              <span className="sidebar__icon-wrap">
                <Icon size={20} strokeWidth={1.8} />
                {id === 'sync' && syncCount > 0 && <span className="nav-badge">{syncCount}</span>}
              </span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar__footer">
          <button
            className={`sidebar__item ${page === 'settings' ? 'is-active' : ''}`}
            onClick={() => onNavigate('settings')}
            aria-current={page === 'settings' ? 'page' : undefined}
          >
            <Settings size={20} strokeWidth={1.8} />
            <span>Einstellungen</span>
          </button>
          <div className="sidebar__local-note">
            <span className="status-dot" />
            <span>Alles lokal gespeichert</span>
          </div>
        </div>
      </aside>

      <div className="mobile-topbar">
        <button className="plain-button" onClick={() => onNavigate('home')} aria-label="Zur Startseite">
          <Logo />
        </button>
        <button className="icon-button" onClick={() => onNavigate('settings')} aria-label="Einstellungen öffnen">
          <Settings size={21} />
        </button>
      </div>

      <main className="app-main" id="main-content">
        {children}
      </main>

      <nav className="bottom-nav" aria-label="Hauptnavigation">
        {primaryNav.map(({ id, label, shortLabel, icon: Icon }) => {
          const isCapture = id === 'capture'
          return (
            <button
              key={id}
              className={`bottom-nav__item ${page === id ? 'is-active' : ''} ${isCapture ? 'bottom-nav__item--capture' : ''}`}
              onClick={() => onNavigate(id)}
              aria-current={page === id ? 'page' : undefined}
              aria-label={label}
            >
              <span className="bottom-nav__icon-wrap">
                <Icon size={isCapture ? 27 : 21} strokeWidth={isCapture ? 2.3 : 1.8} />
                {id === 'sync' && syncCount > 0 && <span className="nav-badge">{syncCount}</span>}
              </span>
              <span>{shortLabel ?? label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
