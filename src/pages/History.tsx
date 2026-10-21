import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLeague } from '../lib/data'
import { careers, fmt, pct, record, type CareerRow, type League, type Season, type TeamSeason } from '../lib/stats'
import { Avatar, Card, MemberLink, Table, Tabs, Tip, Trophies, TIPS, type Col } from '../components/ui'
import { franchiseElo, tierOf, TIERS } from '../lib/elo'
import { teamRankings, type TeamRank } from '../lib/teamRank'

export const PALETTE = ['#7c8cff', '#3ddc97', '#f2c35b', '#ff7a8a', '#a78bfa', '#5ec8f2', '#ff9f5a', '#c6e66b', '#f0abfc', '#8a93a6', '#4fd1c5', '#e8b4b8']

const STANDINGS_TABS = ['All-Time', 'Playoffs', 'Advanced'] as const
const SEASON_TABS = ['Champions', 'Chumpions'] as const
const METRICS = {
  Elo: { get: (t: TeamSeason) => t.eloEnd, reversed: false },
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
  const [metric, setMetric] = useState<Metric>('Elo')
  const winPct = (w: number, l: number, t = 0) => (w + t / 2) / (w + l + t || 1)
  const base: Col<CareerRow>[] = [
    { key: 'rank', label: '#', render: (_r, i) => i + 1 },
    { key: 'team', label: 'Member', render: (r) => <MemberLink id={r.member.id} />, sort: (r) => r.member.name.toLowerCase() },
  ]
  const seasonsCol: Col<CareerRow> = { key: 'seasons', label: 'Seasons', render: (r) => `${seasonRange(r.seasons)} (${r.seasons.length})`, sort: (r) => r.seasons.length }
  const cols: Record<typeof tab, Col<CareerRow>[]> = {
    'All-Time': [
      ...base,
      { key: 'rec', label: 'Record', render: (r) => record(r.wins, r.losses, r.ties), sort: (r) => r.wins - r.losses / 1000, tip: TIPS.median },
      { key: 'pct', label: 'Win %', render: (r) => pct(r.wins, r.losses, r.ties), sort: (r) => winPct(r.wins, r.losses, r.ties) },
      { key: 'ap', label: 'All-Play', render: (r) => record(r.apW, r.apL, r.apT), sort: (r) => r.apW - r.apL / 1000, tip: TIPS.allPlay },
      { key: 'appct', label: 'All-Play %', render: (r) => pct(r.apW, r.apL, r.apT), sort: (r) => winPct(r.apW, r.apL, r.apT) },
      { key: 'elo', label: 'Elo', render: (r) => <b>{r.elo}</b>, sort: (r) => r.elo, tip: TIPS.elo },
      { key: 'troph', label: 'Trophies', render: (r) => <Trophies gold={r.titles} silver={r.seconds} bronze={r.thirds} />, sort: (r) => r.titles * 100 + r.seconds * 10 + r.thirds },
    ],
    Playoffs: [
      ...base,
      { key: 'apps', label: 'Appearances', render: (r) => r.playoffs, sort: (r) => r.playoffs },
      { key: 'prec', label: 'Playoff Record', render: (r) => record(r.playoffW, r.playoffL), sort: (r) => r.playoffW - r.playoffL / 1000, tip: 'Winners-bracket games, excluding the 5th-place game.' },
      { key: 'ppct', label: 'Playoff Win %', render: (r) => pct(r.playoffW, r.playoffL), sort: (r) => winPct(r.playoffW, r.playoffL) },
      { key: 'titles', label: 'Titles', render: (r) => r.titles, sort: (r) => r.titles },
      { key: 'finals', label: 'Finals', render: (r) => r.titles + r.seconds, sort: (r) => r.titles + r.seconds },
      { key: 'avgf', label: 'Avg Finish', render: (r) => (r.avgFinish != null ? r.avgFinish.toFixed(1) : '—'), sort: (r) => r.avgFinish ?? 99, tip: 'Lower is better.' },
    ],
    Advanced: [
      ...base,
      seasonsCol,
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
        sub="Every manager's all-time numbers. Click a column header to sort; click again to flip high/low."
      >
        <Tabs tabs={STANDINGS_TABS} value={tab} onChange={setTab} />
        <Table key={tab} rows={rows} cols={cols[tab]} initialSort={{ 'All-Time': 'elo', Playoffs: 'apps', Advanced: 'ppg' }[tab]} rowKey={(r) => r.member.id} />
      </Card>

      <TeamRankings lg={lg} />

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

      <Card title="Elo Ratings" sub="Every franchise's Elo after every week, all-time. Dashed lines mark the tiers (Dynasty 2200, Contender 1800, Average 1450); each season starts after a 10% pull toward 1750." right={<Tip text={TIPS.elo} />}>
        <EloChart lg={lg} />
      </Card>
    </div>
  )
}

function EloChart({ lg }: { lg: League }) {
  const e = franchiseElo(lg)
  const ids = Object.entries(e.current).sort((a, b) => b[1] - a[1]).map(([id]) => id)
  const keys = [...new Set(Object.values(e.history).flat().map((p) => p.season * 100 + p.week))].sort((a, b) => a - b)
  const data = keys.map((k) => {
    const season = Math.floor(k / 100), week = k % 100
    const row: Record<string, number | string | null> = { key: week === 0 ? `${season}` : `${String(season).slice(2)} W${week}`, season }
    for (const id of ids) row[id] = e.history[id]?.find((p) => p.season === season && p.week === week)?.rating ?? null
    return row
  })
  const starts = data.filter((d) => !String(d.key).includes('W')).map((d) => d.key as string)
  return (
    <>
      <div className="elo-chips">
        {ids.map((id, i) => (
          <Link key={id} to={`/member/${id}`} className="elo-chip">
            <span className="muted">{i + 1}</span><Avatar id={id} size={18} /><span>{lg.memberById[id]?.name}</span>
            <b>{e.current[id]}</b><span className={`tier-tag ${tierOf(e.current[id]).toLowerCase()}`}>{tierOf(e.current[id])}</span>
          </Link>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="key" stroke="var(--muted)" ticks={starts} interval={0} />
          <YAxis stroke="var(--muted)" domain={[(m: number) => Math.floor((m - 25) / 250) * 250, (m: number) => Math.ceil((m + 25) / 250) * 250]} tickCount={8} allowDecimals={false} width={48} />
          {starts.map((s) => <ReferenceLine key={s} x={s} stroke="var(--border-strong)" />)}
          {TIERS.filter((t) => t.min > 0).map((t) => <ReferenceLine key={t.name} y={t.min} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: t.name, position: 'insideTopLeft', fill: 'var(--muted)', fontSize: 10 }} />)}
          <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)' }} itemSorter={(item) => -Number(item.value ?? 0)} />
          <Legend />
          {ids.map((id, i) => (
            <Line key={id} dataKey={id} name={lg.memberById[id]?.name} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}

function SeasonTable({ lg, mode }: { lg: League; mode: 'Champions' | 'Chumpions' }) {
  const awards = (pick: (ts: TeamSeason[]) => TeamSeason | undefined) => (s: Season) => pick(s.teamSeasons)?.memberId ?? null
  const maxBy = (f: (t: TeamSeason) => number) => (ts: TeamSeason[]) => [...ts].sort((a, b) => f(b) - f(a))[0]
  const minBy = (f: (t: TeamSeason) => number) => (ts: TeamSeason[]) => [...ts].sort((a, b) => f(a) - f(b))[0]
  const champCols = [
    { label: 'Champion', get: awards((ts) => ts.find((t) => t.finalRank === 1)) },
    { label: 'Runner-up', get: awards((ts) => ts.find((t) => t.finalRank === 2)) },
    { label: 'Third', get: awards((ts) => ts.find((t) => t.finalRank === 3)) },
    { label: 'Reg. Season', get: awards((ts) => ts.find((t) => t.regRank === 1)) },
    { label: 'Points Leader', get: awards(maxBy((t) => t.pf)) },
    { label: 'All-Play Leader', get: awards(maxBy((t) => t.apW)) },
  ]
  const chumpCols = [
    { label: 'Reg. Season Last', get: awards((ts) => ts.find((t) => t.regRank === ts.length)) },
    { label: 'Toilet Bowl Loser', get: (s: Season) => s.toiletBowlLoser },
    { label: 'Fewest Points', get: awards(minBy((t) => t.pf)) },
    { label: 'Worst All-Play', get: awards(minBy((t) => t.apW)) },
    { label: 'Most Points Against', get: awards(maxBy((t) => t.pa)) },
    { label: 'Unluckiest', get: awards(minBy((t) => t.luck)) },
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
                const id = c.get(s)
                const placement = ['Champion', 'Runner-up', 'Third', 'Toilet Bowl Loser'].includes(c.label)
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
        <Tooltip
          contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
          // Best first: highest value on top, except rank where 1st is best.
          itemSorter={(item) => (reversed ? 1 : -1) * Number(item.value ?? 0)}
        />
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

const RANK_TIP = 'Legacy Score (0–100). Finish 20% (champion 100, last 0) · Regular Season 10% (seed and win %) · Dominance 30% (PPG, all-play %, avg margin) · Talent 25% (starting-lineup points over replacement) · Consistency 15% (weekly floor, median-beat rate). Everything except Finish is compared against teams from the same season, where 50 = average.'

function Meter({ v }: { v: number }) {
  return (
    <span className="meter" title={`${v}/100`}>
      <span className="meter-track"><span className="meter-bar" style={{ width: `${v}%`, background: v >= 60 ? 'var(--pos)' : v <= 40 ? 'var(--neg)' : 'var(--accent)' }} /></span>
      <span className="meter-num">{v}</span>
    </span>
  )
}

function TeamRankings({ lg }: { lg: League }) {
  const all = teamRankings(lg)
  const [view, setView] = useState<'Best 15' | 'Worst 15'>('Best 15')
  const rows = view === 'Best 15' ? all.slice(0, 15) : [...all].reverse().slice(0, 15)
  const place = new Map(all.map((r, i) => [r, i + 1]))
  const cols: Col<TeamRank>[] = [
    { key: 'rk', label: '#', render: (r) => <b>{place.get(r)}</b>, sort: (r) => -place.get(r)! },
    {
      key: 'team', label: 'Team', sort: (r) => r.t.teamName.toLowerCase(),
      render: (r) => (
        <Link to={`/season/${r.t.season}/team/${r.t.memberId}`} className="member-link">
          <Avatar id={r.t.memberId} />
          <span>{r.t.teamName}<span className="muted small"> · {lg.memberById[r.t.memberId]?.name}</span></span>
        </Link>
      ),
    },
    { key: 'yr', label: 'Season', render: (r) => r.t.season, sort: (r) => r.t.season },
    { key: 'fin', label: 'Place', render: (r) => <RankFinish r={r} lg={lg} />, sort: (r) => -(r.t.finalRank ?? 99) },
    { key: 'rec', label: 'Record', render: (r) => record(r.t.wins, r.t.losses, r.t.ties), sort: (r) => r.t.wins - r.t.losses / 1000 },
    { key: 'ppg', label: 'PPG', render: (r) => fmt(r.ppg), sort: (r) => r.ppg, align: 'right' },
    { key: 'fin2', label: 'Finish', render: (r) => <Meter v={Math.round(r.finish)} />, sort: (r) => r.finish, tip: '20% · Exact final finish: champion 100, last 0.' },
    { key: 'reg', label: 'Reg. Season', render: (r) => <Meter v={Math.round(r.regular)} />, sort: (r) => r.regular, tip: '10% · Regular-season seed and win %.' },
    { key: 'dom', label: 'Dominance', render: (r) => <Meter v={Math.round(r.dominance)} />, sort: (r) => r.dominance, tip: '30% · Points per game, all-play win %, average margin.' },
    { key: 'tal', label: 'Talent', render: (r) => <Meter v={Math.round(r.talent)} />, sort: (r) => r.talent, tip: '25% · Starting-lineup points over replacement level.' },
    { key: 'con', label: 'Consistency', render: (r) => <Meter v={Math.round(r.consistency)} />, sort: (r) => r.consistency, tip: '15% · Weekly scoring floor and median-beat rate.' },
    { key: 'score', label: 'Legacy Score', render: (r) => <span className="legacy-score">{r.score.toFixed(1)}</span>, sort: (r) => r.score, align: 'right', tip: RANK_TIP },
  ]
  return (
    <Card title="Team Rankings" sub={`The best and worst single-season teams in league history (${all.length} completed team-seasons). Click a column to sort.`}>
      <Tabs tabs={['Best 15', 'Worst 15'] as const} value={view} onChange={setView} />
      <Table key={view} rows={rows} cols={cols} initialSort="score" initialAsc={view === 'Worst 15'} rowKey={(r) => `${r.t.season}-${r.t.memberId}`} />
      {all.length < 30 && <p className="muted small" style={{ marginTop: 12 }}>With {all.length} completed team-seasons so far, the two lists overlap. They’ll separate as more seasons finish.</p>}
    </Card>
  )
}

function RankFinish({ r, lg }: { r: TeamRank; lg: League }) {
  const s = lg.seasons.find((x) => x.year === r.t.season)!
  const f = r.t.finalRank!
  const cls = f === 1 ? 'gold' : f === 2 ? 'silver' : f === 3 ? 'bronze' : ''
  return <span className={`rank ${cls}`}>{f === 1 ? 'Champ' : s.toiletBowlLoser === r.t.memberId ? 'Toilet' : f}</span>
}
