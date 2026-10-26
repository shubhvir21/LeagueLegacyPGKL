import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { rivalries } from '../lib/rivalry'
import { RivalriesSection, RivalryMeter } from './Rivalries'
import { HistoricalMatchupsSection } from './HistoricalMatchups'
import { careers, fmt, headToHead, pct, record, type Game } from '../lib/stats'
import { Avatar, Card, MemberLink, Stat } from '../components/ui'
import { Icon } from '../components/Icon'
import { signed } from './History'

export default function Versus() {
  const lg = useLeague()
  const nav = useNavigate()
  const ids = careers(lg).map((r) => r.member.id)
  const name = (id: string) => lg.memberById[id]?.name ?? '?'
  const pairs = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => ({ a, b, h: headToHead(lg, a, b) }))).filter((p) => p.h.games.length)
  const margin = (g: Game) => Math.abs(g.aPts - g.bPts)
  const winner = (g: Game) => (g.aPts >= g.bPts ? [g.a, g.b, g.aPts, g.bPts] : [g.b, g.a, g.bPts, g.aPts]) as [string, string, number, number]
  const highest = [...lg.games].sort((x, y) => y.aPts + y.bPts - (x.aPts + x.bPts))[0]
  const blowout = [...lg.games].sort((x, y) => margin(y) - margin(x))[0]
  const closest = [...lg.games].sort((x, y) => margin(x) - margin(y))[0]
  const most = [...pairs].sort((x, y) => y.h.games.length - x.h.games.length)[0]
  const contested = [...pairs].filter((p) => p.h.games.length >= 3).sort((x, y) => Math.abs(x.h.w - x.h.l) - Math.abs(y.h.w - y.h.l) || y.h.games.length - x.h.games.length)[0]
  const lopsided = [...pairs].filter((p) => p.h.games.length >= 3).sort((x, y) => Math.abs(y.h.w - y.h.l) / y.h.games.length - Math.abs(x.h.w - x.h.l) / x.h.games.length)[0]
  const streak = [...pairs].sort((x, y) => Number(y.h.streak.slice(1)) - Number(x.h.streak.slice(1)))[0]
  const tightest = [...pairs].filter((p) => p.h.games.length >= 3).sort((x, y) => Math.abs(x.h.pf - x.h.pa) / x.h.games.length - Math.abs(y.h.pf - y.h.pa) / y.h.games.length)[0]

  const hl = (icon: string, title: string, who: string, detail: string, to?: string) => (
    <Link to={to ?? '#'} className="highlight">
      <span className="highlight-icon"><Icon name={icon} /></span>
      <div><div className="highlight-who">{who}</div><div className="highlight-title">{title}</div><div className="muted small">{detail}</div></div>
    </Link>
  )
  const gameLine = (g: Game) => { const [w, l, wp, lp] = winner(g); return { who: `${name(w)} def. ${name(l)}`, d: `${fmt(wp)} – ${fmt(lp)} · ${g.season} W${g.week}` } }
  const ownerOf = (p: typeof lopsided) => (p.h.w >= p.h.l ? [p.a, p.b, p.h.w, p.h.l] : [p.b, p.a, p.h.l, p.h.w]) as [string, string, number, number]

  return (
    <div className="page">
      <h1>League Versus</h1>
      <div className="highlights">
        {tightest && hl('swords', 'Closest long-running series', `${name(tightest.a)} vs ${name(tightest.b)}`, `${fmt(Math.abs(tightest.h.pf - tightest.h.pa) / tightest.h.games.length)} pts/game apart`, `/versus/${tightest.a}/${tightest.b}`)}
        {contested && hl('scale', 'Most contested', `${name(contested.a)} vs ${name(contested.b)}`, record(contested.h.w, contested.h.l, contested.h.t), `/versus/${contested.a}/${contested.b}`)}
        {streak && (() => { const s = streak.h.streak; const [w, l] = s[0] === 'W' ? [streak.a, streak.b] : [streak.b, streak.a]; return hl('flame', 'Longest active streak', name(w), `W${s.slice(1)} vs ${name(l)}`, `/versus/${w}/${l}`) })()}
        {highest && (() => { const x = gameLine(highest); return hl('rocket', 'Highest scoring game', x.who, `${x.d} · ${fmt(highest.aPts + highest.bPts)} combined`) })()}
        {blowout && (() => { const x = gameLine(blowout); return hl('bomb', 'Biggest blowout', x.who, `${x.d} (+${fmt(margin(blowout))})`) })()}
        {most && hl('repeat', 'Most matchups', `${name(most.a)} vs ${name(most.b)}`, `${most.h.games.length} meetings`, `/versus/${most.a}/${most.b}`)}
        {closest && (() => { const x = gameLine(closest); return hl('target', 'Closest game ever', x.who, `${x.d} (+${fmt(margin(closest))})`) })()}
        {lopsided && (() => { const [o, v, w, l] = ownerOf(lopsided); return hl('crown', 'Most lopsided rivalry', `${name(o)} owns ${name(v)}`, `${w}-${l} · ${((w / (w + l)) * 100).toFixed(1)}%`, `/versus/${o}/${v}`) })()}
      </div>

      <Card title="Head-to-Head Grid" sub="Each row is that member's record against the column. Click a cell for the full series. Includes playoff and consolation games.">
        <div className="table-wrap">
          <table className="grid-table">
            <thead>
              <tr><th>Member</th>{ids.map((id) => <th key={id} className="center" title={name(id)}><Avatar id={id} /></th>)}</tr>
            </thead>
            <tbody>
              {ids.map((a) => (
                <tr key={a}>
                  <td><MemberLink id={a} /></td>
                  {ids.map((b) => {
                    if (a === b) return <td key={b} className="center muted">—</td>
                    const h = headToHead(lg, a, b)
                    if (!h.games.length) return <td key={b} className="center muted">·</td>
                    const r = h.w / (h.w + h.l + h.t)
                    return (
                      <td key={b} className="center h2h-cell" style={{ background: `color-mix(in srgb, ${r >= 0.5 ? 'var(--pos)' : 'var(--neg)'} ${Math.round(Math.abs(r - 0.5) * 120)}%, transparent)` }}
                        title={`${name(a)} vs ${name(b)}: ${record(h.w, h.l, h.t)}, ${fmt(h.pf)}–${fmt(h.pa)}`} onClick={() => nav(`/versus/${a}/${b}`)}>
                        {record(h.w, h.l, h.t)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <RivalriesSection />
      <HistoricalMatchupsSection />
    </div>
  )
}

export function VersusDetail() {
  const lg = useLeague()
  const nav = useNavigate()
  const { a, b } = useParams() as { a: string; b: string }
  const h = headToHead(lg, a, b)
  const name = (id: string) => lg.memberById[id]?.name ?? '?'
  const ids = careers(lg).map((r) => r.member.id)
  const reg = h.games.filter((g) => !g.playoff)
  const po = h.games.filter((g) => g.playoff)
  const sub = (gs: Game[]) => { const w = gs.filter((g) => g.aPts > g.bPts).length, l = gs.filter((g) => g.aPts < g.bPts).length; return record(w, l, gs.length - w - l) }
  const biggest = [...h.games].sort((x, y) => Math.abs(y.aPts - y.bPts) - Math.abs(x.aPts - x.bPts))[0]
  const all = rivalries(lg)
  const rank = all.findIndex((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a)) + 1
  const riv = all[rank - 1]
  const pick = (side: 'a' | 'b', v: string) => nav(side === 'a' ? `/versus/${v}/${b}` : `/versus/${a}/${v}`)
  return (
    <div className="page">
      <div className="page-head">
        <h1>Head to Head</h1>
        <div className="row">
          <select value={a} onChange={(e) => pick('a', e.target.value)}>{ids.filter((i) => i !== b).map((i) => <option key={i} value={i}>{name(i)}</option>)}</select>
          <span className="muted">vs</span>
          <select value={b} onChange={(e) => pick('b', e.target.value)}>{ids.filter((i) => i !== a).map((i) => <option key={i} value={i}>{name(i)}</option>)}</select>
        </div>
      </div>
      <div className="vs-head">
        <Link to={`/member/${a}`} className="vs-side"><Avatar id={a} size={64} /><b>{name(a)}</b></Link>
        <div className="vs-score">{record(h.w, h.l, h.t)}<div className="muted small">{h.games.length} meetings</div></div>
        <Link to={`/member/${b}`} className="vs-side"><Avatar id={b} size={64} /><b>{name(b)}</b></Link>
      </div>
      {riv && (
        <Card title={`Rivalry intensity · ${fmt(riv.score, 0)} / 100`} sub={`#${rank} of ${all.length} pairings`} right={<span>{riv.tags.map((x) => <span key={x} className="pill">{x}</span>)}</span>}>
          <RivalryMeter r={riv} />
        </Card>
      )}
      {h.games.length === 0 ? <p className="muted">These two have never played.</p> : (
        <>
          <div className="stat-grid">
            <Stat label="Regular season" value={sub(reg)} />
            <Stat label="Playoffs / consolation" value={po.length ? sub(po) : '—'} />
            <Stat label={`${name(a)} win %`} value={pct(h.w, h.l, h.t)} />
            <Stat label={`${name(a)} avg pts`} value={fmt(h.pf / h.games.length)} />
            <Stat label={`${name(b)} avg pts`} value={fmt(h.pa / h.games.length)} />
            <Stat label="Current streak" value={`${h.streak[0] === 'W' ? name(a) : name(b)} ${h.streak[0] === 'T' ? 'T' : 'W'}${h.streak.slice(1)}`} />
            {biggest && <Stat label="Biggest margin" value={`${signed(biggest.aPts - biggest.bPts)}`} />}
          </div>
          <Card title="Every Meeting">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Season</th><th>Week</th><th>Type</th><th>Winner</th><th className="right">Score</th><th className="right">Margin</th></tr></thead>
                <tbody>
                  {[...h.games].reverse().map((g) => {
                    const aw = g.aPts > g.bPts
                    return (
                      <tr key={`${g.season}-${g.week}`}>
                        <td><Link to={`/season/${g.season}`}>{g.season}</Link></td>
                        <td>{g.week}</td>
                        <td>{g.bracket === 'winners' ? <span className="pill">Playoffs</span> : g.bracket === 'losers' ? <span className="pill">Consolation</span> : 'Regular'}</td>
                        <td><MemberLink id={aw ? a : b} /></td>
                        <td className="right">{fmt(g.aPts)} – {fmt(g.bPts)}</td>
                        <td className={`right ${aw ? 'pos' : 'neg'}`}>{signed(g.aPts - g.bPts)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
