import { useMemo, useState } from 'react'
import { useLeague } from '../lib/data'
import { treesOf, treeTotals, type AssetNode, type TradeNode } from '../lib/tradeTree'
import { playerName } from '../lib/players'
import { fmt } from '../lib/stats'
import { Card, MemberLink, Stat } from '../components/ui'
import { PlayerLink } from '../components/PlayerLink'

const TIP = 'Started points the franchise got out of everything it received, plus everything those assets were later flipped into, until each one was dropped, not kept, or is still on the roster.'

function Asset({ a }: { a: AssetNode }) {
  const f = a.fate
  const label = a.kind === 'player' ? <PlayerLink id={a.id} /> : <span className="pos-tag" style={{ width: 'auto', padding: '2px 6px' }}>{a.id} pick</span>
  let fate: React.ReactNode
  if (f.kind === 'held') fate = <span className="pos">still on roster</span>
  else if (f.kind === 'dropped') fate = <span className="muted">dropped {f.season} W{f.week}</span>
  else if (f.kind === 'expired') fate = <span className="muted">not kept after {f.season}</span>
  else if (f.kind === 'pending') fate = <span className="muted">not used yet</span>
  else if (f.kind === 'traded') fate = <span className="accent">traded {f.node.trade.season} W{f.node.trade.week} {f.repeat ? '(same deal, above)' : '→'}</span>
  else if (!f.players.length) fate = <span className="muted">used on a keeper</span>
  else fate = <span>became {f.node ? '' : f.players.map((p, i) => <span key={p}>{i ? ' or ' : ''}<PlayerLink id={p} /></span>)}</span>
  return (
    <li>
      <div className="tree-row">
        {label}
        {a.kept.length > 0 && <span className="pill">kept {a.kept.join(', ')}</span>}
        <span className="tree-pts">{fmt(a.pts, 1)} pts</span>
        {fate}
      </div>
      {f.kind === 'traded' && !f.repeat && <Branch n={f.node} />}
      {f.kind === 'drafted' && f.node && <ul className="tree"><Asset a={f.node} /></ul>}
    </li>
  )
}

function Branch({ n }: { n: TradeNode }) {
  const pm = treesOf(useLeague()).pm
  const others = n.trade.sides.filter((s) => s.memberId !== n.side.memberId).map((s) => s.memberId)
  return (
    <ul className="tree">
      {n.got.length === 0 && <li className="muted">nothing came back</li>}
      {n.got.map((a) => <Asset key={a.kind + a.id} a={a} />)}
      <li className="muted tree-note">
        for {n.gave.map((g) => (/^\d{4} R/.test(g) ? g : playerName(pm, g))).join(', ') || 'nothing'} with {others.map((o, i) => <span key={o}>{i ? ', ' : ''}<MemberLink id={o} avatar={false} /></span>)}
      </li>
    </ul>
  )
}

export default function TradeTree() {
  const lg = useLeague()
  const { pm, tree } = treesOf(lg)
  const trades = useMemo(() => pm.trades
    .filter((t) => t.sides.some((s) => s.gets.length || s.picksIn.length))
    .map((t, i) => {
      const sides = t.sides.map((s) => ({ s, node: tree(t, s.memberId), tot: treeTotals(tree(t, s.memberId)) }))
      return { t, i, sides, margin: Math.abs(sides[0].tot.pts - (sides[1]?.tot.pts ?? 0)) }
    })
    .sort((a, b) => b.t.created - a.t.created), [pm, tree])
  const [sel, setSel] = useState(0)
  if (!trades.length) return <div className="page"><h1>Trade Trees</h1><p className="muted">No trades yet.</p></div>
  const cur = trades[Math.min(sel, trades.length - 1)]
  const deepest = [...trades].sort((a, b) => Math.max(...b.sides.map((x) => x.tot.depth)) - Math.max(...a.sides.map((x) => x.tot.depth)))[0]
  const lopsided = [...trades].sort((a, b) => b.margin - a.margin)[0]
  const best = trades.flatMap((x) => x.sides.map((s) => ({ ...s, x }))).sort((a, b) => b.tot.pts - a.tot.pts)[0]
  const summary = (x: (typeof trades)[number]) => x.sides.map((s) => `${lg.memberById[s.s.memberId]?.name ?? '?'}`).join(' ⇄ ')

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Trade Trees</h1>
          <p className="muted">Every trade, followed to the end: what each side got, what it was flipped into, and the points it produced.</p>
        </div>
      </div>
      <div className="stat-grid">
        <Stat icon="crown" label={`Most productive tree · ${fmt(best.tot.pts, 0)} pts`} value={lg.memberById[best.s.memberId]?.name} tip={TIP} />
        <Stat icon="bomb" label={`Most lopsided · ${fmt(lopsided.margin, 0)} pt gap`} value={`${lopsided.t.season} W${lopsided.t.week}`} />
        <Stat icon="repeat" label={`Deepest tree · ${Math.max(...deepest.sides.map((s) => s.tot.depth)) + 1} trades`} value={`${deepest.t.season} W${deepest.t.week}`} />
        <Stat icon="swap" label="Trades" value={trades.length} />
      </div>

      <div className="tree-layout">
        <Card title="Trades" sub="Newest first">
          <div className="tree-list">
            {trades.map((x, k) => {
              const win = [...x.sides].sort((a, b) => b.tot.pts - a.tot.pts)[0]
              return (
                <button key={x.i} className={`tree-item ${k === sel ? 'active' : ''}`} onClick={() => setSel(k)}>
                  <span className="muted">{x.t.season} W{x.t.week}</span>
                  <span>{summary(x)}</span>
                  <span className="muted">won by {lg.memberById[win.s.memberId]?.name} (+{fmt(x.margin, 0)})</span>
                </button>
              )
            })}
          </div>
        </Card>
        <div className="tree-sides">
          {cur.sides.map(({ s, node, tot }) => (
            <Card key={s.memberId} title={lg.memberById[s.memberId]?.name ?? s.memberId} sub={`${cur.t.season} week ${cur.t.week}`} right={<b className={tot.pts === Math.max(...cur.sides.map((x) => x.tot.pts)) ? 'pos' : ''}>{fmt(tot.pts, 1)} pts</b>}>
              <Branch n={node} />
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
