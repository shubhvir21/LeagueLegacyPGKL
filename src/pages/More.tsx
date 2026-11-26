import { NavLink } from 'react-router-dom'
import { useData } from '../lib/data'
import { Icon } from '../components/Icon'
import { MORE, ago } from '../components/Layout'

/** Phone-only "More" tab: every page that isn't pinned to the bottom tab bar. */
export default function More() {
  const { league, syncing, resync } = useData()
  return (
    <div className="page more-page">
      <h1>More</h1>
      {MORE.map((g) => (
        <section key={g.group} className="more-group">
          <div className="nav-label">{g.group}</div>
          <div className="more-grid">
            {g.items.map((n) => (
              <NavLink key={n.to} to={n.to} className="more-item">
                <Icon name={n.icon} size={20} />
                <span>{n.label}</span>
              </NavLink>
            ))}
          </div>
        </section>
      ))}
      <div className="more-sync">
        <button className="btn" onClick={resync} disabled={syncing}>
          <Icon name="refresh" size={15} className={syncing ? 'spin' : ''} />
          {syncing ? 'Syncing…' : 'Resync from Sleeper'}
        </button>
        {league && <div className="sync-meta"><span className="dot" /> Synced {ago(league.syncedAt)}</div>}
      </div>
    </div>
  )
}
