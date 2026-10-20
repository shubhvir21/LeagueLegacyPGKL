import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, ReferenceLine, Scatter, ScatterChart, ZAxis, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLeague } from '../lib/data'
import type { OddsRun, TeamOdds } from '../lib/odds'
import type { League } from '../lib/stats'
import type { OddsRequest } from '../lib/odds.worker'
import { fmt, record } from '../lib/stats'
import { Card, MemberLink, Stat, Table, Tabs, type Col } from '../components/ui'
import { PALETTE } from './History'

const METRICS = { Playoffs: 'playoff', Bye: 'bye', Title: 'title' } as const
type Metric = keyof typeof METRICS
const p = (x: number) => (x >= 0.9995 ? '100%' : x > 0 && x < 0.001 ? '<0.1%' : `${(x * 100).toFixed(1)}%`)
const heat = (x: number) => ({ background: `rgba(124, 140, 255, ${Math.min(0.85, x * 1.6)})`, color: x > 0.3 ? '#fff' : undefined })

const T = {
  rating: 'Expected points next week: the best lineup from the roster, blended with actual scoring at the weight the backtest picked. Without projections, actual scoring only.',
  roster: 'Best possible lineup next week from the roster. Each player = Sleeper projection (bias-corrected per position) blended with his actual points this season; byes and Out/IR are zeroed, Questionable discounted, and an empty slot is filled by the best waiver-wire option.',
  scoring: 'Actual points per week, recent weeks weighted more (6-week half-life), shrunk toward the league’s all-time average early in the year.',
  swing: 'Playoff odds if this team wins vs. loses its head-to-head game next week. The gap is how much the game matters.',
  model: 'Every simulation draws each team’s true scoring level (with uncertainty), plays the rest of the regular season including the median game, seeds by wins then points for, and plays the bracket.',
}

// One shared worker; results are tagged by request id so stale ones are dropped.
let worker: Worker | null = null
let sentRaw: unknown = null
let nextId = 0
function send(lg: League, req: Omit<OddsRequest, 'id' | 'raw'>, cb: (res: OddsRun | OddsRun[] | null) => void) {
  worker ??= new Worker(new URL('../lib/odds.worker.ts', import.meta.url), { type: 'module' })
  const id = ++nextId
  const raw = sentRaw === lg.raw ? undefined : lg.raw
  sentRaw = lg.raw
  const w = worker
  const onMsg = (e: MessageEvent) => { if (e.data.id === id) { w.removeEventListener('message', onMsg); cb(e.data.res) } }
  w.addEventListener('message', onMsg)
  w.postMessage({ id, raw, ...req } satisfies OddsRequest)
  return id
}

function useOdds(lg: League, year: number, week: number | null, dragging: boolean) {
  const [history, setHistory] = useState<OddsRun[] | null>(null)
  const [full, setFull] = useState<OddsRun | null>(null)
  const [busy, setBusy] = useState(false)
  const latest = useRef(0)
  // Today's odds first (what the table shows), then the week-by-week history for the chart/slider.
  useEffect(() => {
    setHistory(null)
    setFull(null)
    send(lg, { kind: 'odds', year }, (res) => setFull((f) => f ?? (res as OddsRun)))
    send(lg, { kind: 'hist', year }, (res) => setHistory(res as OddsRun[]))
  }, [lg, year])
  useEffect(() => {
    if (dragging || !history || week == null) return
    const w = Math.min(week, history.length - 1)
    setBusy(true)
    const id = send(lg, { kind: 'odds', year, week: w }, (res) => { if (latest.current === id) { setFull(res as OddsRun); setBusy(false) } })
    latest.current = id
  }, [lg, year, week, dragging, history])
  return { history, full, busy }
}

