import type { ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { playersOf } from '../lib/players'
import { managementCached } from '../lib/management'
import { powerRankings, scheduleLuck } from '../lib/weekly'
import { fmt, record } from '../lib/stats'
import { Avatar, Card, MemberLink } from '../components/ui'
import { Icon } from '../components/Icon'
import { PlayerLink } from '../components/PlayerLink'
import { SeasonPicker } from './Season'
import { signed } from './History'

interface Award { icon: string; title: string; who: ReactNode; detail: ReactNode; tone?: 'pos' | 'neg' }

export function RecapIndex() {
  const lg = useLeague()
  return <Navigate to={`/recap/${lg.seasons[0].year}`} replace />
}

export default function Recap() {
  const lg = useLeague()
  const year = Number(useParams().year)
  const s = lg.seasons.find((x) => x.year === year)
  if (!s) return <p>No season {year}.</p>
  const pm = playersOf(lg)
  const name = (id?: string | null) => (id ? lg.memberById[id]?.name ?? id : '—')
  const M = (id?: string | null) => <MemberLink id={id ?? null} />
  const P = (id: string) => <PlayerLink id={id} />
  const games = lg.games.filter((g) => g.season === year)
  const sides = games.flatMap((g) => [
    { id: g.a, opp: g.b, pts: g.aPts, oppPts: g.bPts, g },
    { id: g.b, opp: g.a, pts: g.bPts, oppPts: g.aPts, g },
  ]).filter((x) => x.pts > 0)
  const max = <T,>(xs: T[], f: (x: T) => number) => xs.reduce<T | undefined>((b, x) => (b === undefined || f(x) > f(b) ? x : b), undefined)
  const min = <T,>(xs: T[], f: (x: T) => number) => max(xs, (x) => -f(x))
  const wk = (g: { week: number; playoff: boolean }) => (g.playoff ? `playoffs W${g.week}` : `week ${g.week}`)

  // MVP: most starting-lineup points for one franchise.
  const startPts: Record<string, { pid: string; id: string; pts: number }> = {}
  for (const w of pm.weeks) if (w.season === year && w.started) {
    const k = `${w.playerId}|${w.memberId}`
    ;(startPts[k] ??= { pid: w.playerId, id: w.memberId, pts: 0 }).pts += w.pts
  }
  const mvp = max(Object.values(startPts), (x) => x.pts)
  const moves = pm.moves.filter((m) => m.season === year)
  const tradeSides = pm.trades.filter((t) => t.season === year).flatMap((t) => t.sides.filter((x) => x.gets.length || x.picksIn.length).map((x) => ({ t, x })))
  const picks = pm.picks.filter((p) => p.season === year && !p.pending)
  const mgmt = managementCached(lg).filter((m) => m.season === year)
  const luck = scheduleLuck(lg, year)
  const power = powerRankings(lg, year)
  const ts = s.teamSeasons

  const bestPickup = max(moves, (m) => m.value)
  const bestTrade = max(tradeSides, (x) => x.x.value), worstTrade = min(tradeSides, (x) => x.x.value)
  const steal = max(picks.filter((p) => !p.keeper), (p) => p.surplus)
  const bust = min(picks.filter((p) => !p.keeper && p.round <= 3), (p) => p.surplus)
  const keeper = max(picks.filter((p) => p.keeper), (p) => p.surplus)
  const high = max(sides, (x) => x.pts), low = min(sides, (x) => x.pts)
  const blowout = max(sides, (x) => x.pts - x.oppPts)
  const close = min(sides.filter((x) => x.pts > x.oppPts), (x) => x.pts - x.oppPts)
  const heartbreak = max(sides.filter((x) => x.pts < x.oppPts), (x) => x.pts)
  const lucky = min(sides.filter((x) => x.pts > x.oppPts), (x) => x.pts)
  const coach = max(mgmt, (m) => m.coachScore), bench = max(mgmt, (m) => m.benchPts), ll = max(mgmt, (m) => m.lineupLosses)
  const regChamp = ts.find((t) => t.regRank === 1)
  const pointsKing = max(ts, (t) => t.pf)
  const weekly = max(ts, (t) => t.highScores)
  const powerTop = power.length ? power[power.length - 1].rows[0] : null
  const mostWeeksNo1 = power.length ? max(Object.entries(power.reduce<Record<string, number>>((a, w) => { a[w.rows[0].memberId] = (a[w.rows[0].memberId] ?? 0) + 1; return a }, {})), ([, n]) => n) : undefined

  const awards: { group: string; items: (Award | null)[] }[] = [
    {
      group: 'The Hardware',
      items: [
        s.champion ? { icon: 'trophy', title: 'Champion', who: M(s.champion), detail: s.runnerUp ? <>beat {name(s.runnerUp)} in the final</> : '' } : null,
        regChamp ? { icon: 'crown', title: 'Regular-Season Champ', who: M(regChamp.memberId), detail: `${record(regChamp.wins, regChamp.losses, regChamp.ties)} · 1 seed` } : null,
        pointsKing ? { icon: 'flame', title: 'Points King', who: M(pointsKing.memberId), detail: `${fmt(pointsKing.pf, 1)} regular-season points` } : null,
        s.toiletBowlLoser ? { icon: 'bomb', title: 'Toilet Bowl Loser', who: M(s.toiletBowlLoser), detail: 'last place, recap video duty', tone: 'neg' } : null,
      ],
    },
    {
      group: 'Players & Moves',
      items: [
        mvp ? { icon: 'star', title: 'MVP', who: P(mvp.pid), detail: <>{fmt(mvp.pts, 1)} starting pts for {name(mvp.id)}</> } : null,
        bestPickup ? { icon: 'plus', title: 'Pickup of the Year', who: P(bestPickup.playerId), detail: <>{signed(bestPickup.value)} lineup pts for {name(bestPickup.memberId)} (week {bestPickup.week})</> } : null,
        bestTrade ? { icon: 'swap', title: 'Trade of the Year', who: M(bestTrade.x.memberId), detail: <>{signed(bestTrade.x.value)} lineup pts, week {bestTrade.t.week}{bestTrade.x.gets.length ? <> — got {bestTrade.x.gets.map((p) => pm.info[p]?.name).join(', ')}</> : null}</> } : null,
        worstTrade && worstTrade.x.value < 0 ? { icon: 'bomb', title: 'Fleeced', who: M(worstTrade.x.memberId), detail: <>{signed(worstTrade.x.value)} lineup pts, week {worstTrade.t.week}</>, tone: 'neg' } : null,
        steal ? { icon: 'target', title: 'Draft Steal', who: P(steal.playerId), detail: <>R{steal.round} by {name(steal.memberId)} · {signed(steal.surplus)} over the round</> } : null,
        bust && bust.surplus < 0 ? { icon: 'minus', title: 'Draft Bust', who: P(bust.playerId), detail: <>R{bust.round} by {name(bust.memberId)} · {signed(bust.surplus)}</>, tone: 'neg' } : null,
        keeper ? { icon: 'lock', title: 'Keeper of the Year', who: P(keeper.playerId), detail: <>R{keeper.round} by {name(keeper.memberId)} · {signed(keeper.surplus)}</> } : null,
      ],
    },
    {
      group: 'Games',
      items: [
        high ? { icon: 'rocket', title: 'Highest Score', who: M(high.id), detail: `${fmt(high.pts, 2)} in ${wk(high.g)}` } : null,
        low ? { icon: 'minus', title: 'Lowest Score', who: M(low.id), detail: `${fmt(low.pts, 2)} in ${wk(low.g)}`, tone: 'neg' } : null,
        blowout ? { icon: 'zap', title: 'Biggest Blowout', who: M(blowout.id), detail: <>by {fmt(blowout.pts - blowout.oppPts, 1)} over {name(blowout.opp)}, {wk(blowout.g)}</> } : null,
        close ? { icon: 'scale', title: 'Closest Game', who: M(close.id), detail: <>by {fmt(close.pts - close.oppPts, 2)} over {name(close.opp)}, {wk(close.g)}</> } : null,
        heartbreak ? { icon: 'bomb', title: 'Heartbreaker', who: M(heartbreak.id), detail: <>lost with {fmt(heartbreak.pts, 1)} to {name(heartbreak.opp)}, {wk(heartbreak.g)}</>, tone: 'neg' } : null,
        lucky ? { icon: 'star', title: 'Ugliest Win', who: M(lucky.id), detail: <>won with {fmt(lucky.pts, 1)} vs {name(lucky.opp)}, {wk(lucky.g)}</> } : null,
        weekly ? { icon: 'medal', title: 'Weekly Top Scorer', who: M(weekly.memberId), detail: `top score in ${weekly.highScores} weeks` } : null,
      ],
    },
    {
      group: 'Management & Luck',
      items: [
        coach ? { icon: 'crown', title: 'Coach of the Year', who: M(coach.memberId), detail: `${fmt(coach.efficiency, 1)}% lineup efficiency` } : null,
        bench ? { icon: 'list', title: 'Bench Warmer', who: M(bench.memberId), detail: `${fmt(bench.benchPts, 0)} points left on the bench`, tone: 'neg' } : null,
        ll && ll.lineupLosses ? { icon: 'target', title: 'Self-Inflicted', who: M(ll.memberId), detail: `${ll.lineupLosses} losses the best lineup would have won`, tone: 'neg' } : null,
        luck ? { icon: 'star', title: 'Luckiest', who: M(luck.rows[0].memberId), detail: `${signed(luck.rows[0].luck)} wins vs all-play` } : null,
        luck ? { icon: 'bomb', title: 'Unluckiest', who: M(luck.rows[luck.rows.length - 1].memberId), detail: `${signed(luck.rows[luck.rows.length - 1].luck)} wins vs all-play`, tone: 'neg' } : null,
        mostWeeksNo1 ? { icon: 'chart', title: 'Power Ranking Fixture', who: M(mostWeeksNo1[0]), detail: `No. 1 for ${mostWeeksNo1[1]} weeks${powerTop ? ` · finished No. 1: ${name(powerTop.memberId)}` : ''}` } : null,
      ],
    },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{year} Season Recap</h1>
          <p className="muted">{s.complete ? 'The year in awards.' : `In progress — awards so far through week ${s.weeksPlayed}.`} <Link to={`/season/${year}`}>Full standings →</Link></p>
        </div>
        <SeasonPicker year={year} path={(y) => `/recap/${y}`} />
      </div>

      {s.champion && (
        <div className="podium">
          {[s.runnerUp, s.champion, s.third].map((id, i) => id && (
            <div key={id} className={`podium-step p${i}`}>
              <Avatar id={id} size={i === 1 ? 64 : 48} />
              <div className="podium-name">{name(id)}</div>
              <div className="muted">{['Runner-up', 'Champion', 'Third'][i]}</div>
            </div>
          ))}
        </div>
      )}

      {awards.map((grp) => (
        <Card key={grp.group} title={grp.group}>
          <div className="award-grid">
            {grp.items.filter((a): a is Award => !!a).map((a) => (
              <div key={a.title} className={`award ${a.tone ?? ''}`}>
                <div className="award-head"><Icon name={a.icon} size={15} /><span>{a.title}</span></div>
                <div className="award-who">{a.who}</div>
                <div className="award-detail muted">{a.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
