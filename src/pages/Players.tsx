import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { playersOf, type PlayerModel } from '../lib/players'
import { fmt, type League } from '../lib/stats'
import { Card, MemberLink, Stat, Table, type Col } from '../components/ui'
import { KeeperTag, PlayerLink, PosFilter } from '../components/PlayerLink'
import { signed } from './History'

interface Career {
  id: string; pos: string; pts: number; startedPts: number; starts: number; weeks: number; best: number
  drafted: number; added: number; dropped: number; bestPick: number | null; allPro: number; rings: number
}

function buildCareers(lg: League, pm: PlayerModel, allPro: Record<number, AllProTeam>) {
  const rows: Record<string, Career> = {}
  const get = (id: string) => (rows[id] ??= { id, pos: pm.info[id]?.pos ?? '?', pts: 0, startedPts: 0, starts: 0, weeks: 0, best: 0, drafted: 0, added: 0, dropped: 0, bestPick: null, allPro: 0, rings: 0 })
  for (const s of pm.seasons) { const r = get(s.playerId); r.pts += s.pts; r.startedPts += s.startedPts; r.starts += s.starts; r.weeks += s.weeks; r.best = Math.max(r.best, s.best) }
  for (const p of pm.picks) { const r = get(p.playerId); r.drafted++; if (!p.pending) r.bestPick = Math.max(r.bestPick ?? -Infinity, p.surplus) }
  for (const m of pm.moves) get(m.playerId).added++
  for (const d of pm.drops) get(d.playerId).dropped++
  for (const team of Object.values(allPro)) for (const id of [...team.first, ...team.second].map((x) => x.id)) get(id).allPro++
  // Rings: started for the champion in the championship game.
  for (const s of lg.seasons.filter((x) => x.complete)) {
    const final = lg.games.find((g) => g.season === s.year && g.place === 1)
    if (!final || !s.champion) continue
    for (const w of pm.weeks) if (w.season === s.year && w.week === final.week && w.memberId === s.champion && w.started) get(w.playerId).rings++
  }
  return Object.values(rows)
}

interface AllProTeam { first: { id: string; slot: string; pts: number }[]; second: { id: string; slot: string; pts: number }[] }
const LINEUP = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'DEF']
function allProTeams(pm: PlayerModel): Record<number, AllProTeam> {
  const out: Record<number, AllProTeam> = {}
  for (const year of new Set(pm.seasons.map((s) => s.season))) {
    const pool = pm.seasons.filter((s) => s.season === year).sort((a, b) => b.pts - a.pts)
    const used = new Set<string>()
    const pickTeam = () =>
      LINEUP.map((slot) => {
        const ok = (pos: string) => (slot === 'FLEX' ? ['RB', 'WR', 'TE'].includes(pos) : pos === slot)
        const p = pool.find((x) => !used.has(x.playerId) && ok(pm.info[x.playerId]?.pos ?? ''))
        if (!p) return null
        used.add(p.playerId)
        return { id: p.playerId, slot, pts: p.pts }
      }).filter((x): x is NonNullable<typeof x> => !!x)
    out[year] = { first: pickTeam(), second: pickTeam() }
  }
  return out
}

