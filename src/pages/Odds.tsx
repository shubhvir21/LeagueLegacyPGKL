import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Legend, Line, ReferenceLine, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLeague } from '../lib/data'
import type { GameSwing, OddsRun, PartialWeek, ScenarioRun, TeamOdds, TeamScenario, Threshold } from '../lib/odds'
import { usePartialWeek } from '../lib/usePartialWeek'
import type { League } from '../lib/stats'
import type { OddsRequest } from '../lib/odds.worker'
import { fmt, record } from '../lib/stats'
import { Avatar, Card, MemberLink, Stat, Table, Tabs, type Col } from '../components/ui'
import { PALETTE } from './History'

const METRICS = { Playoffs: 'playoff', Bye: 'bye', Title: 'title' } as const
type Metric = keyof typeof METRICS
const pctOr = (x: number | null | undefined) => (x == null ? '—' : p(x))
const p = (x: number) => (x >= 0.9995 ? '100%' : x > 0 && x < 0.001 ? '<0.1%' : `${(x * 100).toFixed(1)}%`)
const heat = (x: number) => ({ background: `rgba(124, 140, 255, ${Math.min(0.85, x * 1.6)})`, color: x > 0.3 ? '#fff' : undefined })

const T = {
  rating: 'Expected points next week: the best lineup from the roster, blended with actual scoring at the weight the backtest picked. Without projections, actual scoring only.',
  roster: 'Best possible lineup next week from the roster. Each player = Sleeper projection (bias-corrected per position) blended with his actual points this season; byes are zeroed, Out/Doubtful/IR players sit out next week, and later weeks follow Sleeper’s projection (which builds in return dates), and an empty slot is filled by the best waiver-wire option.',
  scoring: 'Actual points per week, recent weeks weighted more (6-week half-life), shrunk toward the league’s all-time average early in the year.',
  swing: 'Playoff odds if this team wins vs. loses its head-to-head game next week. The gap is how much the game matters.',
  swing3: 'This league plays two different games a week: your head-to-head matchup (beat one team) and the median game (score above the league’s median, whoever you play). Playoff odds if this team wins both, wins only its matchup, beats only the median, or loses both.',
  model: 'Every simulation draws each team’s true scoring level (with uncertainty), plays the rest of the regular season including the median game, seeds by wins then points for, and plays the bracket.',
}

