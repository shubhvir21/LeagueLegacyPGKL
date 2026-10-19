import { useState } from 'react'
import { useLeague } from '../lib/data'
import { playersOf, type Move, type Trade } from '../lib/players'
import { careers, fmt } from '../lib/stats'
import { Card, MemberLink, Stat, Table, type Col } from '../components/ui'
import { PlayerLink } from '../components/PlayerLink'
import { signed } from './History'

const MOVE_TIP = 'Value over replacement: for every week the player started for this team (rest of season), his points minus a replacement-level player at his position. Easy-to-find positions like QB and DEF have a high bar.'
const TRADE_TIP = 'Trade value = value over replacement from players received (started weeks) minus value over replacement the departed players produced for their new team, rest of season. Draft picks are listed but not valued.'

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
    { key: 'v', label: 'Value', render: (m) => <b>{fmt(m.value)}</b>, sort: (m) => m.value, align: 'right', tip: MOVE_TIP },
  ]
  const dropCols: Col<(typeof drops)[number]>[] = [
    { key: 'm', label: 'Team', render: (d) => <MemberLink id={d.memberId} /> },
    { key: 'p', label: 'Dropped', render: (d) => <PlayerLink id={d.playerId} /> },
    { key: 'w', label: 'When', render: (d) => `${d.season} W${d.week}` },
    { key: 'v', label: 'Pts After', render: (d) => <b className="neg">{fmt(d.after)}</b>, sort: (d) => d.after, align: 'right', tip: 'Points the player scored on any roster after being dropped that season.' },
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
        <Card title="Top Waiver Moves" sub="Pickups that paid off most.">
          <Table rows={[...moves].sort((a, b) => b.value - a.value).slice(0, 10)} cols={moveCols} rowKey={(m) => `${m.season}-${m.week}-${m.playerId}-${m.memberId}`} />
        </Card>
        <Card title="Worst Drops" sub="Players who produced most after being cut.">
          <Table rows={[...drops].sort((a, b) => b.after - a.after).slice(0, 10)} cols={dropCols} rowKey={(d) => `${d.season}-${d.week}-${d.playerId}-${d.memberId}`} />
        </Card>
      </div>
      <Card title="Trades" sub="Most impactful trades first. Values are rest-of-season starting-lineup points." right={<span className="tip" title={TRADE_TIP}>ⓘ</span>}>
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
