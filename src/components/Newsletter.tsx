import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { currentIssue, type Note } from '../lib/newsletter'
import { Avatar, MemberLink } from './ui'

const pct = (p: number) => `${Math.round(p * 100)}%`

/** "The PGKL Weekly": shown on Home during weeks 1–17 of a season in progress. */
export function Newsletter() {
  const lg = useLeague()
  const issue = useMemo(() => currentIssue(lg), [lg])
  const [open, setOpen] = useState(false)
  if (!issue) return null
  const nm = (id: string) => lg.memberById[id]?.name ?? id
  const date = issue.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const notes = (xs: Note[]) => xs.map((n, i) => (
    <li key={i} className={n.good ? 'good' : 'bad'}>
      <span className="nl-dot" />
      <span><b>{nm(n.memberId)}{n.memberId2 && ` & ${nm(n.memberId2)}`}</b> {n.text}</span>
    </li>
  ))

  return (
    <article className={`newsletter ${open ? 'open' : ''}`}>
      <header className="nl-mast">
        <div className="nl-mast-row"><span>Vol. {issue.year - (lg.seasons.at(-1)?.year ?? issue.year) + 1}</span><span>Issue No. {issue.no}</span></div>
        <h2>The PGKL Weekly</h2>
        <div className="nl-mast-row"><span>{date}</span><span>Week {issue.week} edition</span></div>
      </header>

      <div className="nl-lead">
        <h3>{issue.headline}</h3>
        {issue.lede.map((p, i) => <p key={i}>{p}</p>)}
      </div>

      {open && (
        <div className="nl-body">
          <section>
            <h4>Around the League</h4>
            <ul className="nl-recaps">
              {issue.games.map((g, i) => (
                <li key={i}>
                  <span className="nl-score"><Avatar id={g.winner} size={20} /><b>{g.wPts.toFixed(1)}</b><span className="muted">–</span><span className="muted">{g.lPts.toFixed(1)}</span><Avatar id={g.loser} size={20} /></span>
                  <p>{g.text}</p>
                </li>
              ))}
            </ul>
          </section>

          {(issue.records.length > 0 || issue.milestones.length > 0) && (
            <section>
              <h4>Record Watch</h4>
              <ul className="nl-notes">{notes(issue.records)}{notes(issue.milestones)}</ul>
              <Link to="/records" className="nl-link">The Record Book →</Link>
            </section>
          )}

          <section>
            <h4>Standings</h4>
            <div className="table-wrap"><table className="nl-table">
              <thead><tr><th>#</th><th>Team</th><th className="right">Record</th><th className="right">PF</th>{issue.standings[0]?.odds != null && <th className="right">Playoff odds</th>}</tr></thead>
              <tbody>
                {issue.standings.map((r) => (
                  <tr key={r.memberId}>
                    <td>{r.rank}{r.move !== 0 && <span className={`nl-move ${r.move > 0 ? 'up' : 'down'}`}>{r.move > 0 ? '▲' : '▼'}{Math.abs(r.move)}</span>}</td>
                    <td><MemberLink id={r.memberId} /></td>
                    <td className="right">{r.w}-{r.l}{r.t ? `-${r.t}` : ''}</td>
                    <td className="right">{r.pf.toFixed(1)}</td>
                    {r.odds != null && <td className="right">{pct(r.odds)}{r.oddsMove != null && Math.abs(r.oddsMove) >= 0.01 && <span className={`nl-move ${r.oddsMove > 0 ? 'up' : 'down'}`}>{r.oddsMove > 0 ? '+' : '−'}{Math.round(Math.abs(r.oddsMove) * 100)}</span>}</td>}
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>

          {issue.preview.length > 0 && (
            <section>
              <h4>Week {issue.nextWeek} Preview</h4>
              {issue.gameOfWeek && (
                <div className="nl-gotw">
                  <span className="nl-kicker">Game of the week</span>
                  <div className="nl-gotw-teams"><MemberLink id={issue.gameOfWeek.a} /><span className="muted">vs</span><MemberLink id={issue.gameOfWeek.b} /></div>
                  <p>{issue.gameOfWeek.text}</p>
                </div>
              )}
              <ul className="nl-recaps">
                {issue.preview.filter((p) => p !== issue.gameOfWeek).map((p, i) => (
                  <li key={i}>
                    <span className="nl-score"><Avatar id={p.a} size={20} /><span className="nl-odds">{pct(p.pA)}</span><span className="muted">vs</span><span className="nl-odds">{pct(1 - p.pA)}</span><Avatar id={p.b} size={20} /></span>
                    <p>{p.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <button className="nl-toggle" onClick={() => setOpen(!open)}>{open ? 'Close the issue' : 'Read the full issue'}</button>
    </article>
  )
}