// One shared worker; results are tagged by request id so stale ones are dropped.
let worker: Worker | null = null
let sentRaw: unknown = null
let nextId = 0
function send(lg: League, req: Omit<OddsRequest, 'id' | 'raw'>, cb: (res: OddsRun | OddsRun[] | ScenarioRun | null) => void) {
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

export function useOdds(lg: League, year: number, week: number | null, dragging: boolean, withHistory = true, partial: PartialWeek | null = null) {
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
  // A week in progress: re-run today's odds with what has happened so far. Rewinding to an earlier week leaves it out.
  useEffect(() => {
    if (!partial || week != null) return
    const id = send(lg, { kind: 'odds', year, partial }, (res) => { if (latest.current === id || latest.current === 0) setFull(res as OddsRun) })
    latest.current = id
  }, [lg, year, partial, week])
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
  const partial = usePartialWeek(year === lg.seasons[0]?.year && !season.complete)
  const { history, full, busy } = useOdds(lg, year, weekSel, dragging, true, partial)
  const last = history ? history.length - 1 : full?.afterWeek ?? 0
  const week = weekSel == null || weekSel > last ? last : weekSel
  const run = (full && full.afterWeek === week && full.season === year ? full : null) ?? history?.[week]
  if (!run) return <Card title="Simulation"><p className="muted">Simulating the season…</p></Card>

  const P = season.playoffTeams
  const hasSplit = run.teams.some((t) => t.ifSplit != null)
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
    { key: 'l', label: 'Toilet Bowl', tip: 'Odds of losing the toilet bowl (finishing last)', render: (t) => <span className="neg">{p(t.last)}</span>, sort: (t) => t.last, align: 'right' },
    ...(run.nextWeek ? [{
      key: 'sw',
      label: hasSplit
        ? <span>{`W${run.nextWeek} playoff odds if`}<span className="sw-legend"><br /><span className="pos">win both</span> / matchup only / median only / <span className="neg">lose both</span></span></span>
        : `W${run.nextWeek} Win / Loss`, tip: hasSplit ? T.swing3 : T.swing, align: 'right' as const,
      sort: (t: TeamOdds) => (t.ifWin ?? 0) - (t.ifLoss ?? 0),
      render: (t: TeamOdds) => t.ifWin == null && t.ifLoss == null ? '—' : (
        hasSplit ? (
          <span className="sw4">
            <span className="pos"><b>{pctOr(t.ifWin)}</b><i>Win both</i></span>
            <span><b>{pctOr(t.ifMatchupOnly)}</b><i>Matchup only</i></span>
            <span><b>{pctOr(t.ifMedianOnly)}</b><i>Median only</i></span>
            <span className="neg"><b>{pctOr(t.ifLoss)}</b><i>Lose both</i></span>
          </span>
        ) : (
          <span style={{ whiteSpace: 'nowrap' }}><span className="pos">{pctOr(t.ifWin)}</span> / <span className="neg">{pctOr(t.ifLoss)}</span></span>
        )
      ),
    }] : []),
  ]

  return (
    <>
      <Card
        title="Simulation"
        sub={`${busy ? 'Refining… ' : ''}${run.sims.toLocaleString()} simulated seasons as of ${week === 0 ? 'the preseason' : `week ${week}`}${run.partial ? ` plus week ${run.nextWeek}: games played so far and Vegas player props for the rest` : ''}${run.frozenAt ? ` (as published ${new Date(run.frozenAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })})` : ''}. Top ${P} make the playoffs${P === 6 ? ', top 2 get byes' : ''}. Drag to rewind the odds to any week.`}
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

// One scenarios run per league + season, shared by both sections.
const scenCache = new WeakMap<League, Record<number, ScenarioRun | Promise<ScenarioRun | null>>>()
function useScenarios(lg: League, year: number, enabled: boolean) {
  const [run, setRun] = useState<ScenarioRun | null>(() => { const v = scenCache.get(lg)?.[year]; return v && !(v instanceof Promise) ? v : null })
  useEffect(() => {
    if (!enabled) return
    let m = scenCache.get(lg)
    if (!m) scenCache.set(lg, (m = {}))
    const hit = m[year]
    if (hit && !(hit instanceof Promise)) { setRun(hit); return }
    let live = true
    const pr = hit ?? new Promise<ScenarioRun | null>((res) => send(lg, { kind: 'scen', year }, (r) => res(r as ScenarioRun | null)))
    m[year] = pr as Promise<ScenarioRun | null>
    pr.then((r) => { if (r) m![year] = r; if (live) setRun(r) })
    return () => { live = false }
  }, [lg, year, enabled])
  return run
}

/** Scenario text with the joining words (and / or) bold and capitalized so the logic stands out. */
function logic(text: string) {
  return text.split(/\b(and|or)\b(?! (?:better|worse)\b)/).map((part, k) => (k % 2 ? <b key={k} className="logic">{part.toUpperCase()}</b> : part))
}

const rec = (k: number, g: number) => `${k}–${g - k}`
const better = (k: number, g: number) => (k === g ? `${rec(k, g)}` : `${rec(k, g)} or better`)
const worse = (k: number, g: number) => (k === 0 ? `${rec(k, g)}` : `${rec(k, g)} or worse`)

/** Plain statements from the simulations: what happened in every simulated finish, or in none. */
function clinchLines(t: TeamScenario, byes: boolean, name: (id: string) => string): { tone: 'pos' | 'neg' | 'gold' | 'muted'; text: string }[] {
  const g = t.games
  const out: { tone: 'pos' | 'neg' | 'gold' | 'muted'; text: string }[] = []
  const list = (ids: string[]) => ids.length < 3 ? ids.map(name).join(' and ') : `${ids.slice(0, -1).map(name).join(', ')} and ${name(ids[ids.length - 1])}`
  const tie = (T: Threshold, what: string, tone: 'pos' | 'gold') => {
    if (T.tiebreak) out.push({ tone, text: `clinches ${what} at ${better(T.tiebreak.at, g)}${T.tiebreak.rivals.length ? `, as long as they finish ahead of ${list(T.tiebreak.rivals)} on points for if tied` : ', as long as they win any points-for tiebreak'}` })
  }
  const P = t.playoffT
  if (P.all) out.push({ tone: 'pos', text: 'has clinched a playoff spot' })
  else if (P.never) { out.push({ tone: 'neg', text: 'is eliminated' }); return out }
  else {
    if (P.clinchAt != null) out.push({ tone: 'pos', text: `clinches a playoff spot at ${better(P.clinchAt, g)}` })
    tie(P, 'a playoff spot', 'pos')
    if (P.clinchAt == null && !P.tiebreak) out.push({ tone: 'muted', text: `can’t clinch on their own, even at ${rec(g, g)}: they need help` })
    if (P.outAt != null) out.push({ tone: 'neg', text: `is eliminated at ${worse(P.outAt, g)}` })
  }
  const step = (T: Threshold, what: string) => {
    if (T.never) return
    if (T.all) out.push({ tone: 'gold', text: `has clinched ${what}` })
    else {
      if (T.clinchAt != null) out.push({ tone: 'gold', text: `clinches ${what} at ${better(T.clinchAt, g)}` })
      tie(T, what, 'gold')
      if (T.clinchAt == null && !T.tiebreak) out.push({ tone: 'muted', text: `can still get ${what}, but only with help` })
    }
  }
  if (byes) step(t.byeT, 'a bye')
  step(t.topT, 'the 1 seed')
  return out
}

/** Above the simulation: what can be clinched or lost next week. Hidden when nothing can. */
export function ClinchSection() {
  const lg = useLeague()
  const season = lg.seasons[0]
  const run = useScenarios(lg, season.year, !season.complete)
  if (season.complete || !run || !run.nextWeek || !run.weekLines.length) return null
  const byTeam = new Map<string, typeof run.weekLines>()
  for (const l of run.weekLines) byTeam.set(l.memberId, [...(byTeam.get(l.memberId) ?? []), l])
  return (
    <Card
      title={`Week ${run.nextWeek} Clinch Scenarios`}
      sub={`What can be locked up or lost this week${run.median ? ' (each week is two games: the matchup and the median game)' : ''}. “Clinches” means no result in the remaining weeks can take it away.`}
    >
      <ul className="clinch-list">
        {[...byTeam.entries()].map(([id, ls]) => (
          <li key={id} className="clinch-row">
            <span className="clinch-who"><MemberLink id={id} /></span>
            <ul className="clinch-lines">{ls.map((l, k) => <li key={k} className={l.kind === 'out' ? 'tone-neg' : l.what === 'a playoff spot' ? 'tone-pos' : 'tone-gold'}>{logic(l.text)}</li>)}</ul>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Below the simulation: one team's paths in detail. */
export function ScenariosSection() {
  const lg = useLeague()
  const season = lg.seasons[0]
  const run = useScenarios(lg, season.year, !season.complete)
  const [pick, setPick] = useState<string | null>(null)
  if (season.complete) return null
  if (!run) return <Card title="Team Scenarios"><p className="muted">Working out every team’s path…</p></Card>
  if (!run.teams.some((t) => t.games)) return null

  const name = (id: string) => lg.memberById[id]?.name ?? id
  // Default to the most interesting team: the one closest to a coin flip.
  const fallback = [...run.teams].sort((a, b) => Math.abs(a.playoff - 0.5) - Math.abs(b.playoff - 0.5))[0].memberId
  const t = run.teams.find((x) => x.memberId === (pick ?? fallback))!
  const g = t.games
  const nx = t.next

  return (
    <Card
      title="Team Scenarios"
      sub={`One team’s paths over the last ${g} games${run.median ? ', counting the median game' : ''}.`}
      right={<select value={t.memberId} onChange={(e) => setPick(e.target.value)} aria-label="Team">{run.teams.map((x) => <option key={x.memberId} value={x.memberId}>{name(x.memberId)}</option>)}</select>}
    >
      <div className="scen">
        <div className="scen-head">
          <Avatar id={t.memberId} size={40} />
          <ul className="clinch-lines">{clinchLines(t, run.byes, name).map((l, k) => <li key={k} className={`tone-${l.tone}`}><b>{name(t.memberId)}</b> {logic(l.text)}</li>)}</ul>
        </div>
        <div className="stat-grid scen-stats">
          <Stat label="Playoff odds" value={p(t.playoff)} />
          {run.byes && <Stat label="Bye odds" value={p(t.bye)} />}
          {t.winOut != null && <Stat label={`At ${rec(g, g)}`} value={<span className="pos">{p(t.winOut)}</span>} />}
          {t.loseOut != null && <Stat label={`At ${rec(0, g)}`} value={<span className="neg">{p(t.loseOut)}</span>} />}
        </div>

        {nx && (
          <div className="scen-block">
            <h3>Week {nx.week}</h3>
            <div className="stat-grid scen-stats">
              {nx.both != null && <Stat label={nx.median ? 'Win both' : 'Win'} value={<span className="pos">{p(nx.both)}</span>} />}
              {nx.matchupOnly != null && <Stat label="Win matchup only" value={p(nx.matchupOnly)} />}
              {nx.medianOnly != null && <Stat label="Beat median only" value={p(nx.medianOnly)} />}
              {nx.none != null && <Stat label={nx.median ? 'Lose both' : 'Lose'} value={<span className="neg">{p(nx.none)}</span>} />}
            </div>
          </div>
        )}

        {t.byWins.length > 1 && (
          <div className="scen-block">
            <h3>Playoff odds by record over the last {g}</h3>
            <div className="scen-wins">
              {t.byWins.map((b) => (
                <div key={b.wins} className="scen-win">
                  <div className="scen-win-bar"><span style={{ height: `${Math.max(2, b.odds * 100)}%` }} /></div>
                  <b>{b.share ? p(b.odds) : '—'}</b>
                  <span className="muted small">{rec(b.wins, g)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {t.ownGames.length > 0 && (
          <div className="scen-block">
            <h3>{run.median ? 'Their games · each week is two different games: the matchup and the median' : 'Their games'}</h3>
            <ul className="scen-list">{t.ownGames.map((x) => (
              <li key={x.week}>
                <span className="scen-wk">W{x.week}</span>
                <span className="scen-who">vs <MemberLink id={x.b} /></span>
                <span className="scen-odds">{run.median
                  ? <><span className="pos">Win both {p(x.ifA)}</span><span>Matchup only {x.ifMatchupOnly == null ? '—' : p(x.ifMatchupOnly)}</span><span>Median only {x.ifMedianOnly == null ? '—' : p(x.ifMedianOnly)}</span><span className="neg">Lose both {p(x.ifB)}</span></>
                  : <><span className="pos">Win {p(x.ifA)}</span><span className="neg">Lose {p(x.ifB)}</span></>}</span>
              </li>
            ))}</ul>
          </div>
        )}

        <div className="scen-block">
          <h3>Root for</h3>
          {t.rootFor.length ? <ul className="scen-list">{t.rootFor.map((x: GameSwing) => (
            <li key={`${x.week}${x.a}`}>
              <span className="scen-wk">W{x.week}</span>
              <span className="scen-who"><MemberLink id={x.a} /> <span className="muted">over</span> <MemberLink id={x.b} /></span>
              <span className="scen-odds"><span className="pos">If so {p(x.ifA)}</span><span className="neg">If not {p(x.ifB)}</span></span>
            </li>
          ))}</ul> : <p className="muted">No other game moves their odds by more than a point.</p>}
        </div>
      </div>
    </Card>
  )
}
