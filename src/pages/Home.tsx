import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { fmt, headToHead, record, type Game, type ScheduledGame } from '../lib/stats'
import { Avatar, Card, MemberLink, RankBadge, TeamName } from '../components/ui'
import { powerRankings } from '../lib/weekly'
import { gameOdds } from '../lib/upsets'
import { useOdds } from './Odds'
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
      <div className="hero compact">
        <div>
          <div className="eyebrow">Est. {lg.seasons.at(-1)?.year} · Sleeper</div>
          <h1>{current.name}</h1>
          <p className="muted">{lg.seasons.length} seasons · {current.teams} teams · {current.year} {current.complete ? 'complete' : `through week ${current.weeksPlayed}`}</p>
        </div>
        {champs.length > 0 && (
          <ol className="champ-strip" aria-label="Champions">
            {champs.map((s, i) => (
              <li key={s.year}>
                <Link to={`/season/${s.year}`} className={`champ-chip ${i === 0 ? 'latest' : ''}`} title={i === 0 ? 'Reigning champion' : `${s.year} champion`}>
                  {i === 0 ? <Icon name="trophy" size={13} /> : null}
                  <span className="champ-year">{s.year}</span>
                  <Avatar id={s.champion!} size={20} />
                  <span className="champ-name">{lg.memberById[s.champion!]?.name}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>

      {!current.complete && <Snapshots year={current.year} />}

      <div className="two-col">
        <Card title={`${current.year} Standings`} right={<Link to={`/season/${current.year}`}>Full season →</Link>}>
          <div className="table-wrap"><table className="fit-table"><tbody>{current.teamSeasons.map((t) => (
            <tr key={t.memberId}>
              <td><RankBadge rank={t.finalRank ?? t.regRank} n={current.teams} final={current.complete} /></td>
              <td className="grow"><Link to={`/season/${current.year}/team/${t.memberId}`} className="member-link"><Avatar id={t.memberId} /><TeamName id={t.memberId} season={current.year} /></Link></td>
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
        <Card title={`Week ${lastWeek} Results`} right={<Link to={`/recap/${current.year}`}>Season recap →</Link>}>
          <WeekRecap games={lastGames} />
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
        <Avatar id={id} size={22} /> <TeamName id={id} season={g.season} />
        <span className="muted small rec">{t ? record(t.wins, t.losses, t.ties) : ''}</span>
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

function Snap({ to, icon, label, children, detail, tone }: { to: string; icon: string; label: string; children: ReactNode; detail?: ReactNode; tone?: 'pos' | 'neg' }) {
  return (
    <Link to={to} className={`stat snap ${tone ?? ''}`}>
      <div className="stat-label"><Icon name={icon} size={14} /><span>{label}</span></div>
      <div className="snap-value">{children}</div>
      {detail && <div className="snap-detail muted">{detail}</div>}
    </Link>
  )
}

/** This-season snapshot: power No. 1, playoff bubble, hottest team, last week's biggest upset. */
function Snapshots({ year }: { year: number }) {
  const lg = useLeague()
  const power = useMemo(() => powerRankings(lg, year), [lg, year])
  const latest = power.at(-1)
  const { full } = useOdds(lg, year, null, false, false)
  const lastWeek = latest?.week
  const upset = useMemo(() => gameOdds(lg).filter((o) => o.g.season === year && o.g.week === lastWeek && o.winner).sort((a, b) => a.pWinner - b.pWinner)[0], [lg, year, lastWeek])
  if (!latest) return null
  const top = latest.rows[0]
  const move = top.prev == null ? null : top.prev - top.rank
  const hot = [...latest.rows].sort((a, b) => b.recent - a.recent)[0]
  const bubble = full ? [...full.teams].sort((a, b) => Math.abs(a.playoff - 0.5) - Math.abs(b.playoff - 0.5))[0] : null
  const pct = (p: number) => `${Math.round(p * 100)}%`
  return (
    <div className="snap-grid">
      <Snap to="/power" icon="crown" label={`Power No. 1 · week ${latest.week}`}
        detail={<>{fmt(top.score, 1)} power{move ? <> · <span className={move > 0 ? 'pos' : 'neg'}>{move > 0 ? '▲' : '▼'}{Math.abs(move)}</span></> : ' · held the spot'}</>}>
        <TeamName id={top.memberId} season={year} />
      </Snap>
      <Snap to="/odds" icon="target" label="Playoff bubble" detail={bubble ? <>{pct(bubble.playoff)} to make the playoffs</> : 'Simulating…'}>
        {bubble ? <TeamName id={bubble.memberId} season={year} /> : <span className="muted">—</span>}
      </Snap>
      <Snap to="/power" icon="flame" label="Hottest team" detail={`${fmt(hot.recent, 1)} per game over the last 3`}>
        <TeamName id={hot.memberId} season={year} />
      </Snap>
      {upset && upset.pWinner < 0.5 ? (
        <Snap to="/records" icon="zap" label={`Week ${lastWeek} upset`} tone="pos"
          detail={<>won at {pct(upset.pWinner)} vs {lg.memberById[upset.loser!]?.name}</>}>
          <TeamName id={upset.winner!} season={year} />
        </Snap>
      ) : (
        <Snap to="/records" icon="zap" label={`Week ${lastWeek} upset`} detail="every favorite won">
          <span className="muted">No upsets</span>
        </Snap>
      )}
    </div>
  )
}

/** One line on last week: top and low score (recap video duty), closest game, biggest blowout. */
function WeekRecap({ games }: { games: Game[] }) {
  const lg = useLeague()
  const sides = games.flatMap((g) => [{ id: g.a, pts: g.aPts, opp: g.b, oppPts: g.bPts }, { id: g.b, pts: g.bPts, opp: g.a, oppPts: g.aPts }]).filter((x) => x.pts > 0)
  if (!sides.length) return null
  const nm = (id: string) => lg.memberById[id]?.name ?? id
  const top = [...sides].sort((a, b) => b.pts - a.pts)[0]
  const low = [...sides].sort((a, b) => a.pts - b.pts)[0]
  const wins = sides.filter((x) => x.pts > x.oppPts)
  const close = [...wins].sort((a, b) => (a.pts - a.oppPts) - (b.pts - b.oppPts))[0]
  const blow = [...wins].sort((a, b) => (b.pts - b.oppPts) - (a.pts - a.oppPts))[0]
  return (
    <div className="week-recap">
      <span><Icon name="rocket" size={13} /> Top score <b>{nm(top.id)}</b> {fmt(top.pts, 1)}</span>
      <span><Icon name="minus" size={13} /> Low score <b>{nm(low.id)}</b> {fmt(low.pts, 1)} <span className="muted">· owes the recap video</span></span>
      {close && <span><Icon name="scale" size={13} /> Closest <b>{nm(close.id)}</b> over {nm(close.opp)} by {fmt(close.pts - close.oppPts, 1)}</span>}
      {blow && blow !== close && <span><Icon name="zap" size={13} /> Blowout <b>{nm(blow.id)}</b> over {nm(blow.opp)} by {fmt(blow.pts - blow.oppPts, 1)}</span>}
    </div>
  )
}