export default function Players() {
  const lg = useLeague()
  const pm = playersOf(lg)
  const allPro = useMemo(() => allProTeams(pm), [pm])
  const rows = useMemo(() => buildCareers(lg, pm, allPro), [lg, pm, allPro])
  const [pos, setPos] = useState('ALL')
  const [q, setQ] = useState('')
  const years = Object.keys(allPro).map(Number).sort((a, b) => b - a)
  const [apYear, setApYear] = useState(years.find((y) => lg.seasons.find((s) => s.year === y)?.complete) ?? years[0])
  const scoped = rows.filter((r) => pos === 'ALL' || r.pos === pos)
  const top = <K extends keyof Career>(k: K) => [...scoped].sort((a, b) => Number(b[k] ?? -1e9) - Number(a[k] ?? -1e9))[0]
  const bestWeek = [...pm.weeks].filter((w) => pos === 'ALL' || pm.info[w.playerId]?.pos === pos).sort((a, b) => b.pts - a.pts)[0]
  const bestAvg = [...scoped].filter((r) => r.starts >= 8).sort((a, b) => b.startedPts / b.starts - a.startedPts / a.starts)[0]
  const dir = scoped.filter((r) => !q || pm.info[r.id]?.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.pts - a.pts).slice(0, 100)

  const cols: Col<Career>[] = [
    { key: 'r', label: '#', render: (_r, i) => i + 1 },
    { key: 'p', label: 'Player', render: (r) => <PlayerLink id={r.id} /> },
    { key: 'pts', label: 'Total Pts', render: (r) => fmt(r.pts), sort: (r) => r.pts, align: 'right', tip: 'Points while on a roster in this league.' },
    { key: 'avg', label: 'Avg / Start', render: (r) => (r.starts ? fmt(r.startedPts / r.starts) : '—'), sort: (r) => (r.starts ? r.startedPts / r.starts : 0), align: 'right' },
    { key: 'best', label: 'Best Week', render: (r) => fmt(r.best), sort: (r) => r.best, align: 'right' },
    { key: 'st', label: 'Starts', render: (r) => r.starts, sort: (r) => r.starts, align: 'right' },
    { key: 'dr', label: 'Drafted', render: (r) => r.drafted, sort: (r) => r.drafted, align: 'right' },
    { key: 'ad', label: 'Added', render: (r) => r.added, sort: (r) => r.added, align: 'right' },
    { key: 'dp', label: 'Dropped', render: (r) => r.dropped, sort: (r) => r.dropped, align: 'right' },
    { key: 'ap', label: 'All-Pro', render: (r) => r.allPro || '', sort: (r) => r.allPro, align: 'right' },
    { key: 'ring', label: 'Rings', render: (r) => (r.rings ? <span className="trophy gold">{r.rings}×</span> : ''), sort: (r) => r.rings, align: 'right' },
  ]
  const name = (id?: string) => (id ? pm.info[id]?.name ?? id : '—')

  return (
    <div className="page">
      <h1>Players</h1>
      <PosFilter value={pos} onChange={setPos} />
      <div className="stat-grid">
        <Stat icon="star" label={`Top scorer · ${fmt(top('pts')?.pts ?? 0)} pts`} value={name(top('pts')?.id)} />
        <Stat icon="trendUp" label={`Best avg / start (8+ starts) · ${bestAvg ? fmt(bestAvg.startedPts / bestAvg.starts) : '—'}`} value={name(bestAvg?.id)} />
        <Stat icon="zap" label={`Best single week · ${fmt(bestWeek?.pts ?? 0)} (${bestWeek?.season} W${bestWeek?.week})`} value={name(bestWeek?.playerId)} />
        <Stat icon="list" label={`Most drafted · ${top('drafted')?.drafted ?? 0}×`} value={name(top('drafted')?.id)} />
        <Stat icon="plus" label={`Most added · ${top('added')?.added ?? 0}×`} value={name(top('added')?.id)} />
        <Stat icon="minus" label={`Most dropped · ${top('dropped')?.dropped ?? 0}×`} value={name(top('dropped')?.id)} />
        <Stat icon="target" label={`Best draft value · ${signed(top('bestPick')?.bestPick ?? 0)}`} value={name(top('bestPick')?.id)} />
        <Stat icon="trophy" label={`Most rings · ${top('rings')?.rings ?? 0}`} value={name(top('rings')?.id)} />
      </div>

      <Card title="All-Pro Teams" sub="Best rostered players at each lineup slot by season points." right={<select value={apYear} onChange={(e) => setApYear(Number(e.target.value))}>{years.map((y) => <option key={y}>{y}</option>)}</select>}>
        <div className="two-col">
          {(['first', 'second'] as const).map((k) => (
            <div key={k}>
              <h3>{k === 'first' ? '1st Team' : '2nd Team'}</h3>
              <div className="table-wrap"><table><tbody>{allPro[apYear]?.[k].map((p) => (
                <tr key={p.id}><td className="muted">{p.slot}</td><td><PlayerLink id={p.id} /></td><td className="right">{fmt(p.pts)}</td></tr>
              ))}</tbody></table></div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Player Directory" sub="Everyone who has been on a roster in this league (top 100 shown)." right={<input className="search" placeholder="Search players…" value={q} onChange={(e) => setQ(e.target.value)} />}>
        <Table rows={dir} cols={cols} rowKey={(r) => r.id} />
      </Card>
    </div>
  )
}

export function Player() {
  const lg = useLeague()
  const pm = playersOf(lg)
  const id = useParams().id!
  const p = pm.info[id]
  const seasons = pm.seasons.filter((s) => s.playerId === id).sort((a, b) => b.season - a.season)
  const picks = pm.picks.filter((x) => x.playerId === id)
  const moves = pm.moves.filter((x) => x.playerId === id)
  const drops = pm.drops.filter((x) => x.playerId === id)
  const trades = pm.trades.filter((t) => t.sides.some((s) => s.gets.includes(id)))
  const byMember: Record<string, number> = {}
  for (const w of pm.weeks) if (w.playerId === id && w.started) byMember[w.memberId] = (byMember[w.memberId] ?? 0) + w.pts
  const best = [...pm.weeks].filter((w) => w.playerId === id).sort((a, b) => b.pts - a.pts)[0]
  if (!p) return <p>Player not found.</p>
  return (
    <div className="page">
      <h1><span className={`pos-tag big ${p.pos}`}>{p.pos}</span> {p.name}</h1>
      <p className="muted">{p.team}</p>
      <div className="stat-grid">
        <Stat label="Total league points" value={fmt(seasons.reduce((a, s) => a + s.pts, 0))} />
        <Stat label="Starts" value={seasons.reduce((a, s) => a + s.starts, 0)} />
        <Stat label="Best week" value={best ? `${fmt(best.pts)} (${best.season} W${best.week})` : '—'} />
        <Stat label="Times drafted" value={picks.length} />
        <Stat label="Times added" value={moves.length} />
      </div>
      <Card title="Seasons">
        <div className="table-wrap"><table>
          <thead><tr><th>Season</th><th>Rostered By</th><th className="right">Points</th><th className="right">Started Pts</th><th className="right">Starts</th><th className="right">Value</th><th>Draft</th></tr></thead>
          <tbody>{seasons.map((s) => {
            const pk = picks.find((x) => x.season === s.season)
            return (
              <tr key={s.season}>
                <td><Link to={`/season/${s.season}`}>{s.season}</Link></td>
                <td><span className="row">{s.members.map((m) => <MemberLink key={m} id={m} />)}</span></td>
                <td className="right">{fmt(s.pts)}</td><td className="right">{fmt(s.startedPts)}</td><td className="right">{s.starts}</td>
                <td className="right">{signed(s.vor)}</td>
                <td>{pk ? <>R{pk.round} by <MemberLink id={pk.memberId} avatar={false} />{pk.keeper && <KeeperTag />}</> : <span className="muted">Undrafted</span>}</td>
              </tr>
            )
          })}</tbody>
        </table></div>
      </Card>
      <Card title="Started Points by Franchise">
        <div className="table-wrap"><table><tbody>{Object.entries(byMember).sort((a, b) => b[1] - a[1]).map(([m, v]) => <tr key={m}><td><MemberLink id={m} /></td><td className="right">{fmt(v)}</td></tr>)}</tbody></table></div>
      </Card>
      <Card title="Transaction History">
        <div className="table-wrap"><table><tbody>
          {[
            ...picks.map((x) => ({ k: x.season * 100, t: <>Drafted R{x.round} (#{x.pickNo}) by <MemberLink id={x.memberId} avatar={false} />{x.keeper && ' (keeper)'}</>, when: `${x.season} draft` })),
            ...moves.map((x) => ({ k: x.season * 100 + x.week, t: <>Added by <MemberLink id={x.memberId} avatar={false} /> ({x.type === 'free_agent' ? 'FA' : 'waivers'})</>, when: `${x.season} W${x.week}` })),
            ...drops.map((x) => ({ k: x.season * 100 + x.week + 0.5, t: <>Dropped by <MemberLink id={x.memberId} avatar={false} /></>, when: `${x.season} W${x.week}` })),
            ...trades.map((t) => ({ k: t.season * 100 + t.week, t: <>Traded to <MemberLink id={t.sides.find((s) => s.gets.includes(id))!.memberId} avatar={false} /></>, when: `${t.season} W${t.week}` })),
          ].sort((a, b) => b.k - a.k).map((e, i) => <tr key={i}><td className="muted">{e.when}</td><td>{e.t}</td></tr>)}
        </tbody></table></div>
      </Card>
    </div>
  )
}
