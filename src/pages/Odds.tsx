import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Legend, Line, ReferenceLine, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLeague } from '../lib/data'
import type { OddsRun, TeamOdds } from '../lib/odds'
import type { League } from '../lib/stats'
import type { OddsRequest } from '../lib/odds.worker'
import { fmt, record } from '../lib/stats'
import { Card, MemberLink, Table, Tabs, type Col } from '../components/ui'
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

export function useOdds(lg: League, year: number, week: number | null, dragging: boolean, withHistory = true) {
  const [history, setHistory] = useState<OddsRun[] | null>(null)
  const [full, setFull] = useState<OddsRun | null>(null)
  const [busy, setBusy] = useState(false)
  const latest = useRef(0)
  // Today's odds first (what the table shows), then the week-by-week history for the chart/slider.
  useEffect(() => {
    setHistory(null)
    setFull(null)
    send(lg, { kind: 'odds', year }, (res) => setFull((f) => f ?? (res as OddsRun)))
    if (withHistory) send(lg, { kind: 'hist', year }, (res) => setHistory(res as OddsRun[]))
  }, [lg, year, withHistory])
  useEffect(() => {
    if (dragging || !history || week == null) return
    const w = Math.min(week, history.length - 1)
    setBusy(true)
    const id = send(lg, { kind: 'odds', year, week: w }, (res) => { if (latest.current === id) { setFull(res as OddsRun); setBusy(false) } })
    latest.current = id
  }, [lg, year, week, dragging, history])
  return { history, full, busy }
}

/** Playoff odds simulation, shown at the top of the Playoffs page. */
export function OddsSection() {
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
  if (!run) return <Card title="Simulation"><p className="muted">Simulating the season…</p></Card>

  const P = season.playoffTeams
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
    <>
      <Card
        title="Simulation"
        sub={`${busy ? 'Refining… ' : ''}${run.sims.toLocaleString()} simulated seasons as of ${week === 0 ? 'the preseason' : `week ${week}`}. Top ${P} make the playoffs${P === 6 ? ', top 2 get byes' : ''}. Drag to rewind the odds to any week.`}
        right={
          <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setWeekSel(null) }}>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        }
      >
        <input type="range" min={0} max={last} value={week} className="odds-range" disabled={!history}
          onPointerDown={() => setDragging(true)} onPointerUp={() => setDragging(false)} onKeyUp={() => setDragging(false)} onBlur={() => setDragging(false)}
          onChange={(e) => setWeekSel(Number(e.target.value))} />
        <Table rows={run.teams} cols={cols} initialSort="po" rowKey={(t) => t.memberId} />
      </Card>

      <Card title="Odds Over Time" sub="Re-simulated after every week" right={<Tabs tabs={Object.keys(METRICS) as Metric[]} value={metric} onChange={setMetric} />}>
        {history ? <OddsChart history={history} metric={metric} marker={dragging ? null : week} /> : <p className="muted">Simulating every week…</p>}
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
    </>
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
