import { memo, useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, ReferenceLine, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLeague } from '../lib/data'
import { oddsHistory, playoffOdds, type OddsRun, type TeamOdds } from '../lib/odds'
import { fmt, record } from '../lib/stats'
import { Card, MemberLink, Stat, Table, Tabs, type Col } from '../components/ui'
import { PALETTE } from './History'

const METRICS = { Playoffs: 'playoff', Bye: 'bye', Title: 'title' } as const
type Metric = keyof typeof METRICS
const p = (x: number) => (x >= 0.9995 ? '100%' : x > 0 && x < 0.001 ? '<0.1%' : `${(x * 100).toFixed(1)}%`)
const heat = (x: number) => ({ background: `rgba(124, 140, 255, ${Math.min(0.85, x * 1.6)})`, color: x > 0.3 ? '#fff' : undefined })

const T = {
  rating: 'Projected points per week: this season’s average shrunk toward the league’s all-time average. Early in the year the league average dominates; it fades as weeks are played.',
  swing: 'Playoff odds if this team wins vs. loses its head-to-head game next week. The gap is how much the game matters.',
  model: 'Every simulation draws each team’s true scoring level (with uncertainty), plays the rest of the regular season including the median game, seeds by wins then points for, and plays the bracket.',
}

export default function Odds() {
  const lg = useLeague()
  const years = lg.seasons.map((s) => s.year)
  const [year, setYear] = useState(years[0])
  const [metric, setMetric] = useState<Metric>('Playoffs')
  const season = lg.seasons.find((s) => s.year === year)!
  const history = useMemo(() => oddsHistory(lg, year), [lg, year])
  const last = history.length - 1
  const [weekSel, setWeekSel] = useState<number | null>(null)
  const week = weekSel == null || weekSel > last ? last : weekSel
  // While dragging, show the cached per-week runs (instant); the full 10k run happens on release.
  const [dragging, setDragging] = useState(false)
  const full = useMemo(() => (dragging ? null : playoffOdds(lg, year, week)), [lg, year, week, dragging])
  const run = full ?? history[week]
  if (!run) return null
  const name = (id?: string) => (id ? lg.memberById[id]?.name ?? id : '—')

  const P = season.playoffTeams
  const favorite = [...run.teams].sort((a, b) => b.title - a.title)[0]
  const bubble = [...run.teams].sort((a, b) => Math.abs(a.playoff - 0.5) - Math.abs(b.playoff - 0.5))[0]
  const swing = [...run.teams].filter((t) => t.ifWin != null && t.ifLoss != null).sort((a, b) => (b.ifWin! - b.ifLoss!) - (a.ifWin! - a.ifLoss!))[0]
  const riser = history.length > 1 ? [...run.teams].map((t) => ({ t, d: t.playoff - (history[Math.max(0, week - 1)].teams.find((x) => x.memberId === t.memberId)?.playoff ?? 0) })).sort((a, b) => b.d - a.d)[0] : null

  const cols: Col<TeamOdds>[] = [
    { key: 'm', label: 'Team', render: (t) => <MemberLink id={t.memberId} /> },
    { key: 'r', label: 'Record', render: (t) => record(t.wins, t.losses), sort: (t) => t.wins - t.losses / 100, align: 'right' },
    { key: 'rt', label: 'Rating', render: (t) => fmt(t.rating, 1), sort: (t) => t.rating, align: 'right', tip: T.rating },
    { key: 'pw', label: 'Proj W', render: (t) => fmt(t.projWins, 1), sort: (t) => t.projWins, align: 'right' },
    { key: 'po', label: 'Playoffs', render: (t) => <span style={{ whiteSpace: 'nowrap' }}><b>{p(t.playoff)}</b><span className="odds-bar" style={{ width: Math.round(t.playoff * 48) }} /></span>, sort: (t) => t.playoff, align: 'right' },
    { key: 'by', label: 'Bye', render: (t) => p(t.bye), sort: (t) => t.bye, align: 'right' },
    { key: 'f', label: 'Final', render: (t) => p(t.final), sort: (t) => t.final, align: 'right' },
    { key: 't', label: 'Title', render: (t) => <b className="pos">{p(t.title)}</b>, sort: (t) => t.title, align: 'right' },
    { key: 'l', label: 'Last', render: (t) => <span className="neg">{p(t.last)}</span>, sort: (t) => t.last, align: 'right' },
    ...(run.nextWeek ? [{
      key: 'sw', label: `W${run.nextWeek} Win / Loss`, tip: T.swing, align: 'right' as const,
      sort: (t: TeamOdds) => (t.ifWin ?? 0) - (t.ifLoss ?? 0),
      render: (t: TeamOdds) => t.ifWin == null ? '—' : <span><span className="pos">{p(t.ifWin)}</span> / <span className="neg">{p(t.ifLoss ?? 0)}</span></span>,
    }] : []),
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Playoff Odds</h1>
          <p className="muted">{run.sims.toLocaleString()} simulated seasons as of {week === 0 ? 'the preseason' : `week ${week}`}. Top {P} make the playoffs{P === 6 ? ', top 2 get byes' : ''}.</p>
        </div>
        <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setWeekSel(null) }}>
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
      </div>
      {season.complete && <div className="banner">{year} is finished — this replays what the odds said at the time. Champion: {name(season.champion ?? undefined)}.</div>}

      <div className="stat-grid">
        <Stat icon="crown" label={`Title favorite · ${p(favorite.title)}`} value={name(favorite.memberId)} tip={T.model} />
        <Stat icon="target" label={`On the bubble · ${p(bubble.playoff)}`} value={name(bubble.memberId)} />
        {swing && <Stat icon="zap" label={`Biggest W${run.nextWeek} swing · ${((swing.ifWin! - swing.ifLoss!) * 100).toFixed(0)} pts`} value={name(swing.memberId)} tip={T.swing} />}
        {riser && week > 0 && <Stat icon="rocket" label={`Week ${week} riser · +${(riser.d * 100).toFixed(0)} pts`} value={name(riser.t.memberId)} tone="pos" />}
      </div>

      <Card title="Simulation" sub="Drag to rewind the odds to any week" right={<span className="muted">{week === 0 ? 'Preseason' : `After week ${week}`}</span>}>
        <input type="range" min={0} max={last} value={week} className="odds-range"
          onPointerDown={() => setDragging(true)} onPointerUp={() => setDragging(false)} onKeyUp={() => setDragging(false)} onBlur={() => setDragging(false)}
          onChange={(e) => setWeekSel(Number(e.target.value))} />
        <Table rows={run.teams} cols={cols} initialSort="po" rowKey={(t) => t.memberId} />
      </Card>

      <Card title="Odds Over Time" sub="Re-simulated after every week" right={<Tabs tabs={Object.keys(METRICS) as Metric[]} value={metric} onChange={setMetric} />}>
        <OddsChart history={history} metric={metric} marker={dragging ? null : week} />
      </Card>

      <Card title="Seed Distribution" sub="Chance of finishing the regular season in each spot">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Team</th>{run.teams.map((_, k) => <th key={k} className="center">{k + 1}</th>)}</tr></thead>
            <tbody>
              {[...run.teams].sort((a, b) => b.projWins - a.projWins).map((t) => (
                <tr key={t.memberId}>
                  <td><MemberLink id={t.memberId} /></td>
                  {t.seeds.map((x, k) => (
                    <td key={k} className="center" style={{ ...heat(x), borderRight: k === P - 1 ? '2px solid var(--border-strong)' : undefined }}>
                      {x >= 0.005 ? Math.round(x * 100) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// Memoized so dragging the week slider doesn't redraw the chart; the marker moves on release.
const OddsChart = memo(function OddsChart({ history, metric, marker }: { history: OddsRun[]; metric: Metric; marker: number | null }) {
  const lg = useLeague()
  const last = history[history.length - 1]
  const ids = last ? [...last.teams].sort((a, b) => b[METRICS[metric]] - a[METRICS[metric]]).map((t) => t.memberId) : []
  const chart = useMemo(() => history.map((h) => ({
    week: h.afterWeek === 0 ? 'Pre' : `W${h.afterWeek}`,
    ...Object.fromEntries(h.teams.map((t) => [t.memberId, +(t[METRICS[metric]] * 100).toFixed(1)])),
  })), [history, metric])
  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={chart}>
        <CartesianGrid stroke="var(--grid)" />
        <XAxis dataKey="week" stroke="var(--muted)" />
        <YAxis stroke="var(--muted)" domain={[0, 100]} unit="%" />
        <Tooltip contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }} itemSorter={(x) => -(x.value as number)} />
        <Legend />
        {marker != null && <ReferenceLine x={chart[marker]?.week} stroke="var(--muted)" strokeDasharray="4 4" />}
        {ids.map((id, i) => <Line key={id} dataKey={id} name={lg.memberById[id]?.name ?? id} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} isAnimationActive={false} />)}
      </LineChart>
    </ResponsiveContainer>
  )
})
