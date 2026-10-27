import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { fmt, headToHead, record, type Game, type ScheduledGame } from '../lib/stats'
import { Avatar, Card, MemberLink, RankBadge, TeamName } from '../components/ui'
import { powerRankings } from '../lib/weekly'
import { gameOdds } from '../lib/upsets'
import { GameCard } from './Season'
import { playersOf } from '../lib/players'
import { PlayerLink } from '../components/PlayerLink'
import { Icon } from '../components/Icon'
import { Newsletter } from '../components/Newsletter'

export default function Home() {
  const lg = useLeague()
  const current = lg.seasons[0]
  const lastWeek = Math.max(0, ...lg.games.filter((g) => g.season === current.year).map((g) => g.week))
  const lastGames = lg.games.filter((g) => g.season === current.year && g.week === lastWeek)
  const scheduleWeeks = lg.schedule.filter((g) => g.season === current.year).map((g) => g.week)
  const nextWeek = scheduleWeeks.length ? Math.min(...scheduleWeeks) : null
  const upcoming = nextWeek == null ? [] : lg.schedule.filter((g) => g.season === current.year && g.week === nextWeek)
  const champs = lg.seasons.filter((s) => s.complete && s.champion) // newest first
  const reigning = champs[0]
  const pastChamps = champs.slice(1)
  const pm = playersOf(lg)
  const activity = [
    ...pm.moves.map((m) => ({ created: m.created, kind: m.type === 'free_agent' ? 'Free agent' : 'Waiver', m })),
    ...pm.drops.filter((d) => d.standalone).map((d) => ({ created: d.created, kind: 'Drop', d })),
    ...pm.trades.filter((t) => t.sides.some((x) => x.gets.length || x.picksIn.length)).map((t) => ({ created: t.created, kind: 'Trade', t })),
  ].sort((a, b) => b.created - a.created).slice(0, 10)
  const when = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  return (
    <div className="page home-gameday">
      <section className="home-hero">
        <div className="home-hero-main">
          <div className="eyebrow">Est. {lg.seasons.at(-1)?.year} · {current.year} season</div>
          <h1>{current.name}</h1>
          <p className="muted">
            {lg.seasons.length} seasons · {current.teams} teams ·{' '}
            {current.complete ? 'Final' : `through week ${current.weeksPlayed}`}
          </p>
        </div>
        {reigning && (
          <Link to={`/season/${reigning.year}`} className="home-champ" title="Reigning champion">
            <div className="home-champ-badge"><Icon name="trophy" size={16} /></div>
            <Avatar id={reigning.champion!} size={56} />
            <div className="home-champ-meta">
              <span className="home-champ-label">Reigning champion</span>
              <b>{lg.memberById[reigning.champion!]?.name}</b>
              <span className="muted small">{reigning.year} title</span>
            </div>
          </Link>
        )}
      </section>

      {pastChamps.length > 0 && (
        <ol className="home-champ-history" aria-label="Past champions">
          {pastChamps.map((s) => (
            <li key={s.year}>
              <Link to={`/season/${s.year}`} className="home-champ-history-chip">
                <span className="champ-year">{s.year}</span>
                <Avatar id={s.champion!} size={18} />
                <span className="champ-name">{lg.memberById[s.champion!]?.name}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      <Newsletter />

      {current.complete
        ? <SeasonStoryStrip year={current.year} />
        : lastGames.length > 0
          ? <WeeklyStoryStrip year={current.year} week={lastWeek} games={lastGames} />
          : null}

      {upcoming.length > 0 && (
        <Card
          title={<span className="slate-title"><span className="slate-week">Week {nextWeek}</span> Matchups</span>}
          sub={nextWeek === lg.nflWeek ? 'This week · in progress' : 'Up next'}
          right={<Link to={`/season/${current.year}`}>Schedule →</Link>}
        >
          <div className="game-grid">{upcoming.map((g) => <Preview key={g.a} g={g} />)}</div>
        </Card>
      )}

      {lastGames.length > 0 && (
        <Card
          title={<span className="slate-title"><span className="slate-week">Week {lastWeek}</span> Results</span>}
          right={<Link to={`/season/${current.year}`}>Season page →</Link>}
        >
          <div className="game-grid">{lastGames.map((g) => <GameCard key={g.a} g={g} />)}</div>
        </Card>
      )}

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
        <Card title="League Activity" sub="Latest transactions." right={<Link to="/frontoffice">All →</Link>}>
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

/** Upcoming weeks for the current season, shown on its season page. */
export function UpcomingSchedule({ year }: { year: number }) {
  const lg = useLeague()
  // Playoff weeks hold Sleeper's placeholder pairings until the bracket is set.
  const weeks = [...new Set(lg.schedule.filter((g) => g.season === year && !g.playoff).map((g) => g.week))].sort((a, b) => a - b)
  return (
    <>
      {weeks.length > 0 && <h2>Upcoming Schedule</h2>}
      {weeks.map((w, i) => (
        <Card key={w} title={`Week ${w}`} sub={i === 0 && w === lg.nflWeek ? 'This week · in progress' : i === 0 ? 'Up next' : 'Upcoming'}>
          <div className="game-grid">{lg.schedule.filter((g) => g.season === year && g.week === w).map((g) => <Preview key={g.a} g={g} />)}</div>
        </Card>
      ))}
    </>
  )
}

type StoryBeat = { icon: string; label: string; who: ReactNode; detail?: ReactNode; to?: string; tone?: 'pos' | 'neg' }

function StoryStrip({ title, right, beats }: { title: string; right?: ReactNode; beats: StoryBeat[] }) {
  if (!beats.length) return null
  return (
    <section className="story-strip" aria-label={title}>
      <div className="story-strip-head">
        <h2>{title}</h2>
        {right}
      </div>
      <ul className="story-beats">
        {beats.map((b, i) => {
          const inner = (
            <>
              <span className={`story-beat-icon ${b.tone ?? ''}`}><Icon name={b.icon} size={14} /></span>
              <span className="story-beat-body">
                <span className="story-beat-label">{b.label}</span>
                <span className="story-beat-who">{b.who}</span>
                {b.detail && <span className="story-beat-detail muted">{b.detail}</span>}
              </span>
            </>
          )
          return (
            <li key={i} className={`story-beat ${b.tone ?? ''}`}>
              {b.to ? <Link to={b.to} className="story-beat-link">{inner}</Link> : <div className="story-beat-link">{inner}</div>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** In-season: narrative beats from the latest completed week. */
function WeeklyStoryStrip({ year, week, games }: { year: number; week: number; games: Game[] }) {
  const lg = useLeague()
  const power = useMemo(() => powerRankings(lg, year), [lg, year])
  const latest = power.at(-1)
  const upset = useMemo(
    () => gameOdds(lg).filter((o) => o.g.season === year && o.g.week === week && o.winner).sort((a, b) => a.pWinner - b.pWinner)[0],
    [lg, year, week],
  )
  const sides = games.flatMap((g) => [
    { id: g.a, pts: g.aPts, opp: g.b, oppPts: g.bPts },
    { id: g.b, pts: g.bPts, opp: g.a, oppPts: g.aPts },
  ]).filter((x) => x.pts > 0)
  if (!sides.length) return null
  const nm = (id: string) => lg.memberById[id]?.name ?? id
  const top = [...sides].sort((a, b) => b.pts - a.pts)[0]
  const low = [...sides].sort((a, b) => a.pts - b.pts)[0]
  const wins = sides.filter((x) => x.pts > x.oppPts)
  const close = [...wins].sort((a, b) => (a.pts - a.oppPts) - (b.pts - b.oppPts))[0]
  const blow = [...wins].sort((a, b) => (b.pts - b.oppPts) - (a.pts - a.oppPts))[0]
  const hot = latest ? [...latest.rows].sort((a, b) => b.recent - a.recent)[0] : null
  const pct = (p: number) => `${Math.round(p * 100)}%`

  const beats: StoryBeat[] = [
    { icon: 'rocket', label: 'Top score', who: nm(top.id), detail: fmt(top.pts, 1), to: `/member/${top.id}` },
    { icon: 'minus', label: 'Low score', who: nm(low.id), detail: `${fmt(low.pts, 1)} · owes the recap`, to: `/member/${low.id}`, tone: 'neg' },
  ]
  if (close) beats.push({ icon: 'scale', label: 'Closest', who: nm(close.id), detail: `over ${nm(close.opp)} by ${fmt(close.pts - close.oppPts, 1)}`, to: `/member/${close.id}` })
  if (blow && blow !== close) beats.push({ icon: 'zap', label: 'Blowout', who: nm(blow.id), detail: `over ${nm(blow.opp)} by ${fmt(blow.pts - blow.oppPts, 1)}`, to: `/member/${blow.id}`, tone: 'pos' })
  if (upset && upset.pWinner < 0.5) {
    beats.push({ icon: 'zap', label: 'Upset', who: nm(upset.winner!), detail: `won at ${pct(upset.pWinner)} vs ${nm(upset.loser!)}`, to: `/member/${upset.winner!}`, tone: 'pos' })
  }
  if (hot) {
    beats.push({ icon: 'flame', label: 'Hottest', who: <TeamName id={hot.memberId} season={year} />, detail: `${fmt(hot.recent, 1)} /g last 3`, to: `/member/${hot.memberId}` })
  }

  return (
    <StoryStrip
      title={`Week ${week} story`}
      right={<Link to={`/season/${year}`}>Full recap →</Link>}
      beats={beats.slice(0, 6)}
    />
  )
}

/** Season complete: compact year-end highlight reel. */
function SeasonStoryStrip({ year }: { year: number }) {
  const lg = useLeague()
  const s = lg.seasons.find((x) => x.year === year)
  if (!s) return null
  const nm = (id?: string | null) => (id ? lg.memberById[id]?.name ?? id : '—')
  const regChamp = s.teamSeasons.find((t) => t.regRank === 1)
  const pointsKing = [...s.teamSeasons].sort((a, b) => b.pf - a.pf)[0]
  const games = lg.games.filter((g) => g.season === year)
  const sides = games.flatMap((g) => [
    { id: g.a, pts: g.aPts, opp: g.b, oppPts: g.bPts },
    { id: g.b, pts: g.bPts, opp: g.a, oppPts: g.aPts },
  ]).filter((x) => x.pts > 0)
  const high = sides.length ? [...sides].sort((a, b) => b.pts - a.pts)[0] : null

  const beats: StoryBeat[] = []
  if (s.champion) {
    beats.push({
      icon: 'trophy',
      label: 'Champion',
      who: nm(s.champion),
      detail: s.runnerUp ? `beat ${nm(s.runnerUp)} in the final` : undefined,
      to: `/member/${s.champion}`,
      tone: 'pos',
    })
  }
  if (regChamp) {
    beats.push({
      icon: 'crown',
      label: 'Regular-season champ',
      who: nm(regChamp.memberId),
      detail: `${record(regChamp.wins, regChamp.losses, regChamp.ties)} · 1 seed`,
      to: `/member/${regChamp.memberId}`,
    })
  }
  if (pointsKing) {
    beats.push({
      icon: 'flame',
      label: 'Points king',
      who: nm(pointsKing.memberId),
      detail: `${fmt(pointsKing.pf, 1)} PF`,
      to: `/member/${pointsKing.memberId}`,
    })
  }
  if (high) {
    beats.push({
      icon: 'rocket',
      label: 'Highest score',
      who: nm(high.id),
      detail: fmt(high.pts, 1),
      to: `/member/${high.id}`,
    })
  }
  if (s.toiletBowlLoser) {
    beats.push({
      icon: 'bomb',
      label: 'Toilet bowl',
      who: nm(s.toiletBowlLoser),
      detail: 'last place · recap duty',
      to: `/member/${s.toiletBowlLoser}`,
      tone: 'neg',
    })
  }
  if (s.third && s.third !== s.champion) {
    beats.push({
      icon: 'medal',
      label: 'Third place',
      who: nm(s.third),
      to: `/member/${s.third}`,
    })
  }

  return (
    <StoryStrip
      title={`${year} season recap`}
      right={<Link to={`/season/${year}`}>All awards →</Link>}
      beats={beats.slice(0, 6)}
    />
  )
}
