import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLeague } from '../lib/data'
import { powerRankings, scheduleLuck, type LuckRow, type PowerRow } from '../lib/weekly'
import { fmt, record } from '../lib/stats'
import { Card, MemberLink, Stat, Table, Tabs, type Col } from '../components/ui'
import { PALETTE, signed } from './History'

const T = {
  score: 'Power score 0–100: all-play win % (35%, recent weeks weighted), points per game percentile (25%), record incl. median games (20%), and next week’s best-lineup roster projection (20%, when projections exist).',
  allPlay: 'Share of the league you’d have beaten, every week, if you played everyone.',
  roster: 'Best possible lineup next week from the roster, from Sleeper projections blended with actual points.',
  swap: 'Head-to-head wins if you’d had that team’s schedule: your score each week against the opponent they faced. Median games are left out — they don’t depend on the schedule.',
  expected: 'All-play expected wins: each week, the share of the league you outscored.',
}

function Move({ r }: { r: PowerRow }) {
  if (r.prev == null) return <span className="muted">–</span>
  const d = r.prev - r.rank
  if (d === 0) return <span className="muted">—</span>
  return <span className={d > 0 ? 'pos' : 'neg'} style={{ fontWeight: 700 }}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}</span>
}

export default function Power() {
  const lg = useLeague()
  const [year, setYear] = useState(lg.seasons[0].year)
  const [tab, setTab] = useState<'Power Rankings' | 'Schedule Luck'>('Power Rankings')
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Power Rankings</h1>
          <p className="muted">Re-ranked after every week, plus how much the schedule helped or hurt.</p>
        </div>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {lg.seasons.map((s) => <option key={s.year}>{s.year}</option>)}
        </select>
      </div>
      <Tabs tabs={['Power Rankings', 'Schedule Luck'] as const} value={tab} onChange={setTab} />
      {tab === 'Power Rankings' ? <Rankings year={year} /> : <Luck year={year} />}
    </div>
  )
}

function Rankings({ year }: { year: number }) {
  const lg = useLeague()
  const weeks = useMemo(() => powerRankings(lg, year), [lg, year])
  const [sel, setSel] = useState<number | null>(null)
  if (!weeks.length) return <p className="muted">No games yet.</p>
  const k = sel == null || sel >= weeks.length ? weeks.length - 1 : sel
  const cur = weeks[k]
  const name = (id: string) => lg.memberById[id]?.name ?? id
  const moves = cur.rows.filter((r) => r.prev != null).map((r) => ({ r, d: r.prev! - r.rank }))
  const riser = [...moves].sort((a, b) => b.d - a.d)[0], faller = [...moves].sort((a, b) => a.d - b.d)[0]
  const top = cur.rows[0]
  const hot = [...cur.rows].sort((a, b) => b.recent - a.recent)[0]
  const ids = weeks[weeks.length - 1].rows.map((r) => r.memberId)
  const bump = weeks.map((w) => ({ week: `W${w.week}`, ...Object.fromEntries(w.rows.map((r) => [r.memberId, r.rank])) }))
  const n = cur.rows.length

  const cols: Col<PowerRow>[] = [
    { key: 'rk', label: '#', render: (r) => <b>{r.rank}</b>, sort: (r) => -r.rank, align: 'center' },
    { key: 'mv', label: 'Move', render: (r) => <Move r={r} />, sort: (r) => (r.prev ?? r.rank) - r.rank, align: 'center' },
    { key: 'm', label: 'Team', render: (r) => <MemberLink id={r.memberId} /> },
    { key: 'sc', label: 'Power', render: (r) => <span style={{ whiteSpace: 'nowrap' }}><b>{fmt(r.score, 1)}</b><span className="odds-bar" style={{ width: Math.round(r.score / 2) }} /></span>, sort: (r) => r.score, align: 'right', tip: T.score },
    { key: 'rec', label: 'Record', render: (r) => record(r.wins, r.losses), sort: (r) => r.wins - r.losses / 100, align: 'right' },
    { key: 'ap', label: 'All-Play', render: (r) => `${Math.round(r.allPlay * 100)}%`, sort: (r) => r.allPlay, align: 'right', tip: T.allPlay },
    { key: 'ppg', label: 'PPG', render: (r) => fmt(r.ppg, 1), sort: (r) => r.ppg, align: 'right' },
    { key: 'l3', label: 'Last 3', render: (r) => fmt(r.recent, 1), sort: (r) => r.recent, align: 'right' },
    { key: 'wk', label: `W${cur.week}`, render: (r) => <span>{fmt(r.weekPts, 1)} <span className="muted">({r.weekRank})</span></span>, sort: (r) => r.weekPts, align: 'right' },
    ...(cur.rows.some((r) => r.roster != null) ? [{ key: 'ro', label: 'Roster Proj', render: (r: PowerRow) => (r.roster != null ? fmt(r.roster, 1) : '—'), sort: (r: PowerRow) => r.roster ?? 0, align: 'right' as const, tip: T.roster }] : []),
  ]

  return (
    <>
      <div className="stat-grid">
        <Stat icon="crown" label={`No. 1 after week ${cur.week} · ${fmt(top.score, 1)}`} value={name(top.memberId)} tip={T.score} />
        {riser && riser.d > 0 && <Stat icon="rocket" label={`Biggest riser · ▲${riser.d}`} value={name(riser.r.memberId)} tone="pos" />}
        {faller && faller.d < 0 && <Stat icon="bomb" label={`Biggest faller · ▼${-faller.d}`} value={name(faller.r.memberId)} tone="neg" />}
        <Stat icon="flame" label={`Hottest · ${fmt(hot.recent, 1)} over last 3`} value={name(hot.memberId)} />
      </div>
      <Card title={`Week ${cur.week} Rankings`} sub="Drag to see any week" right={<span className="muted">Week {cur.week}</span>}>
        <input type="range" min={0} max={weeks.length - 1} value={k} className="odds-range" onChange={(e) => setSel(Number(e.target.value))} />
        <Table rows={cur.rows} cols={cols} initialSort="rk" rowKey={(r) => r.memberId} />
      </Card>
      <Card title="Rank by Week" sub="Hover a week to see the order">
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={bump} margin={{ right: 16 }}>
            <CartesianGrid stroke="var(--grid)" />
            <XAxis dataKey="week" stroke="var(--muted)" />
            <YAxis reversed domain={[1, n]} padding={{ top: 8, bottom: 8 }} interval={0} ticks={Array.from({ length: n }, (_, i) => i + 1)} stroke="var(--muted)" allowDecimals={false} />
            <Tooltip contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }} itemSorter={(x) => x.value as number} />
            {ids.map((id, i) => <Line key={id} dataKey={id} name={name(id)} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
        <div className="legend-row">
          {ids.map((id, i) => <span key={id}><i style={{ background: PALETTE[i % PALETTE.length] }} />{name(id)}</span>)}
        </div>
      </Card>
    </>
  )
}

