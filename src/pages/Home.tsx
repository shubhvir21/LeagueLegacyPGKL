import { Link } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { fmt, headToHead, record, type ScheduledGame } from '../lib/stats'
import { Avatar, Card, MemberLink, RankBadge } from '../components/ui'
import { GameCard } from './Season'
import { playersOf } from '../lib/players'
import { PlayerLink } from '../components/PlayerLink'
import { Icon } from '../components/Icon'

export default function Home() {
  const lg = useLeague()
  const current = lg.seasons[0]
  const lastDone = lg.seasons.find((s) => s.complete)
  const lastWeek = Math.max(0, ...lg.games.filter((g) => g.season === current.year).map((g) => g.week))
  const lastGames = lg.games.filter((g) => g.season === current.year && g.week === lastWeek)
  const nextWeek = Math.min(...lg.schedule.filter((g) => g.season === current.year).map((g) => g.week))
  const upcoming = lg.schedule.filter((g) => g.season === current.year && g.week === nextWeek)
  const champs = lg.seasons.filter((s) => s.complete && s.champion) // newest first
  const pm = playersOf(lg)
  const activity = [
    ...pm.moves.map((m) => ({ created: m.created, kind: m.type === 'free_agent' ? 'Free agent' : 'Waiver', m })),
    ...pm.drops.filter((d) => d.standalone).map((d) => ({ created: d.created, kind: 'Drop', d })),
    ...pm.trades.filter((t) => t.sides.some((x) => x.gets.length || x.picksIn.length)).map((t) => ({ created: t.created, kind: 'Trade', t })),
  ].sort((a, b) => b.created - a.created).slice(0, 10)
  const when = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  return (
    <div className="page">
      <div className="hero">
        <div>
          <div className="eyebrow">Est. {lg.seasons.at(-1)?.year} · Sleeper</div>
          <h1>{current.name}</h1>
          <p className="muted">{lg.seasons.length} seasons · {current.teams} teams · {current.year} {current.complete ? 'complete' : `through week ${current.weeksPlayed}`}</p>
        </div>
        {champs.length > 0 && (
          <ol className="champ-list" aria-label="Champions">
            {champs.map((s, i) => (
              <li key={s.year}>
                <Link to={`/season/${s.year}`} className={`champ-row ${i === 0 ? 'latest' : ''}`}>
                  <span className="champ-year">{s.year}</span>
                  <Avatar id={s.champion!} size={i === 0 ? 34 : 26} />
                  <span className="champ-name">{lg.memberById[s.champion!]?.name}</span>
                  {i === 0 && <span className="champ-tag"><Icon name="trophy" size={12} /> Reigning</span>}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="two-col">
        <Card title={`${current.year} Standings`} right={<Link to={`/season/${current.year}`}>Full season →</Link>}>
          <div className="table-wrap"><table><tbody>{current.teamSeasons.map((t) => (
            <tr key={t.memberId}>
              <td><RankBadge rank={t.finalRank ?? t.regRank} n={current.teams} final={current.complete} /></td>
              <td><Link to={`/season/${current.year}/team/${t.memberId}`} className="member-link"><Avatar id={t.memberId} /><span>{t.teamName}</span></Link></td>
              <td>{record(t.wins, t.losses, t.ties)}</td>
              <td className="right">{fmt(t.pf)}</td>
            </tr>
          ))}</tbody></table></div>
        </Card>
        <Card title="League Activity" sub="Latest transactions." right={<Link to="/transactions">All →</Link>}>
          <ul className="feed">
            {activity.map((a, i) => (
              <li key={i} className="feed-item">
                <span className={`feed-icon ${a.kind === 'Trade' ? 'trade' : a.kind === 'Drop' ? 'drop' : 'add'}`}>
                  <Icon name={a.kind === 'Trade' ? 'swap' : a.kind === 'Drop' ? 'minus' : 'plus'} size={14} />
                </span>
                <div className="feed-body">
                  {'m' in a && a.m && (
                    <>
                      <div className="feed-line"><MemberLink id={a.m.memberId} avatar={false} /> <span className="muted">added</span> <PlayerLink id={a.m.playerId} /></div>
                      {a.m.dropId && <div className="feed-line small"><span className="muted">dropped</span> <PlayerLink id={a.m.dropId} /></div>}
                    </>
                  )}
                  {'d' in a && a.d && (
                    <div className="feed-line"><MemberLink id={a.d.memberId} avatar={false} /> <span className="muted">dropped</span> <PlayerLink id={a.d.playerId} /></div>
                  )}
                  {'t' in a && a.t && a.t.sides.map((x) => (
                    <div key={x.memberId} className="feed-line">
                      <MemberLink id={x.memberId} avatar={false} /> <span className="muted">gets</span>{' '}
                      {[...x.gets.map((p) => <PlayerLink key={p} id={p} />), ...x.picksIn.map((p) => <span key={p} className="pill" style={{ marginLeft: 0 }}>{p} pick</span>)]
                        .flatMap((el, j) => (j ? [<span key={`c${j}`} className="muted">, </span>, el] : [el]))}
                      {!x.gets.length && !x.picksIn.length && <span className="muted">nothing</span>}
                    </div>
                  ))}
                </div>
                <div className="feed-meta">
                  <span className="feed-kind">{a.kind}{'m' in a && a.m?.bid ? ` · $${a.m.bid}` : ''}</span>
                  <span className="muted small">{when(a.created)}</span>
                </div>
              </li>
            ))}
            {!activity.length && <li className="muted">No transactions yet.</li>}
          </ul>
        </Card>
      </div>

      {lastGames.length > 0 && (
        <Card title={`Week ${lastWeek} Results`}>
          <div className="game-grid">{lastGames.map((g) => <GameCard key={g.a} g={g} />)}</div>
        </Card>
      )}
      {upcoming.length > 0 && (
        <Card title={`Week ${nextWeek} Matchups`} right={<Link to="/schedule">Schedule →</Link>}>
          <div className="game-grid">{upcoming.map((g) => <Preview key={g.a} g={g} />)}</div>
        </Card>
      )}
    </div>
  )
}

export function Preview({ g }: { g: ScheduledGame }) {
  const lg = useLeague()
  const h = headToHead(lg, g.a, g.b)
  const team = (id: string) => lg.seasons[0].teamSeasons.find((t) => t.memberId === id)
  const side = (id: string) => {
    const t = team(id)
    return (
      <Link to={`/member/${id}`} className="game-side win">
        <Avatar id={id} size={20} /> <span>{t?.teamName ?? lg.memberById[id]?.name}</span>
        <span className="muted small">{t ? record(t.wins, t.losses, t.ties) : ''}</span>
      </Link>
    )
  }
  return (
    <div className="preview">
      <div className="game">{side(g.a)}{side(g.b)}</div>
      <div className="muted small">
        All-time: {lg.memberById[g.a]?.name} {record(h.w, h.l, h.t)}{h.streak && ` · streak ${h.streak[0] === 'W' ? lg.memberById[g.a]?.name : lg.memberById[g.b]?.name} ${h.streak.replace('L', 'W')}`}
        {' · '}<Link to={`/versus/${g.a}/${g.b}`}>H2H →</Link>
      </div>
    </div>
  )
}

export function Schedule() {
  const lg = useLeague()
  const year = lg.seasons[0].year
  const weeks = [...new Set(lg.schedule.filter((g) => g.season === year).map((g) => g.week))].sort((a, b) => a - b)
  const done = [...new Set(lg.games.filter((g) => g.season === year).map((g) => g.week))].sort((a, b) => b - a)
  return (
    <div className="page">
      <h1>{year} Schedule</h1>
      {weeks.length === 0 && <p className="muted">No upcoming matchups.</p>}
      {weeks.map((w, i) => (
        <Card key={w} title={`Week ${w}`} sub={i === 0 && w === lg.nflWeek ? 'This week · in progress' : i === 0 ? 'Up next' : undefined}>
          <div className="game-grid">{lg.schedule.filter((g) => g.season === year && g.week === w).map((g) => <Preview key={g.a} g={g} />)}</div>
        </Card>
      ))}
      <h2>Completed</h2>
      {done.map((w) => (
        <Card key={w} title={`Week ${w}`}>
          <div className="game-grid">{lg.games.filter((g) => g.season === year && g.week === w).map((g) => <GameCard key={g.a} g={g} />)}</div>
        </Card>
      ))}
    </div>
  )
}
