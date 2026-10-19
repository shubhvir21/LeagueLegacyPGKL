import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLeague } from '../lib/data'

export function Avatar({ id, size = 24 }: { id: string; size?: number }) {
  const m = useLeague().memberById[id]
  const initials = (m?.name ?? '?').slice(0, 2).toUpperCase()
  return m?.avatar ? (
    <img className="avatar" style={{ width: size, height: size }} src={`https://sleepercdn.com/avatars/thumbs/${m.avatar}`} alt="" />
  ) : (
    <span className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.4 }}>{initials}</span>
  )
}

export function MemberLink({ id, avatar = true }: { id: string | null; avatar?: boolean }) {
  const lg = useLeague()
  if (!id) return <span className="muted">—</span>
  return (
    <Link to={`/member/${id}`} className="member-link">
      {avatar && <Avatar id={id} />}
      <span>{lg.memberById[id]?.name ?? 'Unknown'}</span>
    </Link>
  )
}

export function Card({ title, sub, children, right }: { title: string; sub?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h2>{title}</h2>
          {sub && <p className="muted">{sub}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  )
}

export function Stat({ label, value, icon, tip }: { label: string; value: ReactNode; icon?: string; tip?: string }) {
  return (
    <div className="stat">
      {icon && <span className="stat-icon">{icon}</span>}
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}{tip && <Tip text={tip} />}</div>
    </div>
  )
}

export function Tip({ text }: { text: string }) {
  return <span className="tip" title={text}>ⓘ</span>
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: readonly T[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t} className={t === value ? 'tab active' : 'tab'} onClick={() => onChange(t)}>{t}</button>
      ))}
    </div>
  )
}

export interface Col<R> {
  key: string
  label: ReactNode
  render: (r: R, i: number) => ReactNode
  sort?: (r: R) => number | string
  tip?: string
  align?: 'left' | 'right' | 'center'
}

export function Table<R>({ rows, cols, initialSort, rowKey }: { rows: R[]; cols: Col<R>[]; initialSort?: string; rowKey: (r: R) => string }) {
  const [sortKey, setSortKey] = useState(initialSort)
  const [desc, setDesc] = useState(true)
  const col = cols.find((c) => c.key === sortKey)
  const sorted = col?.sort
    ? [...rows].sort((a, b) => {
        const x = col.sort!(a), y = col.sort!(b)
        const c = x < y ? -1 : x > y ? 1 : 0
        return desc ? -c : c
      })
    : rows
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                className={`${c.sort ? 'sortable' : ''} ${c.align ?? ''}`}
                onClick={() => {
                  if (!c.sort) return
                  if (sortKey === c.key) setDesc(!desc)
                  else { setSortKey(c.key); setDesc(true) }
                }}
              >
                {c.label}{c.tip && <Tip text={c.tip} />}
                {sortKey === c.key && <span className="sort-arrow">{desc ? '▼' : '▲'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={rowKey(r)}>
              {cols.map((c) => <td key={c.key} className={c.align ?? ''}>{c.render(r, i)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Trophies({ gold, silver, bronze }: { gold: number; silver: number; bronze: number }) {
  return (
    <span className="trophies">
      {gold > 0 && <span title="Championships">🏆×{gold}</span>}
      {silver > 0 && <span title="Runner-up">🥈×{silver}</span>}
      {bronze > 0 && <span title="Third place">🥉×{bronze}</span>}
    </span>
  )
}

export function RankBadge({ rank, n }: { rank: number | null; n: number }) {
  if (rank == null) return <span className="muted">—</span>
  const cls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : rank === n ? 'last' : ''
  return <span className={`rank ${cls}`}>{rank}</span>
}

export const TIPS = {
  allPlay: 'Your record if you played every other team every week.',
  luck: 'Actual head-to-head wins minus expected wins from all-play. Positive = lucky.',
  sos: 'Strength of schedule: average points scored by your opponents per game.',
  share: "Your share of all regular-season points scored in the league.",
  elo: 'Elo rating across every game (start 1500, K=32). Higher = stronger historically.',
  score: 'Season score (0–100): 30% win %, 30% all-play %, 20% points share, 20% final finish.',
  coach: 'Points scored ÷ max possible points from your roster (optimal lineups).',
  median: 'This league plays the median every week: beating the median is a win.',
}
