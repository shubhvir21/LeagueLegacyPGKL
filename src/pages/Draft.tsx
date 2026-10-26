import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLeague } from '../lib/data'
import { playersOf, playerName, type Pick } from '../lib/players'
import { fmt } from '../lib/stats'
import { Card, MemberLink, Stat, Table, type Col } from '../components/ui'
import { PlayerLink } from '../components/PlayerLink'
import { signed } from './History'

// Draft grades use fresh picks only: keepers occupy a slot on the board but are graded on the Keepers page.
const T = {
  value: 'Value over replacement for the season: the player’s points minus a replacement-level player at his position.',
  expected: 'What an average fresh (non-keeper) pick in that round returns, across every finished season.',
  surplus: 'Value minus what the round normally returns. Positive = the pick beat its slot.',
  hit: 'Share of fresh picks that beat their round’s average.',
}

const grade = (avg: number) => (avg > 25 ? 'A+' : avg > 15 ? 'A' : avg > 6 ? 'B' : avg > -2 ? 'C' : avg > -10 ? 'D' : 'F')
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`

type Row = Pick & { name: string; pos: string; slot: string }

export default function Draft() {
  const lg = useLeague()
  const pm = playersOf(lg)

  const all: Row[] = useMemo(() => {
    const perRound: Record<number, number> = {}
    for (const p of pm.picks) if (p.round === 1) perRound[p.season] = (perRound[p.season] ?? 0) + 1
    return pm.picks.map((p) => {
      const n = perRound[p.season] || 1
      return { ...p, name: playerName(pm, p.playerId), pos: pm.info[p.playerId]?.pos ?? '?', slot: `${p.round}.${String(((p.pickNo - 1) % n) + 1).padStart(2, '0')}` }
    })
  }, [pm])

  const years = [...new Set(all.map((r) => r.season))].sort((a, b) => b - a)
  const [year, setYear] = useState(String(years[0] ?? ''))
  const [member, setMember] = useState('ALL')

  const fresh = all.filter((r) => !r.keeper)
  const graded = fresh.filter((r) => !r.pending)
  const name = (id: string) => lg.memberById[id]?.name ?? id
  const finishOf = (id: string, season: number) => lg.seasons.find((s) => s.year === season)?.teamSeasons.find((t) => t.memberId === id)?.finalRank ?? null

  // ---- Board ----
  const board = all.filter((r) => r.season === Number(year))
  const rounds = [...new Set(board.map((r) => r.round))].sort((a, b) => a - b)
  const maxAbs = Math.max(1, ...graded.map((r) => Math.abs(r.surplus)))
  const tone = (r: Row) => {
    if (r.keeper) return { background: 'var(--accent-soft)' }
    if (r.pending) return {}
    const a = Math.min(1, Math.abs(r.surplus) / (maxAbs * 0.5)) * 40
    return { background: `color-mix(in srgb, var(${r.surplus >= 0 ? '--pos' : '--neg'}) ${a.toFixed(0)}%, transparent)` }
  }

  // ---- Classes and franchise report card ----
  const classes = Object.values(graded.reduce<Record<string, { id: string; season: number; n: number; s: number; hits: number }>>((acc, r) => {
    const c = (acc[`${r.season}|${r.memberId}`] ??= { id: r.memberId, season: r.season, n: 0, s: 0, hits: 0 })
    c.n++; c.s += r.surplus; if (r.surplus > 0) c.hits++
    return acc
  }, {})).map((c) => ({ ...c, avg: c.s / c.n, finish: finishOf(c.id, c.season) }))

  const franchise = lg.members.map((m) => {
    const mine = graded.filter((r) => r.memberId === m.id)
    const s = mine.reduce((a, r) => a + r.surplus, 0)
    const mineAll = fresh.filter((r) => r.memberId === m.id)
    const firstQb = Object.values(mineAll.filter((r) => r.pos === 'QB').reduce<Record<number, number>>((acc, r) => { acc[r.season] = Math.min(acc[r.season] ?? 99, r.round); return acc }, {}))
    const early = mineAll.filter((r) => r.round <= 3)
    const share = (pos: string) => (early.length ? early.filter((r) => r.pos === pos).length / early.length : 0)
    const best = [...mine].sort((a, b) => b.surplus - a.surplus)[0]
    return {
      id: m.id, n: mine.length, s, avg: mine.length ? s / mine.length : 0,
      hit: mine.length ? mine.filter((r) => r.surplus > 0).length / mine.length : 0,
      best, rb: share('RB'), wr: share('WR'), qbRound: firstQb.length ? firstQb.reduce((a, b) => a + b, 0) / firstQb.length : null,
    }
  }).filter((f) => f.n > 0)

  const favourites = Object.values(fresh.reduce<Record<string, Row[]>>((acc, r) => {
    ;(acc[`${r.memberId}|${r.playerId}`] ??= []).push(r)
    return acc
  }, {})).filter((c) => c.length > 1).sort((a, b) => b.length - a.length)

  const roundValue = [...new Set(graded.map((r) => r.round))].sort((a, b) => a - b).map((round) => {
    const pool = graded.filter((r) => r.round === round)
    return { round: `R${round}`, value: Math.round(pool.reduce((a, r) => a + r.value, 0) / pool.length), hit: pool.filter((r) => r.value > 0).length / pool.length }
  })

  const firsts = fresh.filter((r) => r.round === 1).sort((a, b) => b.season - a.season || a.pickNo - b.pickNo)

  // Do good drafts win? Compare each season's best and worst draft class finish.
  const byYear = [...new Set(classes.map((c) => c.season))].sort((a, b) => b - a).map((season) => {
    const cs = classes.filter((c) => c.season === season).sort((a, b) => b.s - a.s)
    return { season, top: cs[0], bottom: cs[cs.length - 1] }
  })
  const topFinish = byYear.filter((y) => y.top?.finish).map((y) => y.top.finish as number)
  const botFinish = byYear.filter((y) => y.bottom?.finish).map((y) => y.bottom.finish as number)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

  const steal = [...graded].sort((a, b) => b.surplus - a.surplus)[0]
  const bust = [...graded].sort((a, b) => a.surplus - b.surplus)[0]
  const bestClass = [...classes].sort((a, b) => b.s - a.s)[0]
  const topDrafter = [...franchise].sort((a, b) => b.avg - a.avg)[0]

  const filtered = graded.filter((r) => member === 'ALL' || r.memberId === member)
  const pickCols: Col<Row>[] = [
    { key: 's', label: 'Season', render: (r) => r.season, sort: (r) => r.season },
    { key: 'pk', label: 'Pick', render: (r) => r.slot, sort: (r) => r.pickNo, align: 'right' },
    { key: 'm', label: 'Franchise', render: (r) => <MemberLink id={r.memberId} /> },
    { key: 'p', label: 'Player', render: (r) => <PlayerLink id={r.playerId} />, sort: (r) => r.name },
    { key: 'v', label: 'Value', render: (r) => fmt(r.value, 1), sort: (r) => r.value, align: 'right', tip: T.value },
    { key: 'e', label: 'Round Avg', render: (r) => fmt(r.expected, 1), sort: (r) => r.expected, align: 'right', tip: T.expected },
    { key: 'g', label: 'Surplus', render: (r) => <span className={r.surplus >= 0 ? 'pos' : 'neg'}>{signed(r.surplus)}</span>, sort: (r) => r.surplus, align: 'right', tip: T.surplus },
  ]
  type F = (typeof franchise)[number]
  const fCols: Col<F>[] = [
    { key: 'm', label: 'Franchise', render: (r) => <MemberLink id={r.id} /> },
    { key: 'g', label: 'Grade', render: (r) => <b>{grade(r.avg)}</b>, sort: (r) => r.avg, align: 'center' },
    { key: 'n', label: 'Picks', render: (r) => r.n, sort: (r) => r.n, align: 'right' },
    { key: 'h', label: 'Hit Rate', render: (r) => `${Math.round(r.hit * 100)}%`, sort: (r) => r.hit, align: 'right', tip: T.hit },
    { key: 's', label: 'Total Surplus', render: (r) => <span className={r.s >= 0 ? 'pos' : 'neg'}>{signed(r.s)}</span>, sort: (r) => r.s, align: 'right', tip: T.surplus },
    { key: 'a', label: 'Per Pick', render: (r) => signed(r.avg), sort: (r) => r.avg, align: 'right' },
    { key: 'b', label: 'Best Pick', render: (r) => (r.best ? <><PlayerLink id={r.best.playerId} /> <span className="muted">{r.best.season} {r.best.slot}</span></> : '—') },
  ]
  const tCols: Col<F>[] = [
    { key: 'm', label: 'Franchise', render: (r) => <MemberLink id={r.id} /> },
    { key: 'rb', label: 'RB in R1–3', render: (r) => `${Math.round(r.rb * 100)}%`, sort: (r) => r.rb, align: 'right' },
    { key: 'wr', label: 'WR in R1–3', render: (r) => `${Math.round(r.wr * 100)}%`, sort: (r) => r.wr, align: 'right' },
    { key: 'qb', label: 'First QB (avg round)', render: (r) => (r.qbRound != null ? fmt(r.qbRound, 1) : '—'), sort: (r) => -(r.qbRound ?? 99), align: 'right' },
  ]
  type C = (typeof classes)[number]
  const cCols: Col<C>[] = [
    { key: 's', label: 'Season', render: (r) => r.season, sort: (r) => r.season },
    { key: 'm', label: 'Franchise', render: (r) => <MemberLink id={r.id} /> },
    { key: 'g', label: 'Grade', render: (r) => <b>{grade(r.avg)}</b>, sort: (r) => r.avg, align: 'center' },
    { key: 'h', label: 'Hits', render: (r) => `${r.hits} / ${r.n}`, sort: (r) => r.hits / r.n, align: 'right' },
    { key: 't', label: 'Surplus', render: (r) => <span className={r.s >= 0 ? 'pos' : 'neg'}>{signed(r.s)}</span>, sort: (r) => r.s, align: 'right' },
    { key: 'f', label: 'Finish', render: (r) => (r.finish ? ordinal(r.finish) : '—'), sort: (r) => -(r.finish ?? 99), align: 'right' },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Draft History</h1>
          <p className="muted">Every draft, graded on fresh picks only. Keepers sit on the board but are graded on the Keepers page.</p>
        </div>
      </div>

      <div className="stat-grid">
        {steal && <Stat icon="crown" label={`Biggest steal · ${signed(steal.surplus)} (${steal.season} ${steal.slot})`} value={`${steal.name} (${name(steal.memberId)})`} tone="pos" tip={T.surplus} />}
        {bust && <Stat icon="bomb" label={`Biggest bust · ${signed(bust.surplus)} (${bust.season} ${bust.slot})`} value={`${bust.name} (${name(bust.memberId)})`} tone="neg" />}
        {bestClass && <Stat icon="star" label={`Best draft class · ${bestClass.season} · ${signed(bestClass.s)}`} value={name(bestClass.id)} />}
        {topDrafter && <Stat icon="target" label={`Best drafter · ${signed(topDrafter.avg)} per pick`} value={name(topDrafter.id)} />}
      </div>

      <Card title="Draft Board" sub="Green beat its round, red fell short. Blue = keeper." right={
        <select value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y}>{y}</option>)}</select>
      }>
        <div className="table-wrap">
          <table className="draft-board">
            <tbody>
              {rounds.map((round) => (
                <tr key={round}>
                  <th>R{round}</th>
                  {board.filter((r) => r.round === round).sort((a, b) => a.pickNo - b.pickNo).map((r) => (
                    <td key={r.pickNo} style={tone(r)} title={r.keeper ? 'Keeper' : r.pending ? 'Season in progress' : `Value ${fmt(r.value, 1)} · ${signed(r.surplus)} vs round`}>
                      <div className="draft-slot muted">{r.slot}{r.keeper && ' · K'}</div>
                      <div className="draft-player"><PlayerLink id={r.playerId} /></div>
                      <div className="draft-meta muted">{name(r.memberId)}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Steals & Busts" sub="Every graded fresh pick. Sort by Surplus for the best and worst." right={
        <select value={member} onChange={(e) => setMember(e.target.value)}>
          <option value="ALL">All franchises</option>
          {lg.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      }>
        <Table rows={filtered} cols={pickCols} initialSort="g" rowKey={(r) => `${r.season}-${r.pickNo}`} />
      </Card>

      <Card title="Draft Report Card" sub="Career grade on surplus per fresh pick in finished seasons.">
        <Table rows={franchise} cols={fCols} initialSort="g" rowKey={(r) => r.id} />
      </Card>

      <Card title="Draft Classes" sub="Each franchise's draft, by season, next to where they finished.">
        <Table rows={classes} cols={cCols} initialSort="t" rowKey={(r) => `${r.season}-${r.id}`} />
      </Card>

      {topFinish.length > 0 && (
        <Card title="Does Drafting Win?" sub="Where the best and worst draft class of each season finished.">
          <div className="stat-grid">
            <Stat icon="trendUp" label="Best draft class, avg finish" value={ordinal(Math.round(avg(topFinish)))} tone="pos" />
            <Stat icon="trendDown" label="Worst draft class, avg finish" value={ordinal(Math.round(avg(botFinish)))} tone="neg" />
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Season</th><th>Best class</th><th className="right">Finish</th><th>Worst class</th><th className="right">Finish</th></tr></thead>
              <tbody>
                {byYear.map((y) => (
                  <tr key={y.season}>
                    <td>{y.season}</td>
                    <td><MemberLink id={y.top.id} /></td><td className="right">{y.top.finish ? ordinal(y.top.finish) : '—'}</td>
                    <td><MemberLink id={y.bottom.id} /></td><td className="right">{y.bottom.finish ? ordinal(y.bottom.finish) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Value by Round" sub="Average value over replacement from a fresh pick in each round.">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={roundValue}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="round" stroke="var(--muted)" tickLine={false} />
            <YAxis stroke="var(--muted)" tickLine={false} width={40} />
            <Tooltip cursor={{ fill: 'var(--accent-soft)' }} contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border-strong)' }}
              formatter={(v, _n, p) => [`${v} pts · ${Math.round((p.payload as { hit: number }).hit * 100)}% returned value`, 'Avg value']} />
            <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="First-Round History" sub="Every fresh first-round pick.">
        <Table rows={firsts} cols={pickCols.map((c) => (c.key === 'v' || c.key === 'g' ? { ...c, render: (r: Row, i: number) => (r.pending ? <span className="muted">in progress</span> : c.render(r, i)) } : c))} initialSort="s" rowKey={(r) => `${r.season}-${r.pickNo}`} />
      </Card>

      <Card title="Draft Tendencies" sub="How each franchise spends its first three fresh picks, and when they take a QB.">
        <Table rows={franchise} cols={tCols} initialSort="rb" rowKey={(r) => r.id} />
      </Card>

      {favourites.length > 0 && (
        <Card title="Favourite Players" sub="Players the same franchise drafted fresh more than once.">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Player</th><th>Franchise</th><th>Picks</th></tr></thead>
              <tbody>
                {favourites.map((c) => (
                  <tr key={c[0].memberId + c[0].playerId}>
                    <td><PlayerLink id={c[0].playerId} /></td>
                    <td><MemberLink id={c[0].memberId} /></td>
                    <td>{[...c].sort((a, b) => a.season - b.season).map((r) => `${r.season} ${r.slot}`).join(' → ')}</td>
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