export default function Odds() {
  const lg = useLeague()
  const years = lg.seasons.map((s) => s.year)
  const [year, setYear] = useState(years[0])
  const [metric, setMetric] = useState<Metric>('Playoffs')
  const season = lg.seasons.find((s) => s.year === year)!
  const [weekSel, setWeekSel] = useState<number | null>(null)
  // While dragging, show the cached per-week runs (instant); the full 10k run happens on release.
  const [dragging, setDragging] = useState(false)
  const { history, full, busy } = useOdds(lg, year, weekSel, dragging)
  const last = history ? history.length - 1 : full?.afterWeek ?? 0
  const week = weekSel == null || weekSel > last ? last : weekSel
  const run = (full && full.afterWeek === week && full.season === year ? full : null) ?? history?.[week]
  if (!run) return <div className="page"><h1>Playoff Odds</h1><p className="muted">Simulating the season…</p></div>
  const name = (id?: string) => (id ? lg.memberById[id]?.name ?? id : '—')

  const P = season.playoffTeams
  const favorite = [...run.teams].sort((a, b) => b.title - a.title)[0]
  const bubble = [...run.teams].sort((a, b) => Math.abs(a.playoff - 0.5) - Math.abs(b.playoff - 0.5))[0]
  const swing = [...run.teams].filter((t) => t.ifWin != null && t.ifLoss != null).sort((a, b) => (b.ifWin! - b.ifLoss!) - (a.ifWin! - a.ifLoss!))[0]
  const riser = history && history.length > 1 ? [...run.teams].map((t) => ({ t, d: t.playoff - (history[Math.max(0, week - 1)].teams.find((x) => x.memberId === t.memberId)?.playoff ?? 0) })).sort((a, b) => b.d - a.d)[0] : null

  const cols: Col<TeamOdds>[] = [
    { key: 'm', label: 'Team', render: (t) => <MemberLink id={t.memberId} /> },
    { key: 'r', label: 'Record', render: (t) => record(t.wins, t.losses), sort: (t) => t.wins - t.losses / 100, align: 'right' },
    { key: 'rt', label: 'Next Wk', render: (t) => <b>{fmt(t.rating, 1)}</b>, sort: (t) => t.rating, align: 'right', tip: T.rating },
    ...(run.rosterAware ? [{ key: 'ro', label: 'Roster', render: (t: TeamOdds) => fmt(t.rosterRating ?? 0, 1), sort: (t: TeamOdds) => t.rosterRating ?? 0, align: 'right' as const, tip: T.roster }] : []),
    { key: 'sc', label: 'Scoring', render: (t) => fmt(t.scoreRating, 1), sort: (t) => t.scoreRating, align: 'right', tip: T.scoring },
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
          <p className="muted">{busy ? 'Refining… ' : ''}{run.sims.toLocaleString()} simulated seasons as of {week === 0 ? 'the preseason' : `week ${week}`}. Top {P} make the playoffs{P === 6 ? ', top 2 get byes' : ''}.</p>
        </div>
        <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setWeekSel(null) }}>
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
      </div>
      {!season.complete && <div className="banner">{run.rosterAware
        ? `Roster-aware: every starter is simulated from his projection, using ${week === last ? 'current rosters and injuries' : `rosters as of week ${week}`}, byes and waiver fill-ins, assuming everyone starts their best lineup.`
        : 'No projections for this week — scoring only.'}</div>}
      {season.complete && <div className="banner">{year} is finished — this replays what the odds said at the time. Champion: {name(season.champion ?? undefined)}.</div>}

      <div className="stat-grid">
        <Stat icon="crown" label={`Title favorite · ${p(favorite.title)}`} value={name(favorite.memberId)} tip={T.model} />
        <Stat icon="target" label={`On the bubble · ${p(bubble.playoff)}`} value={name(bubble.memberId)} />
        {swing && <Stat icon="zap" label={`Biggest W${run.nextWeek} swing · ${((swing.ifWin! - swing.ifLoss!) * 100).toFixed(0)} pts`} value={name(swing.memberId)} tip={T.swing} />}
        {riser && week > 0 && <Stat icon="rocket" label={`Week ${week} riser · +${(riser.d * 100).toFixed(0)} pts`} value={name(riser.t.memberId)} tone="pos" />}
      </div>

      <Card title="Simulation" sub="Drag to rewind the odds to any week" right={<span className="muted">{week === 0 ? 'Preseason' : `After week ${week}`}</span>}>
        <input type="range" min={0} max={last} value={week} className="odds-range" disabled={!history}
          onPointerDown={() => setDragging(true)} onPointerUp={() => setDragging(false)} onKeyUp={() => setDragging(false)} onBlur={() => setDragging(false)}
          onChange={(e) => setWeekSel(Number(e.target.value))} />
        <Table rows={run.teams} cols={cols} initialSort="po" rowKey={(t) => t.memberId} />
      </Card>

      <Card title="Odds Over Time" sub="Re-simulated after every week" right={<Tabs tabs={Object.keys(METRICS) as Metric[]} value={metric} onChange={setMetric} />}>
        {history ? <OddsChart history={history} metric={metric} marker={dragging ? null : week} /> : <p className="muted">Simulating every week…</p>}
      </Card>

      <ModelCard />

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

