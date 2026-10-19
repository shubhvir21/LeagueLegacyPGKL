import { useState } from 'react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { useLeague } from '../lib/data'
import { playersOf, type Pick } from '../lib/players'
import { careers, fmt } from '../lib/stats'
import { Card, MemberLink, Stat, Table, type Col } from '../components/ui'
import { PlayerLink, PosFilter } from '../components/PlayerLink'
import { signed } from './History'

const VALUE_TIP = 'Value = player points that season minus a replacement-level player at his position (floored at 0). Surplus = value minus the average value of non-keeper picks in that round.'

export default function Draft() {
  const lg = useLeague()
  const pm = playersOf(lg)
  const [season, setSeason] = useState<string>('Overview')
  const [member, setMember] = useState<string>('ALL')
  const [pos, setPos] = useState('ALL')
  const pos_ = (p: Pick) => pm.info[p.playerId]?.pos ?? '?'
  const scoped = pm.picks.filter((p) => (season === 'Overview' || p.season === Number(season)) && (member === 'ALL' || p.memberId === member))
  const valued = scoped.filter((p) => !p.pending)
  const posScoped = valued.filter((p) => pos === 'ALL' || pos_(p) === pos)
  const keepers = scoped.filter((p) => p.keeper)
  const draftYears = [...new Set(pm.picks.map((p) => p.season))].sort((a, b) => b - a)

  const pickCols: Col<Pick>[] = [
    { key: 'pl', label: 'Player', render: (p) => <PlayerLink id={p.playerId} /> },
    { key: 'pick', label: 'Pick', render: (p) => `${p.season} · R${p.round} (#${p.pickNo})${p.keeper ? ' 🔒' : ''}` },
    { key: 'by', label: 'Drafted By', render: (p) => <MemberLink id={p.memberId} /> },
    { key: 'v', label: 'Value', render: (p) => fmt(p.value), sort: (p) => p.value, align: 'right', tip: VALUE_TIP },
    { key: 's', label: 'Surplus', render: (p) => <b className={p.surplus >= 0 ? 'pos' : 'neg'}>{signed(p.surplus)}</b>, sort: (p) => p.surplus, align: 'right' },
  ]
  const rankRows = careers(lg).map((r) => {
    const mine = pm.picks.filter((p) => p.memberId === r.member.id && !p.pending && (season === 'Overview' || p.season === Number(season)))
    const fresh = mine.filter((p) => !p.keeper)
    const k = mine.filter((p) => p.keeper)
    return {
      id: r.member.id, n: mine.length,
      avg: mine.length ? mine.reduce((a, p) => a + p.surplus, 0) / mine.length : 0,
      total: mine.reduce((a, p) => a + p.value, 0),
      freshAvg: fresh.length ? fresh.reduce((a, p) => a + p.surplus, 0) / fresh.length : 0,
      keeperAvg: k.length ? k.reduce((a, p) => a + p.surplus, 0) / k.length : null,
      hits: fresh.filter((p) => p.surplus > 0).length,
    }
  })
  const rankCols: Col<(typeof rankRows)[number]>[] = [
    { key: 'm', label: 'Member', render: (r) => <MemberLink id={r.id} /> },
    { key: 'avg', label: 'Avg Surplus / Pick', render: (r) => <b className={r.avg >= 0 ? 'pos' : 'neg'}>{signed(r.avg)}</b>, sort: (r) => r.avg, align: 'right' },
    { key: 'fresh', label: 'Drafted Picks', render: (r) => signed(r.freshAvg), sort: (r) => r.freshAvg, align: 'right', tip: 'Avg surplus on non-keeper picks.' },
    { key: 'keep', label: 'Keepers', render: (r) => (r.keeperAvg != null ? signed(r.keeperAvg) : '—'), sort: (r) => r.keeperAvg ?? -999, align: 'right', tip: 'Avg surplus of kept players vs. the round they cost.' },
    { key: 'hits', label: 'Hits', render: (r) => `${r.hits}`, sort: (r) => r.hits, align: 'right', tip: 'Non-keeper picks that beat their round average.' },
    { key: 'tot', label: 'Total Value', render: (r) => fmt(r.total), sort: (r) => r.total, align: 'right' },
  ]
  const scatter = lg.seasons.filter((s) => s.complete).flatMap((s) =>
    s.teamSeasons.map((t) => {
      const mine = pm.picks.filter((p) => p.season === s.year && p.memberId === t.memberId)
      return { x: +(mine.reduce((a, p) => a + p.surplus, 0) / (mine.length || 1)).toFixed(2), y: t.finalRank!, name: `${lg.memberById[t.memberId]?.name} ${s.year}` }
    }),
  )
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

  return (
    <div className="page">
      <div className="page-head">
        <h1>The Draft</h1>
        <div className="row">
          <select value={season} onChange={(e) => setSeason(e.target.value)}>
            <option>Overview</option>
            {draftYears.map((y) => <option key={y}>{y}</option>)}
          </select>
          <select value={member} onChange={(e) => setMember(e.target.value)}>
            <option value="ALL">All franchises</option>
            {careers(lg).map((r) => <option key={r.member.id} value={r.member.id}>{r.member.name}</option>)}
          </select>
        </div>
      </div>
      {season !== 'Overview' && scoped.some((p) => p.pending) && <div className="banner">The {season} season is in progress — pick values appear once it's complete.</div>}
      <div className="stat-grid">
        <Stat label="Picks" value={scoped.length} />
        <Stat label="Keepers" value={keepers.length} icon="🔒" />
        <Stat label="Avg pick value" value={fmt(avg(valued.map((p) => p.value)))} tip={VALUE_TIP} />
        <Stat label="Avg keeper surplus" value={signed(avg(valued.filter((p) => p.keeper).map((p) => p.surplus)))} />
        <Stat label="Avg keeper round" value={keepers.length ? avg(keepers.map((p) => p.round)).toFixed(1) : '—'} />
        <Stat label="Hit rate (drafted)" value={`${Math.round((valued.filter((p) => !p.keeper && p.surplus > 0).length / (valued.filter((p) => !p.keeper).length || 1)) * 100)}%`} tip="Share of non-keeper picks that beat their round average." />
      </div>

      <Card title="Draft Rankings" sub="Members ranked by average surplus per pick.">
        <Table rows={rankRows.filter((r) => r.n)} cols={rankCols} initialSort="avg" rowKey={(r) => r.id} />
      </Card>

      <div className="two-col">
        <Card title="Best Picks" sub="Highest surplus over their round.">
          <PosFilter value={pos} onChange={setPos} />
          <Table rows={[...posScoped].sort((a, b) => b.surplus - a.surplus).slice(0, 10)} cols={pickCols} rowKey={(p) => `${p.season}-${p.pickNo}`} />
        </Card>
        <Card title="Worst Picks" sub="Lowest surplus versus their round.">
          <PosFilter value={pos} onChange={setPos} />
          <Table rows={[...posScoped].sort((a, b) => a.surplus - b.surplus).slice(0, 10)} cols={pickCols} rowKey={(p) => `${p.season}-${p.pickNo}`} />
        </Card>
      </div>

      <Card title="Keepers" sub="Players kept at the round they were drafted (🔒). Undrafted keepers come in at their assigned round. Detected automatically — fix any misses in src/keepers.json.">
        <Table rows={[...keepers].sort((a, b) => b.season - a.season || a.round - b.round)} cols={pickCols} rowKey={(p) => `${p.season}-${p.pickNo}`} />
      </Card>

      {season !== 'Overview' && (
        <Card title={`${season} Draft Board`}>
          <DraftBoard picks={scoped} />
        </Card>
      )}

      <Card title="Draft Value vs Final Rank" sub="Each dot is a team-season: average pick surplus vs where they finished.">
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" />
            <XAxis type="number" dataKey="x" name="Avg surplus" stroke="var(--muted)" />
            <YAxis type="number" dataKey="y" name="Final rank" reversed stroke="var(--muted)" domain={[1, 'dataMax']} allowDecimals={false} />
            <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)' }} formatter={(v) => String(v)} labelFormatter={() => ''} />
            <Scatter data={scatter} fill="#4f8cff" />
          </ScatterChart>
        </ResponsiveContainer>
        <p className="muted small">Better drafts trend toward the top-right.</p>
      </Card>
    </div>
  )
}

function DraftBoard({ picks }: { picks: Pick[] }) {
  const lg = useLeague()
  const pm = playersOf(lg)
  const rounds = [...new Set(picks.map((p) => p.round))].sort((a, b) => a - b)
  const teams = [...new Set(picks.filter((p) => p.round === 1).sort((a, b) => a.pickNo - b.pickNo).map((p) => p.memberId))]
  return (
    <div className="table-wrap">
      <table className="board">
        <thead><tr><th>Rd</th>{teams.map((t) => <th key={t}><MemberLink id={t} /></th>)}</tr></thead>
        <tbody>
          {rounds.map((r) => (
            <tr key={r}>
              <td className="muted">{r}</td>
              {teams.map((t) => {
                const p = picks.find((x) => x.round === r && x.memberId === t)
                if (!p) return <td key={t} className="muted">—</td>
                const pos = pm.info[p.playerId]?.pos ?? ''
                return (
                  <td key={t} className={`board-cell ${pos}`}>
                    <PlayerLink id={p.playerId} showPos={false} />
                    <div className="muted small">{pos} · #{p.pickNo}{p.keeper && ' · 🔒'}{!p.pending && ` · ${signed(p.surplus)}`}</div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
