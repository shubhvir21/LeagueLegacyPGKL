import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLeague } from '../lib/data'
import { careers, fmt, pct, record, type CareerRow, type League, type TeamSeason } from '../lib/stats'
import { Card, MemberLink, Table, Tabs, Trophies, TIPS, type Col } from '../components/ui'

export const PALETTE = ['#4f8cff', '#ff7a59', '#2ecc8f', '#f5c542', '#b07cff', '#ff5c8a', '#3fd0d4', '#a3d65c', '#ff9f43', '#8892b0', '#e86fd8', '#6be0a5']

const STANDINGS_TABS = ['All-Time', 'Playoffs', 'Advanced'] as const
const SEASON_TABS = ['Champions', 'Chumpions'] as const
const METRICS = {
  'League Rating': { get: (_t: TeamSeason) => _t.eloEnd, reversed: false },
  'Season Score': { get: (t: TeamSeason) => t.seasonScore, reversed: false },
  'Points Share': { get: (t: TeamSeason) => +t.pointsShare.toFixed(2), reversed: false },
  'Final Rank': { get: (t: TeamSeason) => t.finalRank ?? t.regRank, reversed: true },
  'Coach Score': { get: (t: TeamSeason) => (t.coachScore != null ? +t.coachScore.toFixed(1) : null), reversed: false },
  'Strength of Schedule': { get: (t: TeamSeason) => +t.sos.toFixed(2), reversed: false },
  Luck: { get: (t: TeamSeason) => +t.luck.toFixed(2), reversed: false },
} as const
type Metric = keyof typeof METRICS

export default function History() {
  const lg = useLeague()
  const rows = careers(lg)
  const [tab, setTab] = useState<(typeof STANDINGS_TABS)[number]>('All-Time')
  const [seasonTab, setSeasonTab] = useState<(typeof SEASON_TABS)[number]>('Champions')
  const [metric, setMetric] = useState<Metric>('League Rating')
  const [showInactive, setShowInactive] = useState(false)
  const current = lg.seasons[0].year
  const visible = showInactive ? rows : rows.filter((r) => r.seasons.includes(current))

  const base: Col<CareerRow>[] = [
    { key: 'rank', label: '#', render: (_r, i) => i + 1 },
    { key: 'team', label: 'Member', render: (r) => <MemberLink id={r.member.id} /> },
    { key: 'seasons', label: 'Seasons', render: (r) => `${seasonRange(r.seasons)} (${r.seasons.length})`, sort: (r) => r.seasons.length },
  ]
  const cols: Record<typeof tab, Col<CareerRow>[]> = {
    'All-Time': [
      ...base,
      { key: 'rec', label: 'Record', render: (r) => record(r.wins, r.losses, r.ties), sort: (r) => r.wins, tip: TIPS.median },
      { key: 'pct', label: 'Win %', render: (r) => pct(r.wins, r.losses, r.ties), sort: (r) => r.wins / (r.wins + r.losses + r.ties || 1) },
      { key: 'ap', label: 'All-Play', render: (r) => record(r.apW, r.apL, r.apT), sort: (r) => r.apW, tip: TIPS.allPlay },
      { key: 'appct', label: 'All-Play %', render: (r) => pct(r.apW, r.apL, r.apT), sort: (r) => r.apW / (r.apW + r.apL + r.apT || 1) },
      { key: 'elo', label: 'League Rating', render: (r) => <b>{r.elo}</b>, sort: (r) => r.elo, tip: TIPS.elo },
      { key: 'troph', label: 'Trophies', render: (r) => <Trophies gold={r.titles} silver={r.seconds} bronze={r.thirds} />, sort: (r) => r.titles * 100 + r.seconds * 10 + r.thirds },
    ],
    Playoffs: [
      ...base,
      { key: 'apps', label: 'Appearances', render: (r) => r.playoffs, sort: (r) => r.playoffs },
      { key: 'prec', label: 'Playoff Record', render: (r) => record(r.playoffW, r.playoffL), sort: (r) => r.playoffW },
      { key: 'ppct', label: 'Playoff Win %', render: (r) => pct(r.playoffW, r.playoffL), sort: (r) => r.playoffW / (r.playoffW + r.playoffL || 1) },
      { key: 'titles', label: 'Titles', render: (r) => r.titles, sort: (r) => r.titles },
      { key: 'finals', label: 'Finals', render: (r) => r.titles + r.seconds, sort: (r) => r.titles + r.seconds },
      { key: 'avgf', label: 'Avg Finish', render: (r) => (r.avgFinish != null ? r.avgFinish.toFixed(1) : '—'), sort: (r) => -(r.avgFinish ?? 99) },
    ],
    Advanced: [
      ...base,
      { key: 'pf', label: 'Points For', render: (r) => fmt(r.pf), sort: (r) => r.pf, align: 'right' },
      { key: 'ppg', label: 'PPG', render: (r) => fmt(r.pf / (r.games || 1)), sort: (r) => r.pf / (r.games || 1), align: 'right' },
      { key: 'pa', label: 'Points Against', render: (r) => fmt(r.pa), sort: (r) => r.pa, align: 'right' },
      { key: 'papg', label: 'Opp PPG', render: (r) => fmt(r.pa / (r.games || 1)), sort: (r) => r.pa / (r.games || 1), align: 'right' },
      { key: 'diff', label: 'Diff / G', render: (r) => signed((r.pf - r.pa) / (r.games || 1)), sort: (r) => (r.pf - r.pa) / (r.games || 1), align: 'right' },
      { key: 'score', label: 'Avg Season Score', render: (r) => r.avgScore.toFixed(1), sort: (r) => r.avgScore, tip: TIPS.score, align: 'right' },
    ],
  }

  return (
    <div className="page">
      <h1>League History</h1>
      <Card
        title="Standings"
        sub="Every manager's all-time numbers. Click a column to sort."
        right={
          <label className="check">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive members
          </label>
        }
      >
        <Tabs tabs={STANDINGS_TABS} value={tab} onChange={setTab} />
        <Table key={tab} rows={visible} cols={cols[tab]} rowKey={(r) => r.member.id} />
      </Card>

      <Card title="Season by Season" sub="Champions and leaders for every season.">
        <Tabs tabs={SEASON_TABS} value={seasonTab} onChange={setSeasonTab} />
        <SeasonTable lg={lg} mode={seasonTab} />
      </Card>

      <Card
        title="Trends"
        sub="How each member has trended season over season."
        right={
          <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            {Object.keys(METRICS).map((m) => <option key={m}>{m}</option>)}
          </select>
        }
      >
        <TrendChart lg={lg} metric={metric} />
      </Card>
    </div>
  )
}