function ModelCard() {
  const lg = useLeague()
  const m = lg.raw.model
  const bt = m?.backtest
  if (!m || !bt) return null
  const scoring = bt.variants.find((v) => v.weight == null)
  const chosen = bt.variants.find((v) => v.weight === m.rosterWeight)
  const skill = (b: number) => Math.round((1 - b / bt.baseline) * 100)
  const tip = { background: 'var(--panel-2)', border: '1px solid var(--border)' }
  return (
    <Card title="Model Accuracy" sub={`Backtested on ${bt.seasons.join(', ')}: replayed from every week and scored against who actually made the playoffs`}>
      <div className="stat-grid">
        <Stat icon="target" label={`Brier score · lower is better (guessing = ${bt.baseline})`} value={chosen?.brier ?? '—'} tip="Average squared gap between the predicted playoff chance and what happened (1 or 0)." />
        <Stat icon="chart" label="Better than guessing" value={`${skill(chosen?.brier ?? bt.baseline)}%`} tone="pos" />
        <Stat icon="zap" label="Gain from rosters vs scoring only" value={scoring && chosen ? `${Math.round((1 - chosen.brier / scoring.brier) * 100)}%` : '—'} tone="pos" />
        <Stat icon="scale" label="Roster weight chosen" value={`${Math.round(m.rosterWeight * 100)}%`} tip="Share of each team’s weekly expectation from its roster projection; the rest comes from its actual scoring. Picked by lowest backtest error." />
      </div>
      <div className="grid-2">
        <div>
          <h3 className="sub-head">Variants</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bt.variants} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke="var(--grid)" />
              <XAxis type="number" stroke="var(--muted)" domain={[0, 'auto']} />
              <YAxis type="category" dataKey="name" stroke="var(--muted)" width={100} />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="brier" name="Brier" isAnimationActive={false}>
                {bt.variants.map((v) => <Cell key={v.name} fill={v.weight === m.rosterWeight ? 'var(--accent)' : 'var(--panel-3)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h3 className="sub-head">Calibration · predicted vs actual playoff rate</h3>
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ right: 10 }}>
              <CartesianGrid stroke="var(--grid)" />
              <XAxis type="number" dataKey="predicted" stroke="var(--muted)" domain={[0, 1]} tickFormatter={(x) => `${Math.round(x * 100)}%`} name="Predicted" />
              <YAxis type="number" dataKey="actual" stroke="var(--muted)" domain={[0, 1]} tickFormatter={(x) => `${Math.round(x * 100)}%`} name="Actual" />
              <ZAxis type="number" dataKey="n" range={[40, 260]} name="Team-weeks" />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="var(--muted)" strokeDasharray="4 4" />
              <Tooltip contentStyle={tip} formatter={(v, k) => (k === "Team-weeks" ? String(v) : `${Math.round(Number(v) * 100)}%`)} />
              <Scatter data={bt.calibration} fill="var(--accent)" isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
      <h3 className="sub-head">Error by week · the roster model is sharpest early, when scores alone say little</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={bt.byWeek.map((b) => ({ ...b, week: `W${b.week}` }))}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis dataKey="week" stroke="var(--muted)" />
          <YAxis stroke="var(--muted)" />
          <Tooltip contentStyle={tip} />
          <Legend />
          <Line dataKey="scoring" name="Scoring only" stroke="var(--muted)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="model" name="Roster model" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="muted" style={{ fontSize: 12.5 }}>
        Fitted from {m.samples.toLocaleString()} player-weeks: spread per position {Object.entries(m.pos).filter(([p]) => p !== 'K').map(([p, x]) => `${p} ±${fmt(x.sd0 + x.sd1 * 12, 1)}`).join(' · ')} (at a 12-pt projection);
        same-NFL-team correlation {m.rho}; team-level noise ±{m.resid}. Refit on every sync.
      </p>
    </Card>
  )
}
