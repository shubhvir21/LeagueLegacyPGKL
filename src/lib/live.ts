// Live matchup projections: Sleeper's official points so far + the live-odds Worker's expected remaining points.
// The Worker (see liveproj) turns sportsbook player props into time-aware projections; this file only reads it.
import { posSd, type OddsModel } from './model'
import { CURRENT_LEAGUE_ID, type SleeperMatchup, type SleeperRoster } from './sleeper'

const SLEEPER = 'https://api.sleeper.app/v1'
export const LIVE_API_URL = (import.meta.env.VITE_LIVE_API_URL as string | undefined) ?? 'https://liveproj.trentcharlton21.workers.dev'

export type GameStatus = 'scheduled' | 'live' | 'final'
export interface LiveRow {
  eventId: string
  playerId: string
  sleeperId: string | null
  name: string
  team: string
  actual: number
  remaining: number
  projected: number
  pregame: number | null
  sources: Record<string, string>
}
export interface LiveGame {
  game: { eventId: string; away: string; home: string; startsAt: string; status: GameStatus; period: number; awayScore: number; homeScore: number }
  players: LiveRow[]
}
export interface LiveFeed { generatedAt: string; games: Record<string, LiveGame> }

export interface LiveEntry { row: LiveRow; game: LiveGame['game'] }
export type LineSource = 'live' | 'pregame' | 'sleeper' | 'none'
export interface StarterLine {
  playerId: string
  actual: number // Sleeper's official points so far
  projected: number
  source: LineSource
  game: LiveGame['game'] | null
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return res.json() as Promise<T>
}

export const fetchLiveFeed = () => getJson<LiveFeed>(`${LIVE_API_URL}/api/live`)
export const fetchWeek = async () => (await getJson<{ week: number }>(`${SLEEPER}/state/nfl`)).week
export const fetchMatchups = (week: number) => getJson<SleeperMatchup[]>(`${SLEEPER}/league/${CURRENT_LEAGUE_ID}/matchups/${week}`)

export const fetchRosters = () => getJson<SleeperRoster[]>(`${SLEEPER}/league/${CURRENT_LEAGUE_ID}/rosters`)

/** Sleeper player id -> live row (a player appears in one game per week). */
export function indexBySleeperId(feed: LiveFeed | null): Map<string, LiveEntry> {
  const out = new Map<string, LiveEntry>()
  for (const g of Object.values(feed?.games ?? {})) {
    for (const row of g.players) if (row.sleeperId) out.set(row.sleeperId, { row, game: g.game })
  }
  return out
}

/** Share of a game still to be played, from its status and quarter (the feed has no reliable game clock yet). */
function gameRemainingShare(game: LiveGame['game']): number {
  if (game.status === 'final') return 0
  if (game.status === 'scheduled') return 1
  return Math.min(1, Math.max(0, (4 - game.period + 0.5) / 4))
}

export interface LineContext {
  live: Map<string, LiveEntry>
  sleeperProjections: Record<string, number> | undefined
  /** Game for any player, including those the odds feed has no props for (kickers, defenses). */
  gameOf: (playerId: string) => LiveGame['game'] | null
}

/**
 * Official points so far + expected remaining. Players the odds feed does not cover (K, DEF, no props)
 * use Sleeper's static projection scaled by how much of their game is left, never below what they've scored.
 */
export function buildStarterLine(playerId: string, official: number, ctx: LineContext): StarterLine {
  const entry = ctx.live.get(playerId)
  if (entry) {
    const fromProps = Object.values(entry.row.sources).includes('live_prop') || entry.game.status === 'final'
    return { playerId, actual: official, projected: official + entry.row.remaining, source: fromProps ? 'live' : 'pregame', game: entry.game }
  }
  const sleeper = ctx.sleeperProjections?.[playerId]
  const game = ctx.gameOf(playerId)
  if (sleeper === undefined) return { playerId, actual: official, projected: official, source: 'none', game }
  const projected = game && game.status !== 'scheduled' ? official + sleeper * gameRemainingShare(game) : Math.max(sleeper, official)
  return { playerId, actual: official, projected, source: 'sleeper', game }
}

