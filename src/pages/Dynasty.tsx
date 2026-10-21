import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLeague } from '../lib/data'
import { teamRankings } from '../lib/teamRank'
import { money, valuationsOf } from '../lib/valuation'
import { fmt, ordinal, type TeamSeason } from '../lib/stats'
import { Card, MemberLink, Stat, Table, Tabs, type Col } from '../components/ui'
import { PALETTE } from './History'

// Dynasty points: title 5, runner-up 3, third 2, any other playoff trip 1.
const DYN_TIP = 'Dynasty points: 5 per title, 3 per runner-up, 2 per third place, 1 per other playoff trip.'
const METRICS = ['Franchise Value', 'Legacy Score', 'Elo', 'Finish'] as const
type Metric = (typeof METRICS)[number]

function cellTone(t: TeamSeason, s: { champion: string | null; runnerUp: string | null; third: string | null; toiletBowlLoser: string | null; complete: boolean }) {
  if (!s.complete) return 'live'
  if (s.champion === t.memberId) return 'gold'
  if (s.runnerUp === t.memberId) return 'silver'
  if (s.third === t.memberId) return 'bronze'
  if (s.toiletBowlLoser === t.memberId) return 'last'
  return t.madePlayoffs ? 'playoff' : 'miss'
}

export default function Dynasty() {
  const lg = useLeague()
  const [metric, setMetric] = useState<Metric>('Franchise Value')
  const seasons = [...lg.seasons].sort((a, b) => a.year - b.year)
  const vals = valuationsOf(lg)
  const legacy = useMemo(() => Object.fromEntries(teamRankings(lg).map((r) => [`${r.t.season}|${r.t.memberId}`, r.score])), [lg])

  const rows = lg.members.map((m) => {
    const ts = seasons.map((s) => ({ s, t: s.teamSeasons.find((t) => t.memberId === m.id) }))
    const done = ts.filter((x) => x.t && x.s.complete)
    const pts = done.reduce((a, { s, t }) => a + (s.champion === m.id ? 5 : s.runnerUp === m.id ? 3 : s.third === m.id ? 2 : t!.madePlayoffs ? 1 : 0), 0)
    let streak = 0, best = 0
    for (const { t } of done) { streak = t!.madePlayoffs ? streak + 1 : 0; best = Math.max(best, streak) }
    const v = vals[m.id] ?? []
    return {
      id: m.id, ts, pts,
      titles: done.filter(({ s }) => s.champion === m.id).length,
      finals: done.filter(({ s }) => s.champion === m.id || s.runnerUp === m.id).length,
      playoffs: done.filter(({ t }) => t!.madePlayoffs).length,
      seasons: done.length,
      avgFinish: done.reduce((a, { t }) => a + (t!.finalRank ?? t!.regRank), 0) / (done.length || 1),
      streak: best,
      value: v.at(-1)?.value ?? 0,
      growth: v.length > 1 ? (v.at(-1)!.value / v[0].value - 1) * 100 : null,
      avgLegacy: done.reduce((a, { s }) => a + (legacy[`${s.year}|${m.id}`] ?? 0), 0) / (done.length || 1),
    }
  }).filter((r) => r.ts.some((x) => x.t)).sort((a, b) => b.pts - a.pts || b.avgLegacy - a.avgLegacy)

  const name = (id: string) => lg.memberById[id]?.name ?? id
  const top = rows[0]
  const richest = [...rows].sort((a, b) => b.value - a.value)[0]
  const grower = [...rows].filter((r) => r.growth != null).sort((a, b) => b.growth! - a.growth!)[0]
  const streaky = [...rows].sort((a, b) => b.streak - a.streak)[0]

  const getter: Record<Metric, (id: string, year: number) => number | null> = {
    'Franchise Value': (id, y) => vals[id]?.find((v) => v.year === y)?.value ?? null,
    'Legacy Score': (id, y) => (legacy[`${y}|${id}`] != null ? +legacy[`${y}|${id}`].toFixed(1) : null),
    Elo: (id, y) => { const t = lg.seasons.find((s) => s.year === y)?.teamSeasons.find((t) => t.memberId === id); return t ? t.eloEnd : null },
    Finish: (id, y) => { const s = lg.seasons.find((x) => x.year === y); const t = s?.teamSeasons.find((t) => t.memberId === id); return s?.complete && t ? t.finalRank ?? t.regRank : null },
  }
  const chartYears = seasons.filter((s) => metric === 'Elo' || s.complete)
  const chart = chartYears.map((s) => ({ season: String(s.year), ...Object.fromEntries(rows.map((r) => [r.id, getter[metric](r.id, s.year)])) }))

  const cols: Col<(typeof rows)[number]>[] = [
    { key: 'm', label: 'Franchise', render: (r) => <MemberLink id={r.id} /> },
    { key: 'p', label: 'Dynasty Pts', render: (r) => <b>{r.pts}</b>, sort: (r) => r.pts, align: 'right', tip: DYN_TIP },
    { key: 't', label: 'Titles', render: (r) => r.titles || '—', sort: (r) => r.titles, align: 'right' },
    { key: 'f', label: 'Finals', render: (r) => r.finals || '—', sort: (r) => r.finals, align: 'right' },
    { key: 'po', label: 'Playoffs', render: (r) => `${r.playoffs}/${r.seasons}`, sort: (r) => r.playoffs / (r.seasons || 1), align: 'right' },
    { key: 'st', label: 'Best Streak', render: (r) => (r.streak ? `${r.streak} yr` : '—'), sort: (r) => r.streak, align: 'right' },
    { key: 'af', label: 'Avg Finish', render: (r) => fmt(r.avgFinish, 1), sort: (r) => -r.avgFinish, align: 'right' },
    { key: 'l', label: 'Avg Legacy', render: (r) => fmt(r.avgLegacy, 1), sort: (r) => r.avgLegacy, align: 'right' },
    { key: 'v', label: 'Value', render: (r) => money(r.value), sort: (r) => r.value, align: 'right' },
    { key: 'g', label: 'Value Growth', render: (r) => (r.growth == null ? '—' : <span className={r.growth >= 0 ? 'pos' : 'neg'}>{r.growth >= 0 ? '+' : ''}{fmt(r.growth, 0)}%</span>), sort: (r) => r.growth ?? -999, align: 'right' },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dynasty Timeline</h1>
          <p className="muted">Every franchise, every season: who built something and who’s still rebuilding.</p>
        </div>
      </div>
      <div className="stat-grid">
        <Stat icon="crown" label={`Top dynasty · ${top.pts} pts`} value={name(top.id)} tip={DYN_TIP} />
        <Stat icon="dollar" label={`Most valuable · ${money(richest.value)}`} value={name(richest.id)} />
        {grower && <Stat icon="rocket" label={`Fastest riser · +${fmt(grower.growth!, 0)}% value`} value={name(grower.id)} tone="pos" />}
        <Stat icon="repeat" label={`Longest playoff streak · ${streaky.streak} yr`} value={name(streaky.id)} />
      </div>

      <Card title="Timeline" sub="Finish each season. Gold/silver/bronze = podium, green = playoffs, red = last place.">
        <div className="table-wrap">
          <table className="timeline">
            <thead><tr><th>Franchise</th>{seasons.map((s) => <th key={s.year} className="center"><Link to={`/recap/${s.year}`}>{s.year}</Link></th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><MemberLink id={r.id} /></td>
                  {r.ts.map(({ s, t }) => (
                    <td key={s.year} className="center">
                      {t ? (
                        <Link to={`/season/${s.year}/team/${r.id}`} className={`tl-cell ${cellTone(t, s)}`} title={t.teamName}>
                          <b>{s.complete ? ordinal(t.finalRank ?? t.regRank) : `${ordinal(t.regRank)}*`}</b>
                          <span>{t.wins}-{t.losses}</span>
                        </Link>
                      ) : <span className="muted">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>* current season: regular-season standing so far.</p>
      </Card>

      <Card title="Over Time" right={<Tabs tabs={METRICS} value={metric} onChange={setMetric} />}>
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={chart}>
            <CartesianGrid stroke="var(--grid)" />
            <XAxis dataKey="season" stroke="var(--muted)" />
            <YAxis stroke="var(--muted)" padding={{ top: 8, bottom: 8 }} reversed={metric === 'Finish'} domain={metric === 'Finish' ? [1, 'dataMax'] : ['auto', 'auto']} allowDecimals={metric !== 'Finish'}
              tickFormatter={(v) => (metric === 'Franchise Value' ? money(v) : String(v))} />
            <Tooltip contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }} formatter={(v) => (metric === 'Franchise Value' ? money(Number(v)) : String(v))}
              itemSorter={(x) => (metric === 'Finish' ? 1 : -1) * Number(x.value)} />
            <Legend />
            {rows.map((r, i) => <Line key={r.id} dataKey={r.id} name={name(r.id)} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Dynasty Standings">
        <Table rows={rows} cols={cols} initialSort="p" rowKey={(r) => r.id} />
      </Card>
    </div>
  )
}
