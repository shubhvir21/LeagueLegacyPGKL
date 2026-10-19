import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { careers, ordinal, type Season, type TeamSeason } from '../lib/stats'
import { buildRecords } from '../lib/records'
import { Card, MemberLink, Tabs } from '../components/ui'
import { Bracket } from './Season'

const PREDICTORS = ['Retention', 'Reg. Season #1', 'Most Points', 'All-Play #1', 'Coach Score #1', 'Defending Champ', 'League Rating #1'] as const
type Predictor = (typeof PREDICTORS)[number]

export default function Playoffs() {
  const lg = useLeague()
  const done = lg.seasons.filter((s) => s.complete)
  const years = [...done].reverse()
  const rows = careers(lg)
  const [pred, setPred] = useState<Predictor>('Retention')
  const [bracketYear, setBracketYear] = useState(done[0]?.year)
  const records = buildRecords(lg)
  const streaks = records.find((r) => r.id === 'st-po')!
  const droughts = records.find((r) => r.id === 'st-nopo')!

  if (!done.length) return <div className="page"><h1>Playoffs</h1><p className="muted">No completed seasons yet.</p></div>

  return (
    <div className="page">
      <h1>Playoffs</h1>
      <Card title="Playoff Participation" sub="Every completed season at a glance: who made it, who won, and who missed out.">
        <div className="table-wrap">
          <table className="grid-table">
            <thead><tr><th>Member</th>{years.map((s) => <th key={s.year} className="center"><Link to={`/season/${s.year}`}>{s.year}</Link></th>)}<th className="center">Apps</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.member.id}>
                  <td><MemberLink id={r.member.id} /></td>
                  {years.map((s) => {
                    const t = s.teamSeasons.find((x) => x.memberId === r.member.id)
                    if (!t) return <td key={s.year} className="center muted">·</td>
                    const cls = t.finalRank === 1 ? 'gold' : t.finalRank === 2 ? 'silver' : t.finalRank === 3 ? 'bronze' : t.madePlayoffs ? 'made' : 'missed'
                    return <td key={s.year} className="center"><span className={`part ${cls}`}>{ordinal(t.finalRank!)}</span></td>
                  })}
                  <td className="center"><b>{r.playoffs}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="legend">
          <span><i className="part gold" /> Champion</span><span><i className="part silver" /> Runner-up</span><span><i className="part bronze" /> 3rd</span>
          <span><i className="part made" /> Playoffs</span><span><i className="part missed" /> Missed</span>
        </div>
      </Card>

      <Card title="Playoff Predictors" sub="Does winning the regular season guarantee a ring? Let's find out.">
        <Tabs tabs={PREDICTORS} value={pred} onChange={setPred} />
        <PredictorTable seasons={done} all={lg.seasons} pred={pred} />
      </Card>

      <div className="two-col">
        <Card title="Playoff Appearance Streaks" sub="Longest runs of consecutive playoff trips.">
          <StreakList rows={streaks.rows.filter((r) => r.value > 1).slice(0, 8)} />
        </Card>
        <Card title="Playoff Droughts" sub="Longest runs of missing the playoffs.">
          <StreakList rows={droughts.rows.filter((r) => r.value > 1).slice(0, 8)} />
        </Card>
      </div>

      <Card
        title="Brackets"
        right={<select value={bracketYear} onChange={(e) => setBracketYear(Number(e.target.value))}>{done.map((s) => <option key={s.year}>{s.year}</option>)}</select>}
      >
        {(() => {
          const s = done.find((x) => x.year === bracketYear)!
          return <Bracket s={s} games={lg.games.filter((g) => g.season === s.year && g.bracket === 'winners')} />
        })()}
      </Card>
    </div>
  )
}

function StreakList({ rows }: { rows: { memberId: string; display: string; context: string }[] }) {
  if (!rows.length) return <p className="muted">No multi-season streaks yet.</p>
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Member</th><th>Streak</th><th>Seasons</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}><td><MemberLink id={r.memberId} /></td><td><b>{r.display}</b></td><td className="muted">{r.context}</td></tr>)}</tbody>
    </table></div>
  )
}

