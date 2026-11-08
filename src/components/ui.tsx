import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { Icon } from './Icon'

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

/** Team name for a season with the manager's username underneath (just one line if they match). */
export function TeamName({ id, season }: { id: string; season?: number }) {
  const lg = useLeague()
  const s = season == null ? lg.seasons[0] : lg.seasons.find((x) => x.year === season)
  const team = s?.teamSeasons.find((t) => t.memberId === id)?.teamName?.trim()
  const user = lg.memberById[id]?.name ?? 'Unknown'
  return (
    <span className="team-name">
      <b>{team || user}</b>
      {team && team.toLowerCase() !== user.toLowerCase() && <small>{user}</small>}
    </span>
  )
}

export function Card({ title, sub, children, right }: { title: ReactNode; sub?: string; children: ReactNode; right?: ReactNode }) {
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

/** `icon` is an Icon name; legacy emoji values are ignored so tiles stay clean. */
export function Stat({ label, value, icon, tip, tone }: { label: string; value: ReactNode; icon?: string; tip?: string; tone?: 'pos' | 'neg' | 'accent' }) {
  const isIcon = !!icon && /^[a-zA-Z]+$/.test(icon)
  return (
    <div className={`stat ${tone ?? ''}`}>
      <div className="stat-label">
        {isIcon && <Icon name={icon!} size={14} />}
        <span>{label}</span>
        {tip && <Tip text={tip} />}
      </div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

/** Info icon that shows a definition bubble on hover, focus or tap. The bubble is rendered on
 *  document.body so tables and cards that clip their overflow can't hide it. */
export function Tip({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; top: number; bottom: number; below: boolean | null } | null>(null)
  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom, below: null })
  }
  // Once the bubble's height is known, open it on whichever side it fits (above preferred).
  useLayoutEffect(() => {
    if (!pos || pos.below != null || !bubble.current) return
    const h = bubble.current.scrollHeight
    const fitsAbove = pos.top - 8 - h >= 8
    setPos({ ...pos, below: !fitsAbove && window.innerHeight - pos.bottom > pos.top })
  }, [pos])
  const hide = () => setPos(null)
  useEffect(() => {
    if (!pos) return
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) hide() }
    window.addEventListener('scroll', hide, true)
    window.addEventListener('pointerdown', close)
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('pointerdown', close) }
  }, [pos])
  const W = Math.min(text.length > 240 ? 400 : 280, window.innerWidth - 24) // long definitions get a wider, shorter bubble
  return (
    <span
      ref={ref} className={`tip ${pos ? 'open' : ''}`} tabIndex={0} role="button" aria-label={text}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      onClick={(e) => { e.stopPropagation(); if (pos) hide(); else show() }}
    >
      <Icon name="info" size={13} />
      {pos && createPortal(
        <div
          ref={bubble} className="tip-bubble" role="tooltip"
          style={{
            width: W, left: Math.max(12, Math.min(window.innerWidth - W - 12, pos.x - W / 2)),
            visibility: pos.below == null ? 'hidden' : 'visible',
            ...(pos.below ? { top: pos.bottom + 8, maxHeight: window.innerHeight - pos.bottom - 20 } : { bottom: window.innerHeight - pos.top + 8, maxHeight: pos.top - 20 }),
          }}
        >{text}</div>,
        document.body,
      )}
    </span>
  )
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

const STICKY_KEYS = new Set(['m', 'p', 'member', 'team', 'player', 'name'])

export function Table<R>({ rows, cols, initialSort, initialAsc = false, rowKey }: { rows: R[]; cols: Col<R>[]; initialSort?: string; initialAsc?: boolean; rowKey: (r: R) => string }) {
  const [sortKey, setSortKey] = useState(initialSort)
  const [desc, setDesc] = useState(!initialAsc)
  const col = cols.find((c) => c.key === sortKey)
  const sorted = col?.sort
    ? [...rows].sort((a, b) => {
        const x = col.sort!(a), y = col.sort!(b)
        const c = x < y ? -1 : x > y ? 1 : 0
        return desc ? -c : c
      })
    : rows
  // On phones the name column (team / player) stays pinned while the rest scrolls.
  const stickyKey = (cols.find((c) => STICKY_KEYS.has(c.key)) ?? cols[0])?.key
  const cls = (c: Col<R>) => `${c.align ?? ''} ${c.key === stickyKey ? 'sticky-col' : ''}`
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                className={`${c.sort ? 'sortable' : ''} ${cls(c)}`}
                onClick={() => {
                  if (!c.sort) return
                  if (sortKey === c.key) setDesc(!desc)
                  else { setSortKey(c.key); setDesc(true) }
                }}
              >
                <span className="th-inner">
                  {c.label}{c.tip && <Tip text={c.tip} />}
                  {sortKey === c.key && <span className="sort-arrow">{desc ? '↓' : '↑'}</span>}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={rowKey(r)}>
              {cols.map((c) => <td key={c.key} className={cls(c)}>{c.render(r, i)}</td>)}
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
      {gold > 0 && <span className="trophy gold" title="Championships"><Icon name="trophy" size={13} />{gold}</span>}
      {silver > 0 && <span className="trophy silver" title="Runner-up"><Icon name="medal" size={13} />{silver}</span>}
      {bronze > 0 && <span className="trophy bronze" title="Third place"><Icon name="medal" size={13} />{bronze}</span>}
    </span>
  )
}

/** `final` = medal colors; in-progress standings use plain chips. */
export function RankBadge({ rank, n, final = true }: { rank: number | null; n: number; final?: boolean }) {
  if (rank == null) return <span className="muted">—</span>
  const cls = !final ? '' : rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : rank === n ? 'last' : ''
  return <span className={`rank ${cls}`}>{rank}</span>
}

export const TIPS = {
  allPlay: 'Your record if you played every other team every week.',
  luck: 'Actual head-to-head wins minus expected wins from all-play. Positive = lucky.',
  sos: 'Strength of schedule: average points scored by your opponents per game.',
  share: "Your share of all regular-season points scored in the league.",
  elo: 'Elo (0–5000, everyone starts at 2000). Every regular-season game moves 12–35 points from loser to winner by margin (capped at a 60-point win); median games ±10. After the regular season, all-play record and points-for rank each pay +100/+75/+50/+25/0/0/−25/−50/−75/−100. Final finish pays out mirrored, credited week by week as the playoff bracket resolves: 1st +400 / 10th −400, 2nd +250 / 9th −250, 3rd +150 / 8th −150, 4th +100 / 7th −100, 5th +50 / 6th −50. Ratings regress 10% toward 2000 each offseason, or 50% when a franchise gets a new manager (the difference is spread across the other teams).',
  score: 'Season score (0–100), the same score as Team Rankings: Dominance 40% (PPG and margin incl. playoffs, all-play %), Finish 25% (1st 100, 2nd 80, 3rd 65 … last 0), Regular Season 20% (seed, win %), Consistency 15% (weekly floor, median-beat rate). Graded within each season, where 70 = average. Completed seasons only.',
  coach: 'Points scored ÷ max possible points from your roster (optimal lineups).',
  median: 'This league plays the median every week: beating the median is a win.',
}