function SeasonTable({ lg, mode }: { lg: League; mode: 'Champions' | 'Chumpions' }) {
  const awards = (pick: (ts: TeamSeason[]) => TeamSeason | undefined) => (ts: TeamSeason[]) => pick(ts)?.memberId ?? null
  const maxBy = (f: (t: TeamSeason) => number) => (ts: TeamSeason[]) => [...ts].sort((a, b) => f(b) - f(a))[0]
  const minBy = (f: (t: TeamSeason) => number) => (ts: TeamSeason[]) => [...ts].sort((a, b) => f(a) - f(b))[0]
  const champCols = [
    { label: '🏆 Champion', get: awards((ts) => ts.find((t) => t.finalRank === 1)) },
    { label: '🥈 2nd', get: awards((ts) => ts.find((t) => t.finalRank === 2)) },
    { label: '🥉 3rd', get: awards((ts) => ts.find((t) => t.finalRank === 3)) },
    { label: '🥇 Reg. Season', get: awards((ts) => ts.find((t) => t.regRank === 1)) },
    { label: '⭐ Points', get: awards(maxBy((t) => t.pf)) },
    { label: '👑 All-Play', get: awards(maxBy((t) => t.apW)) },
  ]
  const chumpCols = [
    { label: '🌮 Last Place', get: awards((ts) => [...ts].sort((a, b) => (b.finalRank ?? b.regRank) - (a.finalRank ?? a.regRank))[0]) },
    { label: '🤮 Fewest Points', get: awards(minBy((t) => t.pf)) },
    { label: '💩 Worst All-Play', get: awards(minBy((t) => t.apW)) },
    { label: '🧱 Most Points Against', get: awards(maxBy((t) => t.pa)) },
    { label: '🍀 Unluckiest', get: awards(minBy((t) => t.luck)) },
  ]
  const cols = mode === 'Champions' ? champCols : chumpCols
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Season</th>{cols.map((c) => <th key={c.label}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {lg.seasons.map((s) => (
            <tr key={s.year}>
              <td><Link to={`/season/${s.year}`}><b>{s.year}</b></Link>{!s.complete && <span className="pill">in progress</span>}</td>
              {cols.map((c) => {
                const id = c.get(s.teamSeasons)
                const placement = c.label.includes('Champion') || c.label.includes('2nd') || c.label.includes('3rd') || c.label.includes('Last')
                return <td key={c.label}>{placement && !s.complete ? <span className="muted">—</span> : <MemberLink id={id} />}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TrendChart({ lg, metric }: { lg: League; metric: Metric }) {
  const { get, reversed } = METRICS[metric]
  const years = [...lg.seasons].reverse()
  const ids = [...new Set(years.flatMap((s) => s.teamSeasons.map((t) => t.memberId)))]
  const data = years.map((s) => {
    const row: Record<string, number | string | null> = { season: String(s.year) }
    for (const t of s.teamSeasons) row[t.memberId] = get(t)
    return row
  })
  if (years.length < 2) return <p className="muted">Trends appear once there are two or more seasons.</p>
  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--grid)" />
        <XAxis dataKey="season" stroke="var(--muted)" />
        <YAxis stroke="var(--muted)" reversed={reversed} domain={['auto', 'auto']} allowDecimals={!reversed} />
        <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)' }} />
        <Legend />
        {ids.map((id, i) => (
          <Line key={id} dataKey={id} name={lg.memberById[id]?.name} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export function seasonRange(years: number[]) {
  const parts: string[] = []
  let start = years[0], prev = years[0]
  for (const y of [...years.slice(1), NaN]) {
    if (y === prev + 1) { prev = y; continue }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`)
    start = prev = y
  }
  return parts.join(', ')
}

export const signed = (n: number) => (n > 0 ? '+' : '') + fmt(n)
