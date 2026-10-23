import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLeague } from '../lib/data'
import {
  buildTeamLines, fetchLiveFeed, fetchMatchups, fetchWeek, indexBySleeperId, pairMatchups, sum, winProbability,
  type LineSource, type LiveFeed, type StarterLine,
} from '../lib/live'
import { DEFAULT_MODEL } from '../lib/model'
import { lineupSlots } from '../lib/lineup'
import { playersOf, type PlayerInfo } from '../lib/players'
import type { SleeperMatchup } from '../lib/sleeper'
import { fmt } from '../lib/stats'
import { Avatar, TeamName } from './ui'
import { Icon } from './Icon'

const REFRESH_MS = 60_000
const STALE_MINUTES = 15
const SOURCE_HINT: Record<LineSource, string> = {
  live: 'Projection from live sportsbook props',
  pregame: 'Projection from pregame sportsbook props',
  sleeper: "Sleeper's static projection",
  none: 'No projection available',
}
const SLOT_LABEL: Record<string, string> = { SUPER_FLEX: 'SF', FLEX: 'FLX', REC_FLEX: 'FLX', WRRB_FLEX: 'FLX' }

const minutesAgo = (iso: string) => Math.round((Date.now() - new Date(iso).getTime()) / 60000)
const pct = (p: number) => `${Math.round(p * 100)}%`

function headshot(id: string, info?: PlayerInfo) {
  return info?.pos === 'DEF'
    ? `https://sleepercdn.com/images/team_logos/nfl/${id.toLowerCase()}.png`
    : `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg`
}

function gameLabel(l: StarterLine) {
  const g = l.game
  if (!g) return ''
  if (g.status === 'final') return 'Final'
  if (g.status === 'scheduled') return new Date(g.startsAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  return `Q${g.period} · ${g.away} ${g.awayScore}-${g.homeScore} ${g.home}`
}

interface Side { m: SleeperMatchup; memberId?: string; lines: StarterLine[] }

export function LiveMatchups() {
  const lg = useLeague()
  const season = lg.seasons[0]
  const info = playersOf(lg).info
  const raw = lg.raw.seasons.at(-1)
  const model = lg.raw.model ?? DEFAULT_MODEL
  const slots = lineupSlots(raw?.league.roster_positions ?? [])
  const [week, setWeek] = useState<number | null>(null)
  const [matchups, setMatchups] = useState<SleeperMatchup[]>([])
  const [feed, setFeed] = useState<LiveFeed | null>(null)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState(0)

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
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => { if (!document.hidden) load() }, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const live = useMemo(() => indexBySleeperId(feed), [feed])
  const projections = week ? raw?.projections?.weeks[String(week)] : undefined
  const posOf = (id: string) => info[id]?.pos ?? 'WR'

  const games = useMemo(() => pairMatchups(matchups).flatMap(([a, b]) => {
    if (!b) return []
    const side = (m: SleeperMatchup): Side => ({
      m, lines: buildTeamLines(m, live, projections),
      memberId: season?.teamSeasons.find((t) => t.rosterId === m.roster_id)?.memberId,
    })
    const [x, y] = [side(a), side(b)]
    return [{ id: a.matchup_id, x, y, p: winProbability({ lines: x.lines, pos: posOf }, { lines: y.lines, pos: posOf }, model) }]
  }), [matchups, live, projections, season, model]) // eslint-disable-line react-hooks/exhaustive-deps

  const game = games[Math.min(selected, games.length - 1)]
  const stale = feed && minutesAgo(feed.generatedAt) > STALE_MINUTES

  if (error) return <p className="error">{error}</p>
  if (!game) return null
  return (
    <div className="lm">
      <div className="lm-head"><h2>Week {week}</h2></div>
      {feedError && <p className="error">Live odds unavailable ({feedError}); showing Sleeper's static projections.</p>}
      {stale && <p className="error">Odds feed last updated {minutesAgo(feed.generatedAt)} minutes ago.</p>}
      <div className="lm-chips" role="tablist">
        {games.map((g, i) => (
          <button key={g.id} role="tab" aria-selected={i === selected} className={`lm-chip${i === selected ? ' on' : ''}`} onClick={() => setSelected(i)}>
            <ChipSide side={g.x} score={sum(g.x.lines, 'actual')} lead={g.p >= 0.5} />
            <ChipSide side={g.y} score={sum(g.y.lines, 'actual')} lead={g.p < 0.5} />
          </button>
        ))}
      </div>
      <Scoreboard x={game.x} y={game.y} p={game.p} year={season?.year} />
      <div className="lm-rows">
        {Array.from({ length: Math.max(game.x.lines.length, game.y.lines.length) }, (_, i) => (
          <div className="lm-row" key={i}>
            <PlayerCell line={game.x.lines[i]} info={info} />
            <span className="lm-slot">{SLOT_LABEL[slots[i]] ?? slots[i] ?? ''}</span>
            <PlayerCell line={game.y.lines[i]} info={info} right />
          </div>
        ))}
      </div>
    </div>
  )
}

function ChipSide({ side, score, lead }: { side: Side; score: number; lead: boolean }) {
  const lg = useLeague()
  const name = side.memberId ? lg.memberById[side.memberId]?.name : `Team ${side.m.roster_id}`
  return (
    <span className={`lm-chip-side${lead ? ' lead' : ''}`}>
      {side.memberId && <Avatar id={side.memberId} size={28} />}
      <span className="lm-chip-name">{name}</span>
      <b>{fmt(score)}</b>
    </span>
  )
}

function Scoreboard({ x, y, p, year }: { x: Side; y: Side; p: number; year?: number }) {
  return (
    <div className="lm-board">
      {[{ s: x, w: p }, { s: y, w: 1 - p }].map(({ s, w }, i) => (
        <div key={s.m.roster_id} className={`lm-team${i ? ' right' : ''}`}>
          {s.memberId && <Avatar id={s.memberId} size={44} />}
          <div className="lm-team-info">
            {s.memberId && <TeamName id={s.memberId} season={year} />}
            <div className="lm-score">{fmt(sum(s.lines, 'actual'))}</div>
            <div className="muted lm-proj">proj {fmt(sum(s.lines, 'projected'))}</div>
          </div>
          <div className={`lm-win${w >= 0.5 ? ' fav' : ''}`}>{pct(w)}</div>
        </div>
      ))}
      <div className="lm-bar" title="Win probability"><i style={{ width: pct(p) }} /></div>
    </div>
  )
}

function PlayerCell({ line, info, right }: { line?: StarterLine; info: Record<string, PlayerInfo>; right?: boolean }) {
  if (!line) return <div className="lm-cell empty" />
  const p = info[line.playerId]
  return (
    <div className={`lm-cell${right ? ' right' : ''}`}>
      <img className="lm-shot" src={headshot(line.playerId, p)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
      <div className="lm-who">
        <b>{p?.name ?? line.playerId}</b>
        <small className="muted">{p?.pos} {p?.team && `· ${p.team}`}{gameLabel(line) && ` · ${gameLabel(line)}`}</small>
      </div>
      <div className="lm-pts">
        <b>{fmt(line.actual)}</b>
        <small className="muted">
          <span className="lm-src" title={SOURCE_HINT[line.source]}><Icon name={line.source === 'live' ? 'bolt' : 'info'} size={11} /></span>
          {fmt(line.projected)}
        </small>
      </div>
    </div>
  )
}
