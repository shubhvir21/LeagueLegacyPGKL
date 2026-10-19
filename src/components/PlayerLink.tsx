import { Link } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { playersOf } from '../lib/players'

export function PlayerLink({ id, showPos = true }: { id: string; showPos?: boolean }) {
  const m = playersOf(useLeague())
  const p = m.info[id]
  return (
    <Link to={`/player/${id}`} className="player-link">
      {showPos && <span className={`pos-tag ${p?.pos ?? ''}`}>{p?.pos ?? '?'}</span>}
      <span>{p?.name ?? id}</span>
    </Link>
  )
}

export function PosFilter({ value, onChange }: { value: string; onChange: (p: string) => void }) {
  return (
    <div className="week-pills">
      {['ALL', 'QB', 'RB', 'WR', 'TE', 'DEF'].map((p) => (
        <button key={p} className={p === value ? 'pill-btn active' : 'pill-btn'} onClick={() => onChange(p)}>{p === 'ALL' ? 'All' : p}</button>
      ))}
    </div>
  )
}
