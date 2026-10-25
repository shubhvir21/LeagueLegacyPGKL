import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLeague } from '../lib/data'
import {
  buildBenchLines, buildTeamLines, fetchLiveFeed, fetchMatchups, fetchRosters, fetchSleeperProjections, fetchWeek, indexBySleeperId, indexGamesByTeam, normalizeTeam, pairMatchups, sum, winProbability,
  type LiveFeed, type LiveGame, type StarterLine,
} from '../lib/live'
import { DEFAULT_MODEL } from '../lib/model'
import { lineupSlots } from '../lib/lineup'
import { playersOf, type PlayerInfo } from '../lib/players'
import { applyFinals, fetchEspnSnapshot, type EspnSnapshot, type GameSituation } from '../lib/situation'
import type { SleeperMatchup, SleeperRoster } from '../lib/sleeper'
import { fmt, type Game } from '../lib/stats'
import { Avatar, TeamName } from './ui'

const REFRESH_MS = 60_000
const SITUATION_REFRESH_MS = 15_000
const EMPTY_ESPN: EspnSnapshot = { situations: new Map(), finishedTeams: new Set() }
const STALE_MINUTES = 15
const SLOT_LABEL: Record<string, string> = { SUPER_FLEX: 'SF', FLEX: 'FLX', REC_FLEX: 'FLX', WRRB_FLEX: 'FLX' }

interface Record3 { w: number; l: number; t: number }
function headToHead(games: Game[], a?: string, b?: string): Record3 | null {
  if (!a || !b) return null
  const r = { w: 0, l: 0, t: 0 }
  for (const g of games) {
    const aSide = g.a === a && g.b === b, bSide = g.a === b && g.b === a
    if ((!aSide && !bSide) || (g.aPts === 0 && g.bPts === 0)) continue
    const mine = aSide ? g.aPts : g.bPts, theirs = aSide ? g.bPts : g.aPts
    if (mine > theirs) r.w++
    else if (mine < theirs) r.l++
    else r.t++
  }
  return r
}

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

interface Side { m: SleeperMatchup; memberId?: string; lines: StarterLine[]; bench: StarterLine[] }

const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