export const EMPTY_SLOT = '0'

export function buildTeamLines(m: SleeperMatchup, ctx: LineContext): StarterLine[] {
  return m.starters.flatMap((id, i) => (id === EMPTY_SLOT ? [] : [buildStarterLine(id, m.starters_points[i] ?? 0, ctx)]))
}

/** Bench = rostered players who aren't starting, minus IR and taxi (they can't be started this week). */
export function buildBenchLines(m: SleeperMatchup, roster: SleeperRoster | undefined, ctx: LineContext): StarterLine[] {
  const unavailable = new Set([...(roster?.reserve ?? []), ...(roster?.taxi ?? [])])
  const starting = new Set(m.starters)
  return (m.players ?? [])
    .filter((id) => !starting.has(id) && !unavailable.has(id))
    .map((id) => buildStarterLine(id, m.players_points?.[id] ?? 0, ctx))
}

// Sportsbook and Sleeper disagree on a few team codes (e.g. LA vs LAR).
const TEAM_ALIASES: Record<string, string> = { LA: 'LAR', WSH: 'WAS', JAC: 'JAX', ARZ: 'ARI', LVR: 'LV', OAK: 'LV', SD: 'LAC', STL: 'LAR' }
export const normalizeTeam = (abbr: string) => TEAM_ALIASES[abbr.toUpperCase()] ?? abbr.toUpperCase()

/** Normalized NFL team -> its game this week, for players the odds feed has no props for (kickers, defenses). */
export function indexGamesByTeam(feed: LiveFeed | null): Map<string, LiveGame['game']> {
  const out = new Map<string, LiveGame['game']>()
  for (const { game } of Object.values(feed?.games ?? {})) {
    out.set(normalizeTeam(game.away), game)
    out.set(normalizeTeam(game.home), game)
  }
  return out
}

export const sum = (lines: StarterLine[], key: 'actual' | 'projected') => lines.reduce((t, l) => t + l[key], 0)

export function pairMatchups(ms: SleeperMatchup[]): [SleeperMatchup, SleeperMatchup | null][] {
  const byId = new Map<number, SleeperMatchup[]>()
  for (const m of ms) if (m.matchup_id != null) byId.set(m.matchup_id, [...(byId.get(m.matchup_id) ?? []), m])
  return [...byId.values()].map(([a, b]) => [a as SleeperMatchup, b ?? null])
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}

/** Share of a starter's outcome still unknown: 0 once the game is final, 1 before kickoff. */
export function unknownShare(l: StarterLine): number {
  if (!l.game) return l.source === 'none' ? 0 : 1
  if (l.game.status === 'final') return 0
  if (l.game.status === 'scheduled') return 1
  return Math.min(1, Math.max(0, (l.projected - l.actual) / Math.max(l.projected, 1)))
}

/** Chance side A outscores side B: normal approximation on projected totals; variance shrinks as games finish. */
export function winProbability(a: { lines: StarterLine[]; pos: (id: string) => string }, b: { lines: StarterLine[]; pos: (id: string) => string }, model: OddsModel): number {
  const stats = (s: typeof a) => {
    let v = 0, f = 0
    for (const l of s.lines) {
      const share = unknownShare(l)
      v += posSd(model, s.pos(l.playerId), l.projected) ** 2 * share
      f += share
    }
    return { mean: sum(s.lines, 'projected'), v: v * (1 + model.rho) + model.resid ** 2 * (f / Math.max(s.lines.length, 1)) }
  }
  const x = stats(a), y = stats(b)
  const sd = Math.sqrt(x.v + y.v)
  if (sd < 1e-6) return x.mean === y.mean ? 0.5 : x.mean > y.mean ? 1 : 0
  return normCdf((x.mean - y.mean) / sd)
}