function Luck({ year }: { year: number }) {
  const lg = useLeague()
  const sl = useMemo(() => scheduleLuck(lg, year), [lg, year])
  if (!sl) return <p className="muted">No games yet.</p>
  const name = (id: string) => lg.memberById[id]?.name ?? id
  const lucky = sl.rows[0], unlucky = sl.rows[sl.rows.length - 1]
  const robbed = [...sl.rows].sort((a, b) => (b.avgSwap - b.actual) - (a.avgSwap - a.actual))[0]
  const cols: Col<LuckRow>[] = [
    { key: 'm', label: 'Team', render: (r) => <MemberLink id={r.memberId} /> },
    { key: 'a', label: 'H2H Record', render: (r) => record(r.actual, r.games - r.actual), sort: (r) => r.actual, align: 'right' },
    { key: 'e', label: 'Expected', render: (r) => record(+r.expected.toFixed(1), +(r.games - r.expected).toFixed(1)), sort: (r) => r.expected, align: 'right', tip: T.expected },
    { key: 'l', label: 'Luck', render: (r) => <span className={r.luck >= 0 ? 'pos' : 'neg'}>{signed(r.luck)}</span>, sort: (r) => r.luck, align: 'right' },
    { key: 's', label: 'Avg Any Schedule', render: (r) => fmt(r.avgSwap, 1), sort: (r) => r.avgSwap, align: 'right', tip: T.swap },
    { key: 'b', label: 'Best Schedule', render: (r) => <span>{r.best.wins} W <span className="muted">({name(r.best.id)})</span></span>, sort: (r) => r.best.wins, align: 'right' },
    { key: 'w', label: 'Worst Schedule', render: (r) => <span>{r.worst.wins} W <span className="muted">({name(r.worst.id)})</span></span>, sort: (r) => r.worst.wins, align: 'right' },
    { key: 'r', label: 'Your Schedule Ranks', render: (r) => `${sl.ids.length - r.rankAmong} of ${sl.ids.length}`, sort: (r) => r.rankAmong, align: 'right', tip: 'Where your own schedule ranks among all of them for you (1 = the best one you could have had).' },
  ]
  const heat = (d: number) => (d === 0 ? {} : { background: d > 0 ? `rgba(61, 220, 151, ${Math.min(0.6, d * 0.15)})` : `rgba(255, 122, 138, ${Math.min(0.6, -d * 0.15)})` })
  return (
    <>
      <div className="stat-grid">
        <Stat icon="star" label={`Luckiest · ${signed(lucky.luck)} wins vs expected`} value={name(lucky.memberId)} tone="pos" tip={T.expected} />
        <Stat icon="bomb" label={`Unluckiest · ${signed(unlucky.luck)} wins`} value={name(unlucky.memberId)} tone="neg" />
        <Stat icon="target" label={`Most robbed by schedule · ${signed(robbed.avgSwap - robbed.actual)} wins`} value={name(robbed.memberId)} tip={T.swap} />
      </div>
      <Card title="Schedule Luck" sub={`${sl.games} weeks of head-to-head games`}>
        <Table rows={sl.rows} cols={cols} initialSort="l" rowKey={(r) => r.memberId} />
      </Card>
      <Card title="Schedule Swap" sub="Rows: team. Columns: whose schedule. Each cell is the head-to-head wins they'd have; green beats their real record, red is worse.">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Team ↓ / Schedule →</th>{sl.ids.map((b) => <th key={b} className="center">{name(b)}</th>)}</tr></thead>
            <tbody>
              {sl.ids.map((a) => (
                <tr key={a}>
                  <td><MemberLink id={a} /></td>
                  {sl.ids.map((b) => {
                    const v = sl.matrix[a][b], d = v - sl.matrix[a][a]
                    return <td key={b} className="center" style={{ ...heat(d), fontWeight: a === b ? 800 : undefined, outline: a === b ? '2px solid var(--border-strong)' : undefined }}>{v}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
