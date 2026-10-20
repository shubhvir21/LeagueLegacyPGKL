import { useMemo, useState } from 'react'
import { useLeague } from '../lib/data'
import { playersOf, playerName, type Trade } from '../lib/players'
import { whatIf, type WhatIfTeam } from '../lib/whatif'
import { fmt, record } from '../lib/stats'
import { Avatar, Card, MemberLink, Table, type Col } from '../components/ui'
import { signed } from './History'

const FINISH = { 1: 'Champion', 2: 'Runner-up', 3: 'Semifinal', 5: 'Quarterfinal' } as Record<number, string>
const fin = (f: number | null) => (f == null ? '—' : FINISH[f] ?? `${f}`)

export default function WhatIf() {
  const lg = useLeague()
  const pm = playersOf(lg)
  const years = lg.seasons.map((s) => s.year)
  const [year, setYear] = useState(lg.seasons.find((s) => s.complete)?.year ?? years[0])
  const [perfect, setPerfect] = useState(false)
  const [noMedian, setNoMedian] = useState(false)
  const [undo, setUndo] = useState<Trade[]>([])
  const [remove, setRemove] = useState<{ memberId: string; playerId: string }[]>([])
  const [rmMember, setRmMember] = useState('')
  const s = lg.seasons.find((x) => x.year === year)!
  const name = (id: string | null) => (id ? lg.memberById[id]?.name ?? id : '—')

  const trades = pm.trades.filter((t) => t.season === year && t.sides.some((x) => x.gets.length))
  const tradeLabel = (t: Trade) => `W${t.week}: ${t.sides.map((x) => `${name(x.memberId)} gets ${x.gets.map((p) => playerName(pm, p)).join(', ') || 'picks'}`).join(' · ')}`
  const starters = useMemo(() => {
    const tot: Record<string, number> = {}
    for (const w of pm.weeks) if (w.season === year && w.memberId === rmMember && w.started) tot[w.playerId] = (tot[w.playerId] ?? 0) + w.pts
    return Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 25)
  }, [pm, year, rmMember])

  const res = useMemo(() => whatIf(lg, year, { perfect, noMedian, undo, remove }), [lg, year, perfect, noMedian, undo, remove])
  const changed = perfect || noMedian || undo.length || remove.length
  const reset = (y = year) => { setYear(y); setPerfect(false); setNoMedian(false); setUndo([]); setRemove([]); setRmMember('') }
  if (!res) return null
  const flipped = res.champion && res.actualChampion && res.champion !== res.actualChampion

  const cols: Col<WhatIfTeam>[] = [
    { key: 'sd', label: 'Seed', render: (t) => <span><b>{t.seed}</b> {t.seed !== t.actualSeed && <span className={t.seed < t.actualSeed ? 'pos' : 'neg'}>{t.seed < t.actualSeed ? '▲' : '▼'}{Math.abs(t.seed - t.actualSeed)}</span>}</span>, sort: (t) => -t.seed, align: 'center' },
    { key: 'm', label: 'Team', render: (t) => <MemberLink id={t.memberId} /> },
    { key: 'r', label: 'What-If Record', render: (t) => <b>{record(t.wins, t.losses)}</b>, sort: (t) => t.wins, align: 'right' },
    { key: 'a', label: 'Actual', render: (t) => <span className="muted">{record(t.actualWins, t.actualLosses)}</span>, align: 'right' },
    { key: 'dw', label: 'Δ Wins', render: (t) => { const d = t.wins - t.actualWins; return d ? <span className={d > 0 ? 'pos' : 'neg'}>{d > 0 ? '+' : ''}{d}</span> : <span className="muted">0</span> }, sort: (t) => t.wins - t.actualWins, align: 'right' },
    { key: 'pf', label: 'Points For', render: (t) => fmt(t.pf, 1), sort: (t) => t.pf, align: 'right' },
    { key: 'dp', label: 'Δ PF', render: (t) => { const d = t.pf - t.actualPf; return Math.abs(d) < 0.05 ? <span className="muted">0</span> : <span className={d > 0 ? 'pos' : 'neg'}>{signed(d)}</span> }, sort: (t) => t.pf - t.actualPf, align: 'right' },
    { key: 'f', label: 'What-If Finish', render: (t) => <b className={t.finish === 1 ? 'pos' : ''}>{fin(t.finish)}</b>, sort: (t) => -(t.finish ?? 99), align: 'right' },
    { key: 'af', label: 'Actual Finish', render: (t) => <span className="muted">{fin(t.actualFinish)}</span>, sort: (t) => -(t.actualFinish ?? 99), align: 'right' },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>What-If Machine</h1>
          <p className="muted">Change the past and replay the standings and the bracket.</p>
        </div>
        <select value={year} onChange={(e) => reset(Number(e.target.value))}>
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
      </div>

      <Card title="Scenario" right={changed ? <button className="pill-btn" onClick={() => reset()}>Reset</button> : undefined}>
        <div className="wi-controls">
          <label className="wi-toggle"><input type="checkbox" checked={perfect} onChange={(e) => setPerfect(e.target.checked)} /> <span><b>Perfect lineups</b><br /><span className="muted">Everyone starts their best possible lineup every week</span></span></label>
          <label className="wi-toggle"><input type="checkbox" checked={noMedian} onChange={(e) => setNoMedian(e.target.checked)} /> <span><b>No median games</b><br /><span className="muted">Head-to-head wins only</span></span></label>
          <div className="wi-field">
            <b>Undo a trade</b>
            <select value="" onChange={(e) => { const t = trades[Number(e.target.value)]; if (t && !undo.includes(t)) setUndo([...undo, t]) }}>
              <option value="">{trades.length ? 'Pick a trade…' : 'No trades this season'}</option>
              {trades.map((t, i) => <option key={i} value={i} disabled={undo.includes(t)}>{tradeLabel(t)}</option>)}
            </select>
          </div>
          <div className="wi-field">
            <b>Remove a player</b>
            <div className="row">
              <select value={rmMember} onChange={(e) => setRmMember(e.target.value)}>
                <option value="">Franchise…</option>
                {s.teamSeasons.map((t) => <option key={t.memberId} value={t.memberId}>{name(t.memberId)}</option>)}
              </select>
              <select value="" disabled={!rmMember} onChange={(e) => { if (e.target.value) setRemove([...remove, { memberId: rmMember, playerId: e.target.value }]) }}>
                <option value="">Player…</option>
                {starters.map(([pid, pts]) => <option key={pid} value={pid}>{playerName(pm, pid)} ({fmt(pts, 0)} started pts)</option>)}
              </select>
            </div>
          </div>
        </div>
        {(undo.length > 0 || remove.length > 0) && (
          <div className="wi-chips">
            {undo.map((t, i) => <button key={`u${i}`} className="pill-btn" onClick={() => setUndo(undo.filter((x) => x !== t))}>✕ Undo {tradeLabel(t)}</button>)}
            {remove.map((r, i) => <button key={`r${i}`} className="pill-btn" onClick={() => setRemove(remove.filter((_, k) => k !== i))}>✕ {name(r.memberId)} without {playerName(pm, r.playerId)}</button>)}
          </div>
        )}
      </Card>

      {res.champion ? (
        <div className={`wi-result ${flipped ? 'flipped' : ''}`}>
          <Avatar id={res.champion} size={48} />
          <div>
            <div className="muted">{changed ? 'What-if champion' : 'Champion (replayed)'}</div>
            <div className="wi-champ">{name(res.champion)}</div>
            <div className="muted">{flipped ? <>Actually won by <b>{name(res.actualChampion)}</b> — history changes.</> : changed ? 'Same champion as real life.' : 'Toggle something above to rewrite history.'}</div>
          </div>
        </div>
      ) : <div className="banner">{s.complete ? 'Playoff scores are missing for this season.' : `${year} is in progress — standings so far; the bracket replays once the season is done.`}</div>}

      <Card title="Standings" sub="Seeds by wins, then points for. Arrows show seed change vs. what really happened.">
        <Table rows={res.teams} cols={cols} initialSort="sd" rowKey={(t) => t.memberId} />
      </Card>

      {res.bracket.length > 0 && (
        <Card title="Replayed Bracket" sub="Using the real pairings when the same teams are alive (top seeds pick opponents), else best vs. worst seed">
          <div className="wi-bracket">
            {res.bracket.map((r) => (
              <div key={r.round}>
                <h3 className="sub-head">{r.round}</h3>
                {r.games.map((g) => (
                  <div key={g.a + g.b} className="wi-game">
                    <span className={g.aPts >= g.bPts ? 'win' : ''}><MemberLink id={g.a} /> {fmt(g.aPts, 1)}</span>
                    <span className={g.bPts > g.aPts ? 'win' : ''}><MemberLink id={g.b} /> {fmt(g.bPts, 1)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
