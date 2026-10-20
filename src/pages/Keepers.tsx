import { useMemo, useState } from 'react'
import { useLeague } from '../lib/data'
import { playersOf, playerName, type Pick } from '../lib/players'
import { fmt } from '../lib/stats'
import { Card, MemberLink, Stat, Table, type Col } from '../components/ui'
import { PlayerLink } from '../components/PlayerLink'
import { signed } from './History'

const T = {
  value: 'Value over replacement for the season: the player’s points minus a replacement-level player at his position. In-progress seasons show the value so far.',
  expected: 'What an average non-keeper pick in that round returns (all seasons).',
  surplus: 'Value minus what the round normally returns: how much the keeper beat the pick it cost.',
  started: 'Points the keeper scored in your starting lineup that season.',
  hit: 'Share of keepers that beat their round’s expected value.',
}

type Row = Pick & { name: string; live: number; started: number; year: number; gain: number }

export default function Keepers() {
  const lg = useLeague()
  const pm = playersOf(lg)
  const [season, setSeason] = useState('All')
  const [member, setMember] = useState('ALL')

  const rows: Row[] = useMemo(() => {
    const vor = Object.fromEntries(pm.seasons.map((s) => [`${s.playerId}|${s.season}`, s.vor]))
    const kept = pm.picks.filter((p) => p.keeper)
    const isKept = new Set(kept.map((p) => `${p.season}|${p.memberId}|${p.playerId}`))
    return kept.map((p) => {
      let year = 1
      while (isKept.has(`${p.season - year}|${p.memberId}|${p.playerId}`)) year++
      const live = p.pending ? Math.max(0, vor[`${p.playerId}|${p.season}`] ?? 0) : p.value
      const started = pm.weeks.reduce((a, w) => (w.playerId === p.playerId && w.season === p.season && w.memberId === p.memberId && w.started ? a + w.pts : a), 0)
      return { ...p, name: playerName(pm, p.playerId), live, started, year, gain: p.pending ? live - p.expected : p.surplus }
    })
  }, [pm])

  const years = [...new Set(rows.map((r) => r.season))].sort((a, b) => b - a)
  const view = rows.filter((r) => (season === 'All' || r.season === Number(season)) && (member === 'ALL' || r.memberId === member))
  const done = rows.filter((r) => !r.pending)
  const best = [...done].sort((a, b) => b.surplus - a.surplus)[0]
  const worst = [...done].sort((a, b) => a.surplus - b.surplus)[0]
  const classes = Object.values(done.reduce<Record<string, { id: string; season: number; s: number }>>((acc, r) => {
    const k = `${r.season}|${r.memberId}`
    ;(acc[k] ??= { id: r.memberId, season: r.season, s: 0 }).s += r.surplus
    return acc
  }, {})).sort((a, b) => b.s - a.s)
  const longest = [...rows].sort((a, b) => b.year - a.year)[0]

  const franchise = [...new Set(rows.map((r) => r.memberId))].map((id) => {
    const mine = rows.filter((r) => r.memberId === id)
    const graded = mine.filter((r) => !r.pending)
    const surplus = graded.reduce((a, r) => a + r.surplus, 0)
    return {
      id, n: mine.length, surplus, avg: graded.length ? surplus / graded.length : 0,
      hit: graded.length ? graded.filter((r) => r.surplus > 0).length / graded.length : 0,
      started: mine.reduce((a, r) => a + r.started, 0),
      avgRound: mine.reduce((a, r) => a + r.round, 0) / mine.length,
      now: mine.filter((r) => r.pending).map((r) => r.name).join(', '),
    }
  })
  const grade = (avg: number) => (avg > 40 ? 'A+' : avg > 25 ? 'A' : avg > 12 ? 'B' : avg > 0 ? 'C' : avg > -15 ? 'D' : 'F')

  const chains = Object.values(rows.reduce<Record<string, Row[]>>((acc, r) => {
    ;(acc[`${r.memberId}|${r.playerId}`] ??= []).push(r)
    return acc
  }, {})).filter((c) => c.length > 1).sort((a, b) => b.length - a.length || b.reduce((x, r) => x + r.live, 0) - a.reduce((x, r) => x + r.live, 0))

  const cols: Col<Row>[] = [
    { key: 's', label: 'Season', render: (r) => r.season, sort: (r) => r.season },
    { key: 'm', label: 'Franchise', render: (r) => <MemberLink id={r.memberId} /> },
    { key: 'p', label: 'Keeper', render: (r) => <PlayerLink id={r.playerId} />, sort: (r) => r.name },
    { key: 'r', label: 'Cost', render: (r) => `R${r.round}`, sort: (r) => r.round, align: 'right' },
    { key: 'y', label: 'Year', render: (r) => (r.year > 1 ? <span className="pill">year {r.year}</span> : '1'), sort: (r) => r.year, align: 'center' },
    { key: 'st', label: 'Started Pts', render: (r) => fmt(r.started, 1), sort: (r) => r.started, align: 'right', tip: T.started },
    { key: 'v', label: 'Value', render: (r) => <>{fmt(r.live, 1)}{r.pending && <span className="muted"> *</span>}</>, sort: (r) => r.live, align: 'right', tip: T.value },
    { key: 'e', label: 'Round Avg', render: (r) => fmt(r.expected, 1), sort: (r) => r.expected, align: 'right', tip: T.expected },
    { key: 'g', label: 'Surplus', render: (r) => <span className={r.gain >= 0 ? 'pos' : 'neg'}>{signed(r.gain)}{r.pending && <span className="muted"> *</span>}</span>, sort: (r) => r.gain, align: 'right', tip: T.surplus },
  ]
  const fCols: Col<(typeof franchise)[number]>[] = [
    { key: 'm', label: 'Franchise', render: (r) => <MemberLink id={r.id} /> },
    { key: 'g', label: 'Grade', render: (r) => <b>{grade(r.avg)}</b>, sort: (r) => r.avg, align: 'center' },
    { key: 'n', label: 'Keepers', render: (r) => r.n, sort: (r) => r.n, align: 'right' },
    { key: 'ar', label: 'Avg Round', render: (r) => fmt(r.avgRound, 1), sort: (r) => -r.avgRound, align: 'right' },
    { key: 'h', label: 'Hit Rate', render: (r) => `${Math.round(r.hit * 100)}%`, sort: (r) => r.hit, align: 'right', tip: T.hit },
    { key: 's', label: 'Total Surplus', render: (r) => <span className={r.surplus >= 0 ? 'pos' : 'neg'}>{signed(r.surplus)}</span>, sort: (r) => r.surplus, align: 'right', tip: T.surplus },
    { key: 'a', label: 'Per Keeper', render: (r) => signed(r.avg), sort: (r) => r.avg, align: 'right' },
    { key: 'st', label: 'Started Pts', render: (r) => fmt(r.started, 0), sort: (r) => r.started, align: 'right' },
    { key: 'now', label: 'Current Keepers', render: (r) => <span className="muted">{r.now || '—'}</span> },
  ]
  const name = (id?: string) => (id ? lg.memberById[id]?.name ?? id : '—')

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Keepers</h1>
          <p className="muted">Every keeper, what it cost, and whether it beat the pick it used. * = season in progress.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={season} onChange={(e) => setSeason(e.target.value)}>
            <option>All</option>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
          <select value={member} onChange={(e) => setMember(e.target.value)}>
            <option value="ALL">All franchises</option>
            {lg.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      <div className="stat-grid">
        {best && <Stat icon="crown" label={`Best keeper ever · ${signed(best.surplus)} (${best.season} R${best.round})`} value={best.name} tone="pos" tip={T.surplus} />}
        {worst && <Stat icon="bomb" label={`Worst keeper · ${signed(worst.surplus)} (${worst.season} R${worst.round})`} value={worst.name} tone="neg" />}
        {classes[0] && <Stat icon="star" label={`Best keeper class · ${classes[0].season} · ${signed(classes[0].s)}`} value={name(classes[0].id)} />}
        {longest && <Stat icon="lock" label={`Longest hold · year ${longest.year}`} value={`${longest.name} (${name(longest.memberId)})`} />}
      </div>

      <Card title="Keeper Ledger" sub={`${view.length} keepers`}>
        <Table rows={view} cols={cols} initialSort="g" rowKey={(r) => `${r.season}-${r.playerId}`} />
      </Card>

      <Card title="Keeper Report Card" sub="Graded on surplus per keeper in finished seasons">
        <Table rows={franchise} cols={fCols} initialSort="g" rowKey={(r) => r.id} />
      </Card>

      {chains.length > 0 && (
        <Card title="Multi-Year Keepers" sub="Players kept by the same franchise in more than one season">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Player</th><th>Franchise</th><th>Seasons</th><th className="right">Total Value</th></tr></thead>
              <tbody>
                {chains.map((c) => (
                  <tr key={c[0].memberId + c[0].playerId}>
                    <td><PlayerLink id={c[0].playerId} /></td>
                    <td><MemberLink id={c[0].memberId} /></td>
                    <td>{[...c].sort((a, b) => a.season - b.season).map((r) => `${r.season} R${r.round}`).join(' → ')}</td>
                    <td className="right">{fmt(c.reduce((a, r) => a + r.live, 0), 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
