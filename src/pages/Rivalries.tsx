import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { rivalries, type Rivalry } from '../lib/rivalry'
import { fmt, record, type Game } from '../lib/stats'
import { Avatar, Card, Table, Tabs, type Col } from '../components/ui'

export const RIVALRY_TIP = 'Intensity 0–100: playoff stakes (35%: first round 2, semifinal 3, 3rd-place game 2, toilet bowl final 3, championship 5), games played (25%), how close the games are (15%), balance of the series (15%), and drama — 50-point blowouts and trades with each other (10%). Each part is relative to the league: a pair at the 80th percentile or above gets full marks.'

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

/** Manager names, which can differ from the franchise's current name in an archived series. */
export const sideName = (r: Rivalry, id: string | null) => (id === r.a ? r.aMgr.name : id === r.b ? r.bMgr.name : '—')
export const rivalryLink = (r: Rivalry) => `/versus/${r.a}/${r.b}${r.archived ? '#archived' : ''}`

const when = (g: Game | null) => (g ? `${g.season} ${g.playoff ? 'playoffs' : `W${g.week}`}` : '')

export function RivalriesSection() {
  const lg = useLeague()
  const all = useMemo(() => rivalries(lg), [lg])
  const active = all.filter((r) => !r.archived), archived = all.filter((r) => r.archived)
  const tabs = [`Active (${active.length})`, `Archived (${archived.length})`]
  const [tab, setTab] = useState(tabs[0])
  const shown = tab === tabs[1] ? archived : active
  const top = active.slice(0, 6)
  const cols: Col<Rivalry>[] = [
    { key: 'r', label: '#', render: (_, i) => i + 1, align: 'center' },
    { key: 'p', label: 'Rivalry', render: (r) => <Link to={rivalryLink(r)}>{r.aMgr.name} vs {r.bMgr.name}</Link> },
    ...(tab === tabs[1] ? [{ key: 'yrs', label: 'Seasons', render: (r: Rivalry) => { const f = r.last?.season, s = Math.max(r.aMgr.from, r.bMgr.from); return f && f !== s ? `${s}–${f}` : String(s) } }] : []),
    { key: 's', label: 'Intensity', render: (r) => <span style={{ whiteSpace: 'nowrap' }}><b>{fmt(r.score, 0)}</b><span className="odds-bar" style={{ width: Math.round(r.score / 2) }} /></span>, sort: (r) => r.score, align: 'right', tip: RIVALRY_TIP },
    { key: 'rec', label: 'Series', render: (r) => record(r.aW, r.bW, r.ties), align: 'right' },
    { key: 'g', label: 'Games', render: (r) => r.games, sort: (r) => r.games, align: 'right' },
    { key: 'm', label: 'Avg Margin', render: (r) => fmt(r.avgMargin, 1), sort: (r) => -r.avgMargin, align: 'right' },
    { key: 'c', label: 'Within 10', render: (r) => `${Math.round(r.closeShare * 100)}%`, sort: (r) => r.closeShare, align: 'right' },
    { key: 'po', label: 'Stakes', render: (r) => (r.stakes ? <span title={r.stakeGames.map((g) => `${g.season} ${g.label} (${g.pts})`).join(', ')}>{r.stakes} pts</span> : '—'), sort: (r) => r.stakes, align: 'right', tip: 'Playoff meeting points: first round 2, semifinal 3, 3rd-place game 2, toilet bowl final 3, championship 5.' },
    { key: 'b', label: '50+ Blowouts', render: (r) => r.blowouts || '—', sort: (r) => r.blowouts, align: 'right' },
    { key: 't', label: 'Trades', render: (r) => r.trades || '—', sort: (r) => r.trades, align: 'right' },
    { key: 'tags', label: '', render: (r) => r.tags.slice(0, 2).map((t) => <span key={t} className="pill">{t}</span>) },
  ]
  return (
    <>
      <Card title="Top Rivalries" sub="Current managers, ranked by how heated it is. Click one for the full series.">
      <div className="riv-grid">
        {top.map((r, i) => (
          <Link key={r.a + r.b} to={`/versus/${r.a}/${r.b}`} className="riv-card">
            <div className="riv-rank">#{i + 1} <span className="muted">· intensity {fmt(r.score, 0)}</span></div>
            <div className="riv-vs">
              <div><Avatar id={r.a} size={40} /><b>{r.aMgr.name}</b></div>
              <div className="riv-score">{r.aW}–{r.bW}{r.ties ? `–${r.ties}` : ''}</div>
              <div><Avatar id={r.b} size={40} /><b>{r.bMgr.name}</b></div>
            </div>
            <div className="riv-tags">{r.tags.map((t) => <span key={t} className="pill">{t}</span>)}</div>
            <RivalryMeter r={r} />
            <div className="riv-foot muted">
              {r.games} games · avg margin {fmt(r.avgMargin, 1)}{r.stakeGames.length ? ` · ${r.stakeGames.map((g) => `${g.season} ${g.label.toLowerCase()}`).join(', ')}` : ''}
              {r.streak.id && r.streak.n > 1 ? <> · {sideName(r, r.streak.id)} has won {r.streak.n} straight</> : null}
              {r.last ? <> · last met {when(r.last)}</> : null}
            </div>
          </Link>
        ))}
      </div>
      </Card>
      <Card title="All Rivalries" sub={tab === tabs[1] ? 'Series with a manager who has since handed their franchise over.' : 'Every pairing of current managers.'} right={<Tabs tabs={tabs} value={tab} onChange={setTab} />}>
        <Table key={tab} rows={shown} cols={cols} initialSort="s" rowKey={(r) => `${r.aMgr.managerId}|${r.bMgr.managerId}`} />
      </Card>
    </>
  )
}
