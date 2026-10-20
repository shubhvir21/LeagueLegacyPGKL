import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { rivalries, type Rivalry } from '../lib/rivalry'
import { fmt, record, type Game } from '../lib/stats'
import { Avatar, Card, Table, type Col } from '../components/ui'

export const RIVALRY_TIP = 'Intensity 0–100: balance of the series (25%), how close the games are (25%), playoff stakes (20%: first round 2, semifinal 3, 3rd-place game 3, toilet bowl final 3, championship 5), games played (15%), and drama — 50-point blowouts and trades with each other (15%). Each part is relative to the league: a pair at the 80th percentile or above gets full marks.'

const PART_LABELS: [keyof Rivalry['parts'], string][] = [['balance', 'Balance'], ['closeness', 'Closeness'], ['stakes', 'Stakes'], ['volume', 'Volume'], ['drama', 'Drama']]

export function RivalryMeter({ r }: { r: Rivalry }) {
  return (
    <div className="riv-parts">
      {PART_LABELS.map(([k, label]) => (
        <div key={k} className="riv-part">
          <span>{label}</span>
          <div className="riv-track"><div style={{ width: `${Math.round(r.parts[k] * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

const when = (g: Game | null) => (g ? `${g.season} ${g.playoff ? 'playoffs' : `W${g.week}`}` : '')

export default function Rivalries() {
  const lg = useLeague()
  const all = useMemo(() => rivalries(lg), [lg])
  const name = (id: string | null) => (id ? lg.memberById[id]?.name ?? id : '—')
  const top = all.slice(0, 6)
  const cols: Col<Rivalry>[] = [
    { key: 'r', label: '#', render: (_, i) => i + 1, align: 'center' },
    { key: 'p', label: 'Rivalry', render: (r) => <Link to={`/versus/${r.a}/${r.b}`}>{name(r.a)} vs {name(r.b)}</Link> },
    { key: 's', label: 'Intensity', render: (r) => <span style={{ whiteSpace: 'nowrap' }}><b>{fmt(r.score, 0)}</b><span className="odds-bar" style={{ width: Math.round(r.score / 2) }} /></span>, sort: (r) => r.score, align: 'right', tip: RIVALRY_TIP },
    { key: 'rec', label: 'Series', render: (r) => record(r.aW, r.bW, r.ties), align: 'right' },
    { key: 'g', label: 'Games', render: (r) => r.games, sort: (r) => r.games, align: 'right' },
    { key: 'm', label: 'Avg Margin', render: (r) => fmt(r.avgMargin, 1), sort: (r) => -r.avgMargin, align: 'right' },
    { key: 'c', label: 'Within 10', render: (r) => `${Math.round(r.closeShare * 100)}%`, sort: (r) => r.closeShare, align: 'right' },
    { key: 'po', label: 'Stakes', render: (r) => (r.stakes ? <span title={r.stakeGames.map((g) => `${g.season} ${g.label} (${g.pts})`).join(', ')}>{r.stakes} pts</span> : '—'), sort: (r) => r.stakes, align: 'right', tip: 'Playoff meeting points: first round 2, semifinal 3, 3rd-place game 3, toilet bowl final 3, championship 5.' },
    { key: 'b', label: '50+ Blowouts', render: (r) => r.blowouts || '—', sort: (r) => r.blowouts, align: 'right' },
    { key: 't', label: 'Trades', render: (r) => r.trades || '—', sort: (r) => r.trades, align: 'right' },
    { key: 'tags', label: '', render: (r) => r.tags.slice(0, 2).map((t) => <span key={t} className="pill">{t}</span>) },
  ]
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Rivalries</h1>
          <p className="muted">Every pairing, ranked by how heated it is. Click one for the full series.</p>
        </div>
      </div>
      <div className="riv-grid">
        {top.map((r, i) => (
          <Link key={r.a + r.b} to={`/versus/${r.a}/${r.b}`} className="riv-card">
            <div className="riv-rank">#{i + 1} <span className="muted">· intensity {fmt(r.score, 0)}</span></div>
            <div className="riv-vs">
              <div><Avatar id={r.a} size={40} /><b>{name(r.a)}</b></div>
              <div className="riv-score">{r.aW}–{r.bW}{r.ties ? `–${r.ties}` : ''}</div>
              <div><Avatar id={r.b} size={40} /><b>{name(r.b)}</b></div>
            </div>
            <div className="riv-tags">{r.tags.map((t) => <span key={t} className="pill">{t}</span>)}</div>
            <RivalryMeter r={r} />
            <div className="riv-foot muted">
              {r.games} games · avg margin {fmt(r.avgMargin, 1)}{r.stakeGames.length ? ` · ${r.stakeGames.map((g) => `${g.season} ${g.label.toLowerCase()}`).join(', ')}` : ''}
              {r.streak.id && r.streak.n > 1 ? <> · {name(r.streak.id)} has won {r.streak.n} straight</> : null}
              {r.last ? <> · last met {when(r.last)}</> : null}
            </div>
          </Link>
        ))}
      </div>
      <Card title="All Rivalries" sub={`${all.length} pairings`}>
        <Table rows={all} cols={cols} initialSort="s" rowKey={(r) => r.a + r.b} />
      </Card>
    </div>
  )
}
