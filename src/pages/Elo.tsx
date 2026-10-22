// Franchise Elo: full-size rating chart, per-season view, and how the rating is calculated.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLeague } from '../lib/data'
import { Avatar, Card, Tip, TIPS } from '../components/ui'
import { ELO, FINISH, REG_BONUS, franchiseElo, tierOf, TIERS } from '../lib/elo'
import { PALETTE } from './History'

export default function Elo() {
  const lg = useLeague()
  const e = franchiseElo(lg)
  const ids = Object.entries(e.current).sort((a, b) => b[1] - a[1]).map(([id]) => id)
  const years = [...new Set(Object.values(e.history).flat().map((p) => p.season))].sort((a, b) => b - a)
  const [season, setSeason] = useState<'all' | number>('all')
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  const [drag, setDrag] = useState<[number, number] | null>(null) // indices into the visible data
  const [focus, setFocus] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setFocus((f) => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const keys = [...new Set(Object.values(e.history).flat().filter((p) => season === 'all' || p.season === season).map((p) => p.season * 100 + p.week))].sort((a, b) => a - b)
  const data = keys.map((k) => {
    const yr = Math.floor(k / 100), week = k % 100
    const key = season === 'all' ? (week === 0 ? `${yr}` : `${String(yr).slice(2)} W${week}`) : week === 0 ? 'Start' : `W${week}`
    const row: Record<string, number | string | null> = { key }
    for (const id of ids) row[id] = e.history[id]?.find((p) => p.season === yr && p.week === week)?.rating ?? null
    return row
  })
  const view = zoom ? data.slice(zoom[0], zoom[1] + 1) : data
  const starts = season === 'all' ? view.filter((d) => !String(d.key).includes('W')).map((d) => d.key as string) : []
  const playoffStart = season === 'all' ? null : lg.seasons.find((s) => s.year === season)?.playoffStart
  // The y-axis fits whatever is on screen: the zoomed range, and only highlighted teams if any.
  const vals = view.flatMap((d) => ids.filter((id) => !focus.size || focus.has(id)).map((id) => d[id])).filter((v): v is number => typeof v === 'number')
  const span = Math.max(...vals) - Math.min(...vals)
  const step = span > 2000 ? 500 : span > 800 ? 250 : span > 300 ? 100 : 50
  const lo = Math.floor((Math.min(...vals) - 25) / step) * step, hi = Math.ceil((Math.max(...vals) + 25) / step) * step
  const yTicks = Array.from({ length: (hi - lo) / step + 1 }, (_, i) => lo + i * step)
  const shown = (id: string) => !focus.size || focus.has(id)
  const at = (st: { activeTooltipIndex?: unknown } | null | undefined) => {
    const i = Number(st?.activeTooltipIndex)
    return Number.isFinite(i) ? i : null
  }
  const endDrag = (end: number | null) => {
    if (drag) {
      const [a, b] = [drag[0], end ?? drag[1]].sort((x, y) => x - y)
      const off = zoom?.[0] ?? 0
      if (b - a >= 2) setZoom([off + a, off + b])
    }
    setDrag(null)
  }

  return (
    <div className="page">
      <h1>Elo Ratings</h1>
      <Card
        title="Rating History"
        sub="Click teams to highlight them; drag across the chart to zoom in. Dashed lines mark the tiers."
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {zoom && <button type="button" className="elo-chip" onClick={() => setZoom(null)} style={{ cursor: 'pointer' }}>Reset zoom</button>}
            <select value={season} onChange={(ev) => { setSeason(ev.target.value === 'all' ? 'all' : Number(ev.target.value)); setZoom(null) }}>
              <option value="all">All-time</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <Tip text={TIPS.elo} />
          </div>
        }
      >
        <div className="elo-chips">
          {ids.map((id, i) => (
            <button key={id} type="button" onClick={() => toggle(id)} className="elo-chip" style={{ opacity: shown(id) ? 1 : 0.45, borderColor: focus.has(id) ? PALETTE[i % PALETTE.length] : undefined, cursor: 'pointer' }}>
              <span className="muted">{i + 1}</span><Avatar id={id} size={18} /><span>{lg.memberById[id]?.name}</span>
              <b>{e.current[id]}</b><span className={`tier-tag ${tierOf(e.current[id]).toLowerCase()}`}>{tierOf(e.current[id])}</span>
            </button>
          ))}
          {focus.size > 0 && <button type="button" className="elo-chip" onClick={() => setFocus(new Set())} style={{ cursor: 'pointer' }}>Show all</button>}
        </div>
        <ResponsiveContainer width="100%" height={620}>
          <LineChart
            key={String(season)} data={view} margin={{ top: 10, right: 20, bottom: 0, left: 0 }} style={{ userSelect: 'none', cursor: 'crosshair' }}
            onMouseDown={(st) => { const i = at(st); if (i != null) setDrag([i, i]) }}
            onMouseMove={(st) => { const i = at(st); if (drag && i != null) setDrag([drag[0], i]) }}
            onMouseUp={(st) => endDrag(at(st))}
            onMouseLeave={() => setDrag(null)}
          >
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="key" stroke="var(--muted)" ticks={season === 'all' && starts.length > 1 ? starts : undefined} interval={season === 'all' && starts.length > 1 ? 0 : 'preserveStartEnd'} />
            <YAxis stroke="var(--muted)" domain={[lo, hi]} ticks={yTicks} allowDecimals={false} width={48} />
            {starts.map((s) => <ReferenceLine key={s} x={s} stroke="var(--border-strong)" />)}
            {playoffStart && <ReferenceLine x={`W${playoffStart}`} stroke="var(--border-strong)" label={{ value: 'Playoffs', position: 'insideTopRight', fill: 'var(--muted)', fontSize: 10 }} />}
            {TIERS.filter((t) => t.min > 0).map((t) => <ReferenceLine key={t.name} y={t.min} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: t.name, position: 'insideTopLeft', fill: 'var(--muted)', fontSize: 10 }} />)}
            <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)' }} itemSorter={(item) => -Number(item.value ?? 0)} />
            {ids.map((id, i) => (
              <Line key={id} dataKey={id} name={lg.memberById[id]?.name} stroke={PALETTE[i % PALETTE.length]} strokeWidth={focus.has(id) ? 3.5 : 2} strokeOpacity={shown(id) ? 1 : 0.12} dot={false} connectNulls isAnimationActive={false} />
            ))}
            {drag && drag[0] !== drag[1] && <ReferenceArea x1={String(view[drag[0]]?.key)} x2={String(view[drag[1]]?.key)} fill="var(--muted)" fillOpacity={0.15} />}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Peaks & Lows" sub="Each franchise's highest and lowest rating after any week.">
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Member</th><th style={{ textAlign: 'right' }}>Current</th><th>Tier</th><th style={{ textAlign: 'right' }}>Peak</th><th style={{ textAlign: 'right' }}>Low</th></tr></thead>
            <tbody>
              {ids.map((id, i) => (
                <tr key={id}>
                  <td>{i + 1}</td>
                  <td><Link to={`/member/${id}`} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Avatar id={id} size={18} />{lg.memberById[id]?.name}</Link></td>
                  <td style={{ textAlign: 'right' }}><b>{e.current[id]}</b></td>
                  <td><span className={`tier-tag ${tierOf(e.current[id]).toLowerCase()}`}>{tierOf(e.current[id])}</span></td>
                  <td style={{ textAlign: 'right' }}>{e.peak[id]?.rating} <span className="muted small">{e.peak[id] && `${e.peak[id].season} W${e.peak[id].week}`}</span></td>
                  <td style={{ textAlign: 'right' }}>{e.low[id]?.rating} <span className="muted small">{e.low[id] && `${e.low[id].season} W${e.low[id].week}`}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="How It's Calculated" sub="A zero-sum rating: every point one team gains, another loses, so the league average is always the starting rating.">
        <ul className="elo-rules">
          <li><b>Start:</b> everyone begins at {ELO.start}. Ratings stay within {ELO.min}–{ELO.max}, and each offseason they move {ELO.regress * 100}% back toward {ELO.start}.</li>
          <li><b>Regular-season games:</b> the winner takes {ELO.game[0]}–{ELO.game[1]} points from the loser, scaling with the margin up to a {ELO.marginCap}-point win. Opponent rating doesn't matter.</li>
          <li><b>Median games:</b> ±{ELO.median} for scoring above or below the weekly median.</li>
          <li><b>End of regular season:</b> all-play record rank and points-for rank each pay {bonusScale(REG_BONUS)}.</li>
          <li><b>Final finish:</b> {bonusScale(FINISH)}. Playoff games pay no margin points; instead the finish is credited week by week as the bracket narrows each team's possible places.</li>
          <li><b>Tiers:</b> {[...TIERS].map((t, i, a) => `${t.name} ${t.min ? (i ? `${t.min}–${a[i - 1].min - 1}` : `${t.min}+`) : `below ${a[i - 1].min}`}`).join(' · ')}.</li>
        </ul>
      </Card>
    </div>
  )
}

/** "+100 / +75 / … / −100" across a 10-team league, from the top-half amounts. */
function bonusScale(top: number[]) {
  const half = Array.from({ length: 5 }, (_, i) => top[i] ?? 0)
  return [...half, ...[...half].reverse().map((v) => -v)].map((v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0')).join(' / ')
}
