import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useData } from '../lib/data'
import { Icon } from './Icon'
import { SearchPalette } from './Search'

type NavItem = { to: string; label: string; icon: string; end?: boolean; also?: string }
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'League',
    items: [
      { to: '/', label: 'Home', icon: 'home', end: true },
      { to: '/history', label: 'History', icon: 'history' },
      { to: '/elo', label: 'Elo Ratings', icon: 'trendUp' },
      { to: '/seasons', label: 'Seasons', icon: 'calendar', also: '/season/' },
      { to: '/members', label: 'Members', icon: 'users', also: '/member/' },
      { to: '/rules', label: 'Rules', icon: 'scale' },
    ],
  },
  {
    group: 'Games',
    items: [
      { to: '/matchups', label: 'Matchups', icon: 'football', end: true },
      { to: '/playoffs', label: 'Playoffs', icon: 'trophy' },
      { to: '/versus', label: 'Versus', icon: 'swords' },
      { to: '/butterfly', label: 'Butterfly Effect', icon: 'zap' },
    ],
  },
  {
    group: 'Roster',
    items: [
      { to: '/frontoffice', label: 'Front Office', icon: 'swap' },
      { to: '/keepers', label: 'Keepers', icon: 'lock' },
      { to: '/draft', label: 'Draft History', icon: 'list' },
      { to: '/players', label: 'Players', icon: 'user', also: '/player/' },
    ],
  },
  {
    group: 'Legacy',
    items: [
      { to: '/alltime', label: 'All-Time Teams', icon: 'star' },
      { to: '/records', label: 'Record Book', icon: 'book' },
    ],
  },
]

const PAGES = NAV.flatMap((g) => g.items)

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h}h ago` : new Date(iso).toLocaleDateString()
}

export default function Layout() {
  const { league, error, syncing, resync } = useData()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setSearch(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const loc = useLocation()
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [loc.pathname])
  useEffect(() => { document.body.classList.toggle('no-scroll', open) }, [open])

  const brand = (
    <div className="brand">
      <span className="brand-mark">PGKL</span>
      <div className="brand-text">
        <div className="brand-name">League Dashboard</div>
        <div className="brand-sub">{league?.seasons[0]?.name ?? 'Keeper League'}</div>
      </div>
    </div>
  )

  return (
    <div className="shell">
      <header className="topbar">
        <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" size={20} /></button>
        {brand}
        <button className="icon-btn" onClick={() => setSearch(true)} aria-label="Search"><Icon name="search" size={18} /></button>
      </header>

      <div className={`scrim ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-head">
          {brand}
          <button className="icon-btn close" onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="x" size={20} /></button>
        </div>
        <button className="search-trigger" onClick={() => { setOpen(false); setSearch(true) }}>
          <Icon name="search" size={15} />
          <span>Search</span>
          <kbd>{/Mac/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <nav>
          {NAV.map((g) => (
            <div key={g.group} className="nav-group">
              <div className="nav-label">{g.group}</div>
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive || (n.also && loc.pathname.startsWith(n.also)) ? 'nav active' : 'nav')}>
                  <Icon name={n.icon} size={17} />
                  <span>{n.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sync">
          <button className="btn" onClick={resync} disabled={syncing}>
            <Icon name="refresh" size={15} className={syncing ? 'spin' : ''} />
            {syncing ? 'Syncing…' : 'Resync from Sleeper'}
          </button>
          {league && <div className="sync-meta"><span className="dot" /> Synced {ago(league.syncedAt)}</div>}
        </div>
      </aside>

      {league && <SearchPalette lg={league} pages={PAGES} open={search} onClose={() => setSearch(false)} />}
      <main className="content">
        {error && <div className="banner">{error}</div>}
        {league ? <Outlet /> : !error && <div className="loading"><span className="spinner" /> Loading league…</div>}
      </main>
    </div>
  )
}
