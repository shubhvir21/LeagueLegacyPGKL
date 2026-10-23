import { useCallback, useEffect, useMemo, useState } from 'react'
import { Avatar, Card, TeamName } from '../components/ui'
import { useLeague } from '../lib/data'
import { buildTeamLines, fetchLiveFeed, fetchMatchups, fetchWeek, indexBySleeperId, pairMatchups, sum, type LineSource, type LiveFeed, type StarterLine } from '../lib/live'
import { playersOf } from '../lib/players'
import { fmt } from '../lib/stats'
import type { SleeperMatchup } from '../lib/sleeper'

const REFRESH_MS = 60_000
const STALE_MINUTES = 15
const SOURCE_LABEL: Record<LineSource, string> = { live: 'Live odds', pregame: 'Pregame odds', sleeper: 'Sleeper', none: '—' }

function minutesAgo(iso: string) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000)
}

export default function Live() {
  const lg = useLeague()
  const season = lg.seasons[0]
  const info = playersOf(lg).info
  const raw = lg.raw.seasons.at(-1)
  const [week, setWeek] = useState<number | null>(null)
  const [matchups, setMatchups] = useState<SleeperMatchup[]>([])
  const [feed, setFeed] = useState<LiveFeed | null>(null)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updated, setUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const w = await fetchWeek()
      setWeek(w)
      setMatchups(await fetchMatchups(w))
      setError(null)
    } catch (e) {
      setError(`Could not load matchups from Sleeper: ${(e as Error).message}`)
    }
    try {
      setFeed(await fetchLiveFeed())
      setFeedError(null)
    } catch (e) {
      setFeedError((e as Error).message)
    }
    setUpdated(new Date())
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => { if (!document.hidden) load() }, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const live = useMemo(() => indexBySleeperId(feed), [feed])
  const sleeperProjections = week ? raw?.projections?.weeks[String(week)] : undefined
  const memberOf = (rosterId: number) => season?.teamSeasons.find((t) => t.rosterId === rosterId)?.memberId
  const stale = feed && minutesAgo(feed.generatedAt) > STALE_MINUTES

  return (
    <div className="page">
      <h1>Live Matchups{week ? ` · Week ${week}` : ''}</h1>
      <p className="muted">
        Points so far from Sleeper plus expected remaining points from sportsbook player props, adjusted for time left and game pace.
        {updated && ` Updated ${updated.toLocaleTimeString()}.`}
      </p>
      {error && <p className="error">{error}</p>}
      {feedError && <p className="error">Live odds projections unavailable ({feedError}); showing Sleeper's static projections.</p>}
      {stale && <p className="error">Odds feed last updated {minutesAgo(feed.generatedAt)} minutes ago.</p>}
      <div className="live-grid">
        {pairMatchups(matchups).map(([a, b]) => {
          const sides = [a, b].filter((m): m is SleeperMatchup => !!m).map((m) => ({ m, lines: buildTeamLines(m, live, sleeperProjections) }))
          return (
            <Card key={a.matchup_id} title={sides.map((s) => memberOf(s.m.roster_id) ? lg.memberById[memberOf(s.m.roster_id)!]?.name : `Team ${s.m.roster_id}`).join(' vs ')}>
              <div className="live-sides">
                {sides.map(({ m, lines }) => (
                  <TeamColumn key={m.roster_id} memberId={memberOf(m.roster_id)} year={season?.year} lines={lines} nameOf={(id) => info[id]} />
                ))}
              </div>
              {sides.length === 2 && <Margin a={sum(sides[0]!.lines, 'projected')} b={sum(sides[1]!.lines, 'projected')} />}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function Margin({ a, b }: { a: number; b: number }) {
  return <p className="muted live-margin">Projected margin: {fmt(Math.abs(a - b))} {a === b ? '' : a > b ? '(left side ahead)' : '(right side ahead)'}</p>
}

function TeamColumn({ memberId, year, lines, nameOf }: { memberId?: string; year?: number; lines: StarterLine[]; nameOf: (id: string) => { name: string; pos: string; team: string } | undefined }) {
  return (
    <div className="live-col">
      <div className="live-head">
        {memberId && <Avatar id={memberId} size={22} />}
        {memberId ? <TeamName id={memberId} season={year} /> : <span>Team</span>}
        <b>{fmt(sum(lines, 'actual'))}</b>
        <span className="muted">proj {fmt(sum(lines, 'projected'))}</span>
      </div>
      <table className="live-table">
        <thead>
          <tr><th>Starter</th><th className="num">Now</th><th className="num">Proj</th><th>Source</th></tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const p = nameOf(l.playerId)
            return (
              <tr key={l.playerId} title={l.game ? `${l.game.away} @ ${l.game.home} · ${l.game.status}` : undefined}>
                <td><span className={`pos-tag ${p?.pos ?? ''}`}>{p?.pos ?? '?'}</span> {p?.name ?? l.playerId}</td>
                <td className="num">{fmt(l.actual)}</td>
                <td className="num">{fmt(l.projected)}</td>
                <td className="muted">{SOURCE_LABEL[l.source]}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
