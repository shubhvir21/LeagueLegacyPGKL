import { useState } from 'react'
import { useLeague } from '../lib/data'
import { playersOf, type Move, type Trade } from '../lib/players'
import { careers, fmt } from '../lib/stats'
import { Card, MemberLink, Stat, Table, type Col } from '../components/ui'
import { PlayerLink } from '../components/PlayerLink'
import { signed } from './History'

const MOVE_TIP = 'Net lineup points: what the pickup added to your best possible lineup each week he was on your roster, minus what the player you dropped would have added had you kept him.'
const GAIN_TIP = 'Points the pickup added to your best possible lineup (optimal lineup with him minus without him), every week he was on your roster. Bench filler adds ~0.'
const COST_TIP = 'Points your best possible lineup would have gained by keeping the dropped player (only counts weeks he scored for another roster). Cutting someone who would never have started costs 0.'
const TRADE_TIP = 'Lineup points gained: each week after the trade, your actual best possible lineup minus the best lineup you would have had keeping the players you gave up. Draft picks are listed but not valued.'

export default function Transactions() {
  const lg = useLeague()
  const pm = playersOf(lg)
  const [season, setSeason] = useState('Overview')
  const [member, setMember] = useState('ALL')
  const inScope = (x: { season: number }) => season === 'Overview' || x.season === Number(season)
  const moves = pm.moves.filter(inScope).filter((m) => member === 'ALL' || m.memberId === member)
  const trades = pm.trades.filter(inScope).filter((t) => member === 'ALL' || t.sides.some((s) => s.memberId === member))
  const drops = pm.drops.filter(inScope).filter((d) => member === 'ALL' || d.memberId === member)
  const years = [...new Set([...pm.moves, ...pm.trades].map((x) => x.season))].sort((a, b) => b - a)
  const realTrades = trades.filter((t) => t.sides.some((s) => s.gets.length || s.gives.length))

  const nSeasons = (id: string) => lg.seasons.filter((s) => inScope({ season: s.year }) && s.teamSeasons.some((t) => t.memberId === id)).length || 1
  const rankRows = careers(lg).map((r) => {
    const id = r.member.id
    const mv = pm.moves.filter(inScope).filter((m) => m.memberId === id)
    const tr = pm.trades.filter(inScope).flatMap((t) => t.sides.filter((s) => s.memberId === id))
    const waiver = mv.reduce((a, m) => a + m.value, 0)
    const trade = tr.reduce((a, s) => a + s.value, 0)
    return { id, moves: mv.length, trades: tr.length, waiver: waiver / nSeasons(id), trade: trade / nSeasons(id), total: (waiver + trade) / nSeasons(id) }
  })
  const rankCols: Col<(typeof rankRows)[number]>[] = [
    { key: 'm', label: 'Member', render: (r) => <MemberLink id={r.id} /> },
    { key: 'mv', label: 'Adds', render: (r) => r.moves, sort: (r) => r.moves, align: 'right' },
    { key: 'tr', label: 'Trades', render: (r) => r.trades, sort: (r) => r.trades, align: 'right' },
    { key: 'w', label: 'Waiver Value / Season', render: (r) => fmt(r.waiver), sort: (r) => r.waiver, align: 'right', tip: MOVE_TIP },
    { key: 't', label: 'Trade Value / Season', render: (r) => <span className={r.trade >= 0 ? 'pos' : 'neg'}>{signed(r.trade)}</span>, sort: (r) => r.trade, align: 'right', tip: TRADE_TIP },
    { key: 'tot', label: 'Total / Season', render: (r) => <b>{fmt(r.total)}</b>, sort: (r) => r.total, align: 'right' },
  ]
  const moveCols: Col<Move>[] = [
    { key: 'm', label: 'Team', render: (m) => <MemberLink id={m.memberId} /> },
    { key: 'p', label: 'Added', render: (m) => <PlayerLink id={m.playerId} /> },
    { key: 'd', label: 'Dropped', render: (m) => (m.dropId ? <PlayerLink id={m.dropId} /> : <span className="muted">—</span>) },
    { key: 'w', label: 'When', render: (m) => `${m.season} W${m.week}${m.type === 'free_agent' ? ' · FA' : m.bid ? ` · $${m.bid}` : ''}` },
    { key: 'g', label: 'Gain', render: (m) => <span className="pos">{fmt(m.gain, 1)}</span>, sort: (m) => m.gain, align: 'right', tip: GAIN_TIP },
    { key: 'c', label: 'Drop Cost', render: (m) => <span className={m.dropCost > 0 ? 'neg' : 'muted'}>{m.dropCost > 0 ? `−${fmt(m.dropCost, 1)}` : '0'}</span>, sort: (m) => m.dropCost, align: 'right', tip: COST_TIP },
    { key: 'v', label: 'Net', render: (m) => <b className={m.value >= 0 ? '' : 'neg'}>{signed(m.value)}</b>, sort: (m) => m.value, align: 'right', tip: MOVE_TIP },
  ]
  const dropCols: Col<(typeof drops)[number]>[] = [
    { key: 'm', label: 'Team', render: (d) => <MemberLink id={d.memberId} /> },
    { key: 'p', label: 'Dropped', render: (d) => <PlayerLink id={d.playerId} /> },
    { key: 'w', label: 'When', render: (d) => `${d.season} W${d.week}` },
    { key: 'by', label: 'Started By', render: (d) => <StartedBy d={d} />, },
    { key: 'v', label: 'Lineup Pts Lost', render: (d) => <b className={d.after > 0 ? 'neg' : 'muted'}>{d.after > 0 ? `−${fmt(d.after, 1)}` : '0'}</b>, sort: (d) => d.after, align: 'right', tip: COST_TIP },
  ]
  const tradeValue = (t: Trade) => Math.max(...t.sides.map((s) => Math.abs(s.value)))
  const playerCount: Record<string, number> = {}
  for (const m of moves) playerCount[m.playerId] = (playerCount[m.playerId] ?? 0) + 1
  const mostAdded = Object.entries(playerCount).sort((a, b) => b[1] - a[1])[0]
  const best = [...rankRows].sort((a, b) => b.total - a.total)[0]

  return (
    <div className="page">
      <div className="page-head">
        <h1>Transactions</h1>
        <div className="row">
          <select value={season} onChange={(e) => setSeason(e.target.value)}>
            <option>Overview</option>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
          <select value={member} onChange={(e) => setMember(e.target.value)}>
            <option value="ALL">All franchises</option>
            {careers(lg).map((r) => <option key={r.member.id} value={r.member.id}>{r.member.name}</option>)}
          </select>
        </div>
      </div>
      <div className="stat-grid">
        <Stat icon="plus" label="Waiver / FA adds" value={moves.length.toLocaleString()} />
        <Stat icon="swap" label="Trades" value={realTrades.length} />
        <Stat icon="repeat" label="Total transactions" value={(moves.length + realTrades.length).toLocaleString()} />
        {mostAdded && <Stat icon="repeat" label={`Most added · ${mostAdded[1]}×`} value={pm.info[mostAdded[0]]?.name ?? mostAdded[0]} />}
        {best && <Stat icon="zap" label="Best manager / season" value={lg.memberById[best.id]?.name} />}
      </div>
      <Card title="Manager Rankings" sub="Value added through waivers and trades, averaged per season.">
        <Table rows={rankRows} cols={rankCols} initialSort="total" rowKey={(r) => r.id} />
      </Card>
      <div className="two-col">
        <Card title="Top Waiver Moves" sub="Net lineup points added (pickup gain minus drop cost).">
          <Table rows={[...moves].sort((a, b) => b.value - a.value).slice(0, 10)} cols={moveCols} initialSort="v" rowKey={(m) => `${m.season}-${m.week}-${m.playerId}-${m.memberId}`} />
        </Card>
        <Card title="Worst Waiver Moves" sub="Moves that cost lineup points, usually by cutting someone who would have started.">
          <Table rows={[...moves].sort((a, b) => a.value - b.value).slice(0, 10)} cols={moveCols} initialSort="v" initialAsc rowKey={(m) => `${m.season}-${m.week}-${m.playerId}-${m.memberId}`} />
        </Card>
      </div>
      <div>
        <Card title="Worst Drops" sub="Cuts that came back to bite: points the dropper\u2019s best lineup missed out on.">
          <Table rows={[...drops].sort((a, b) => b.after - a.after).slice(0, 10)} cols={dropCols} initialSort="v" rowKey={(d) => `${d.season}-${d.week}-${d.playerId}-${d.memberId}`} />
        </Card>
      </div>
      <Card title="Trades" sub="Most impactful trades first. Values are lineup points gained or lost the rest of that season." right={<span className="tip" title={TRADE_TIP}>ⓘ</span>}>
        <div className="trade-list">
          {[...realTrades].sort((a, b) => tradeValue(b) - tradeValue(a)).slice(0, 30).map((t) => (
            <div key={t.created} className="trade">
              <div className="muted small">{t.season} · Week {t.week}</div>
              <div className="trade-sides">
                {t.sides.map((s) => (
                  <div key={s.memberId} className="trade-side">
                    <div className="row"><MemberLink id={s.memberId} /><b className={s.value >= 0 ? 'pos' : 'neg'}>{signed(s.value)}</b></div>
                    <div className="small muted">Gets</div>
                    {s.gets.map((p) => <div key={p}><PlayerLink id={p} /></div>)}
                    {s.picksIn.map((p) => <div key={p} className="small"><span className="pill" style={{ marginLeft: 0 }}>Pick</span> {p}</div>)}
                    {!s.gets.length && !s.picksIn.length && <div className="muted small">—</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!realTrades.length && <p className="muted">No trades.</p>}
        </div>
      </Card>
    </div>
  )
}

/** Who started a dropped player afterwards (the team that benefited). */
function StartedBy({ d }: { d: { season: number; week: number; playerId: string; memberId: string } }) {
  const lg = useLeague()
  const pm = playersOf(lg)
  const ids = [...new Set(pm.weeks.filter((w) => w.season === d.season && w.week >= d.week && w.playerId === d.playerId && w.started && w.memberId !== d.memberId).map((w) => w.memberId))]
  if (!ids.length) return <span className="muted">—</span>
  return <span className="row">{ids.map((id) => <MemberLink key={id} id={id} avatar={false} />)}</span>
}
