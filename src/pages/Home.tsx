import { Link } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { fmt, headToHead, record, type ScheduledGame } from '../lib/stats'
import { Avatar, Card, MemberLink, RankBadge } from '../components/ui'
import { GameCard } from './Season'
import { badgesOf } from './Achievements'

export default function Home() {
  const lg = useLeague()
  const current = lg.seasons[0]
  const lastDone = lg.seasons.find((s) => s.complete)
  const lastWeek = Math.max(0, ...lg.games.filter((g) => g.season === current.year).map((g) => g.week))
  const lastGames = lg.games.filter((g) => g.season === current.year && g.week === lastWeek)
  const nextWeek = Math.min(...lg.schedule.filter((g) => g.season === current.year).map((g) => g.week))
  const upcoming = lg.schedule.filter((g) => g.season === current.year && g.week === nextWeek)
  const badges = badgesOf(lg).filter((e) => e.week != null).slice(0, 10)
  const podium = lastDone ? [2, 1, 3].map((r) => lastDone.teamSeasons.find((t) => t.finalRank === r)!) : []

  return (
    <div className="page">
      <div className="hero">
        <div>
          <h1>{current.name}</h1>
          <p className="muted">{lg.seasons.length} seasons · {current.teams} teams · {current.year} {current.complete ? 'complete' : `through week ${current.weeksPlayed}`}</p>
        </div>
        {lastDone && (
          <div className="hero-podium">
            {podium.map((t, i) => t && (
              <Link key={t.memberId} to={`/member/${t.memberId}`} className={`hero-step p${[2, 1, 3][i]}`}>
                <Avatar id={t.memberId} size={i === 1 ? 56 : 44} />
                <b>{lg.memberById[t.memberId]?.name}</b>
                <span className="small muted">{['🥈 Runner-up', `🏆 ${lastDone.year} Champ`, '🥉 Third'][i]}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="two-col">
        <Card title={`${current.year} Standings`} right={<Link to={`/season/${current.year}`}>Full season →</Link>}>
          <table><tbody>{current.teamSeasons.map((t) => (
            <tr key={t.memberId}>
              <td><RankBadge rank={t.finalRank ?? t.regRank} n={current.teams} /></td>
              <td><Link to={`/season/${current.year}/team/${t.memberId}`} className="member-link"><Avatar id={t.memberId} /><span>{t.teamName}</span></Link></td>
              <td>{record(t.wins, t.losses, t.ties)}</td>
              <td className="right">{fmt(t.pf)}</td>
            </tr>
          ))}</tbody></table>
        </Card>
        <Card title="League Activity" sub="Latest badges earned." right={<Link to="/achievements">All →</Link>}>
          <table><tbody>{badges.map((e, i) => (
            <tr key={i}>
              <td><MemberLink id={e.memberId} /></td>
              <td><span className={`badge ${e.badge.kind}`} title={e.badge.desc}>{e.badge.icon} {e.badge.name}</span></td>
              <td className="muted small">{e.season} W{e.week}</td>
            </tr>
          ))}</tbody></table>
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