function PredictorTable({ seasons, all, pred }: { seasons: Season[]; all: Season[]; pred: Predictor }) {
  const lg = useLeague()
  const champ = (s: Season) => s.teamSeasons.find((t) => t.finalRank === 1)!
  const leader = (s: Season, f: (t: TeamSeason) => number) => [...s.teamSeasons].sort((a, b) => f(b) - f(a))[0]
  const prev = (s: Season) => all.find((x) => x.year === s.year - 1)

  if (pred === 'Retention') {
    const rows = seasons.map((s) => {
      const p = prev(s)
      if (!p?.complete) return null
      const before = new Set(p.teamSeasons.filter((t) => t.madePlayoffs).map((t) => t.memberId))
      const back = s.teamSeasons.filter((t) => t.madePlayoffs && before.has(t.memberId))
      return { s, back, of: before.size }
    }).filter((x) => !!x)
    const avg = rows.reduce((a, r) => a + r.back.length / r.of, 0) / (rows.length || 1)
    if (!rows.length) return <p className="muted">Needs two completed seasons.</p>
    return (
      <>
        <p className="muted">On average, <b>{Math.round(avg * 100)}%</b> of last year's playoff teams make it back.</p>
        <div className="table-wrap"><table>
          <thead><tr><th>Season</th><th>Returned</th><th>Who</th><th>Rate</th></tr></thead>
          <tbody>{rows.map(({ s, back, of }) => (
            <tr key={s.year}><td>{s.year}</td><td>{back.length} of {of}</td><td><span className="row">{back.map((t) => <MemberLink key={t.memberId} id={t.memberId} />)}</span></td><td><Bar pct={back.length / of} /></td></tr>
          ))}</tbody>
        </table></div>
      </>
    )
  }

  const pickers: Record<Exclude<Predictor, 'Retention'>, (s: Season) => TeamSeason | undefined> = {
    'Reg. Season #1': (s) => s.teamSeasons.find((t) => t.regRank === 1),
    'Most Points': (s) => leader(s, (t) => t.pf),
    'All-Play #1': (s) => leader(s, (t) => t.apW),
    'Coach Score #1': (s) => leader(s, (t) => t.coachScore ?? 0),
    'Defending Champ': (s) => { const p = prev(s); const id = p?.champion; return id ? s.teamSeasons.find((t) => t.memberId === id) : undefined },
    'League Rating #1': (s) => { const p = prev(s); if (!p) return undefined; const best = leader(p, (t) => t.eloEnd); return s.teamSeasons.find((t) => t.memberId === best.memberId) },
  }
  const rows = seasons.map((s) => ({ s, t: pickers[pred](s) })).filter((x) => x.t)
  const made = rows.filter((r) => r.t!.madePlayoffs).length
  const won = rows.filter((r) => r.t!.finalRank === 1).length
  const note = pred === 'Defending Champ' ? 'Last season’s champion' : pred === 'League Rating #1' ? 'Highest-rated member entering the season' : `The ${pred.replace(' #1', ' leader')}`
  return (
    <>
      <p className="muted">
        {note} made the playoffs <b>{made}/{rows.length}</b> times and won the title <b>{won}/{rows.length}</b> times.
      </p>
      <div className="table-wrap"><table>
        <thead><tr><th>Season</th><th>Team</th><th>Reg. Rank</th><th>Made Playoffs</th><th>Finish</th><th>Champion</th></tr></thead>
        <tbody>{rows.map(({ s, t }) => (
          <tr key={s.year}>
            <td>{s.year}</td><td><MemberLink id={t!.memberId} /></td><td>{ordinal(t!.regRank)}</td>
            <td>{t!.madePlayoffs ? <span className="pos">Yes</span> : <span className="neg">No</span>}</td>
            <td>{ordinal(t!.finalRank!)}{t!.finalRank === 1 && <span className="pill">Champion</span>}</td>
            <td><MemberLink id={champ(s).memberId} /> <span className="muted small">({ordinal(champ(s).regRank)} seed)</span></td>
          </tr>
        ))}</tbody>
      </table></div>
      {!rows.length && <p className="muted">{lg.seasons.length < 2 ? 'Needs two seasons.' : 'No data yet.'}</p>}
    </>
  )
}

function Bar({ pct }: { pct: number }) {
  return (
    <span className="bar-wrap"><span className="bar" style={{ width: `${pct * 100}%` }} /><span className="small">{Math.round(pct * 100)}%</span></span>
  )
}
