import { NavLink, Outlet } from 'react-router-dom'
import { useData } from '../lib/data'

const NAV = [
  { to: '/', label: 'History', icon: '📜', end: true },
  { to: '/seasons', label: 'Seasons', icon: '📅' },
  { to: '/members', label: 'Members', icon: '👥' },
  { to: '/versus', label: 'Versus', icon: '⚔️' },
  { to: '/matchups', label: 'Matchups', icon: '🏈' },
  { to: '/playoffs', label: 'Playoffs', icon: '🏆' },
  { to: '/records', label: 'Record Book', icon: '📖' },
]

export default function Layout() {
  const { league, error, syncing, resync } = useData()
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">PG</span>
          <div>
            <div className="brand-name">PGKL Legacy</div>
            <div className="brand-sub">{league?.seasons[0]?.name ?? 'Keeper League'}</div>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
              <span>{n.icon}</span> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sync">
          <button className="btn" onClick={resync} disabled={syncing}>{syncing ? 'Syncing…' : '↻ Resync'}</button>
          {league && <div className="muted small">Last synced {new Date(league.syncedAt).toLocaleString()}</div>}
        </div>
      </aside>
      <main className="content">
        {error && <div className="banner">{error}</div>}
        {league ? <Outlet /> : !error && <div className="muted">Loading league…</div>}
      </main>
    </div>
  )
}