export function LiveMatchups() {
  const lg = useLeague()
  const season = lg.seasons[0]
  const info = playersOf(lg).info
  const raw = lg.raw.seasons.at(-1)
  const model = lg.raw.model ?? DEFAULT_MODEL
  const slots = lineupSlots(raw?.league.roster_positions ?? [])
  const [week, setWeek] = useState<number | null>(null)
  const [matchups, setMatchups] = useState<SleeperMatchup[]>([])
  const [rosters, setRosters] = useState<SleeperRoster[]>([])
  const [freshProjections, setFreshProjections] = useState<Record<string, number>>({})
  const [rawFeed, setFeed] = useState<LiveFeed | null>(null)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState(0)
  const [espn, setEspn] = useState<EspnSnapshot>(EMPTY_ESPN)

  const load = useCallback(async () => {
    try {
      const w = await fetchWeek()
      setWeek(w)
      setMatchups(await fetchMatchups(w))
      setRosters(await fetchRosters())
      setFreshProjections(await fetchSleeperProjections(w))
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

  useEffect(() => {
    const poll = () => { if (!document.hidden) fetchEspnSnapshot().then(setEspn).catch(() => setEspn(EMPTY_ESPN)) } // display-only extra: on failure the cell just shows the score line
    poll()
    const id = setInterval(poll, SITUATION_REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  const { situations, finishedTeams } = espn
  const feed = useMemo(() => applyFinals(rawFeed, finishedTeams), [rawFeed, finishedTeams])
  const live = useMemo(() => indexBySleeperId(feed), [feed])
  // Fresh Sleeper numbers win; the nightly snapshot only fills gaps if the live fetch returned nothing for a player.
  const snapshot = week ? raw?.projections?.weeks[String(week)] : undefined
  const projections = useMemo(() => ({ ...snapshot, ...freshProjections }), [snapshot, freshProjections])
  const teamGames = useMemo(() => indexGamesByTeam(feed), [feed])
  const posOf = (id: string) => info[id]?.pos ?? 'WR'

  const games = useMemo(() => pairMatchups(matchups).flatMap(([a, b]) => {
    if (!b) return []
    const ctx = { live, sleeperProjections: projections, gameOf: (id: string) => live.get(id)?.game ?? teamGames.get(normalizeTeam(info[id]?.team ?? '')) ?? null }
    const rank = (id: string) => POS_ORDER.indexOf(info[id]?.pos ?? '')
    const side = (m: SleeperMatchup): Side => ({
      m, lines: buildTeamLines(m, ctx),
      bench: buildBenchLines(m, rosters.find((r) => r.roster_id === m.roster_id), ctx)
        .sort((u, v) => rank(u.playerId) - rank(v.playerId) || v.projected - u.projected),
      memberId: season?.teamSeasons.find((t) => t.rosterId === m.roster_id)?.memberId,
    })
    const [x, y] = [side(a), side(b)]
    return [{ id: a.matchup_id, x, y, p: winProbability({ lines: x.lines, pos: posOf }, { lines: y.lines, pos: posOf }, model) }]
  }), [matchups, rosters, live, projections, teamGames, season, model]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <Scoreboard x={game.x} y={game.y} p={game.p} year={season?.year} h2h={headToHead(lg.games, game.x.memberId, game.y.memberId)} />
      <LiveTicker lines={[...game.x.lines, ...game.y.lines]} situations={situations} />
      <div className="lm-rows">
        {Array.from({ length: Math.max(game.x.lines.length, game.y.lines.length) }, (_, i) => (
          <div className="lm-row" key={i}>
            <PlayerCell line={game.x.lines[i]} info={info} situations={situations} />
            <span className="lm-slot">{SLOT_LABEL[slots[i]] ?? slots[i] ?? ''}</span>
            <PlayerCell line={game.y.lines[i]} info={info} situations={situations} right />
          </div>
        ))}
      </div>
      <div className="lm-bench-title">Bench</div>
      <div className="lm-rows lm-bench">
        {Array.from({ length: Math.max(game.x.bench.length, game.y.bench.length) }, (_, i) => (
          <div className="lm-row" key={i}>
            <PlayerCell line={game.x.bench[i]} info={info} situations={situations} />
            <span className="lm-slot">BN</span>
            <PlayerCell line={game.y.bench[i]} info={info} situations={situations} right />
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

function Scoreboard({ x, y, p, year, h2h }: { x: Side; y: Side; p: number; year?: number; h2h: Record3 | null }) {
  const tied = h2h && h2h.t ? `–${h2h.t}` : ''
  return (
    <div className="lm-board">
      <TeamTop s={x} year={year} />
      <div className="lm-mid">
        {h2h && (
          <div className="lm-h2h" title="All-time head-to-head, playoffs included">
            <small>ALL-TIME</small>
            <b><span className={h2h.w > h2h.l ? 'lead' : ''}>{h2h.w}</span>–<span className={h2h.l > h2h.w ? 'lead' : ''}>{h2h.l}</span>{tied}</b>
          </div>
        )}
        <div className="lm-odds">
          <span className={p >= 0.5 ? 'fav' : ''}>{pct(p)}</span>
          <span className={p < 0.5 ? 'fav' : ''}>{pct(1 - p)}</span>
        </div>
      </div>
      <TeamTop s={y} year={year} right />
      <TeamNums s={x} />
      <TeamNums s={y} right />
      <div className="lm-bar"><i style={{ width: pct(p) }} /></div>
    </div>
  )
}

// Name row and number row are separate grid cells so both teams' scores line up however long the names run.
function TeamTop({ s, year, right }: { s: Side; year?: number; right?: boolean }) {
  return (
    <div className={`lm-top${right ? ' right' : ''}`}>
      {s.memberId && <Avatar id={s.memberId} size={40} />}
      <div className="lm-name">{s.memberId && <TeamName id={s.memberId} season={year} />}</div>
    </div>
  )
}

function TeamNums({ s, right }: { s: Side; right?: boolean }) {
  return (
    <div className={`lm-nums${right ? ' right' : ''}`}>
      <div className="lm-score">{fmt(sum(s.lines, 'actual'))}</div>
      <div className="lm-proj">{fmt(sum(s.lines, 'projected'))}</div>
    </div>
  )
}

/** One Sleeper-style strip per live NFL game that has a starter in this matchup. */
function LiveTicker({ lines, situations }: { lines: StarterLine[]; situations: Map<string, GameSituation> }) {
  const games = new Map<string, LiveGame['game']>()
  for (const l of lines) if (l.game?.status === 'live') games.set(l.game.eventId, l.game)
  if (games.size === 0) return null
  return (
    <div className="lm-ticker">
      {[...games.values()].map((g) => {
        const sit = situations.get(normalizeTeam(g.home))
        const ball = sit?.possessionTeam
        const side = (team: string, score: number) => <span className={ball === normalizeTeam(team) ? 'ball' : ''}>{ball === normalizeTeam(team) ? '🏈 ' : ''}{team} <b>{score}</b></span>
        return (
          <div key={g.eventId} className={`lm-tick${sit?.isRedZone ? ' redzone' : ''}`}>
            <span className="lm-tick-teams">{side(g.away, g.awayScore)}<em>@</em>{side(g.home, g.homeScore)}</span>
            <small><i className="lm-dot" aria-label="Game in progress" />{sit?.isHalftime ? 'Halftime' : `${sit?.clock ?? ''} Q${g.period}`}{sit?.downDistance && ` · ${sit.downDistance}`}</small>
          </div>
        )
      })}
    </div>
  )
}

function SituationLine({ situation, hasBall }: { situation: GameSituation; hasBall: boolean }) {
  const detail = situation.isHalftime ? 'Halftime' : `${situation.clock} Q${situation.period}${hasBall && situation.downDistance ? ` · 🏈 ${situation.downDistance}` : ''}`
  return (
    <small className={`lm-live${situation.isRedZone && hasBall ? ' redzone' : ''}`}>
      <i className="lm-dot" aria-label="Game in progress" />{detail}
    </small>
  )
}

function PlayerCell({ line, info, situations, right }: { line?: StarterLine; info: Record<string, PlayerInfo>; situations: Map<string, GameSituation>; right?: boolean }) {
  if (!line) return <div className="lm-cell empty" />
  const p = info[line.playerId]
  const situation = line.game?.status === 'live' && p?.team ? situations.get(normalizeTeam(p.team)) : undefined
  const hasBall = !!situation && situation.possessionTeam === normalizeTeam(p?.team ?? '')
  // Flag Sleeper-sourced projections only where it matters: not defenses, not finished games, and not byes (Sleeper projects those at 0).
  const isEstimate = (line.source === 'sleeper' || line.source === 'none') && p?.pos !== 'DEF' && line.game?.status !== 'final' && line.projected > line.actual
  return (
    <div className={`lm-cell pos-${p?.pos ?? 'X'}${right ? ' right' : ''}${situation ? ' playing' : ''}${hasBall ? ' has-ball' : ''}`}>
      <span className="lm-shot-wrap">
        <img className="lm-shot" src={headshot(line.playerId, p)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
        {situation && <i className="lm-dot lm-badge" aria-label="Game in progress" />}
        {hasBall && <span className="lm-ball" aria-label="Team has the ball">🏈</span>}
      </span>
      <div className="lm-who">
        <b>{p?.name ?? line.playerId}</b>
        <small className="muted"><span className={`pos-tag ${p?.pos ?? ''}`}>{p?.pos}</span> {p?.team}{gameLabel(line) && ` · ${gameLabel(line)}`}</small>
        {situation && <SituationLine situation={situation} hasBall={hasBall} />}
      </div>
      <div className="lm-pts">
        <b>{fmt(line.actual)}</b>
        <small className="muted">
          {fmt(line.projected)}
        </small>
        {isEstimate && <span className="lm-ast" title="Projection from Sleeper (no sportsbook props)" aria-label="Projection from Sleeper">*</span>}
      </div>
    </div>
  )
}
