// Live matchup projections: Sleeper's official points so far + the live-odds Worker's expected remaining points.
// The Worker (see liveproj) turns sportsbook player props into time-aware projections; this file only reads it.
import { CURRENT_LEAGUE_ID, type SleeperMatchup } from './sleeper'

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

/** Sleeper player id -> live row (a player appears in one game per week). */
export function indexBySleeperId(feed: LiveFeed | null): Map<string, LiveEntry> {
  const out = new Map<string, LiveEntry>()
  for (const g of Object.values(feed?.games ?? {})) {
    for (const row of g.players) if (row.sleeperId) out.set(row.sleeperId, { row, game: g.game })
  }
  return out
}

/**
 * Official points so far + expected remaining. Players the odds feed does not cover (K, DEF, no props)
 * fall back to Sleeper's static projection, never below what they've already scored.
 */
export function buildStarterLine(playerId: string, official: number, live: Map<string, LiveEntry>, sleeperProjection: number | undefined): StarterLine {
  const entry = live.get(playerId)
  if (entry) {
    const fromProps = Object.values(entry.row.sources).includes('live_prop') || entry.game.status === 'final'
    return { playerId, actual: official, projected: official + entry.row.remaining, source: fromProps ? 'live' : 'pregame', game: entry.game }
  }
  if (sleeperProjection !== undefined) return { playerId, actual: official, projected: Math.max(sleeperProjection, official), source: 'sleeper', game: null }
  return { playerId, actual: official, projected: official, source: 'none', game: null }
}

export const EMPTY_SLOT = '0'

export function buildTeamLines(m: SleeperMatchup, live: Map<string, LiveEntry>, sleeperProjections: Record<string, number> | undefined): StarterLine[] {
  return m.starters.flatMap((id, i) => (id === EMPTY_SLOT ? [] : [buildStarterLine(id, m.starters_points[i] ?? 0, live, sleeperProjections?.[id])]))
}

export const sum = (lines: StarterLine[], key: 'actual' | 'projected') => lines.reduce((t, l) => t + l[key], 0)

export function pairMatchups(ms: SleeperMatchup[]): [SleeperMatchup, SleeperMatchup | null][] {
  const byId = new Map<number, SleeperMatchup[]>()
  for (const m of ms) if (m.matchup_id != null) byId.set(m.matchup_id, [...(byId.get(m.matchup_id) ?? []), m])
  return [...byId.values()].map(([a, b]) => [a as SleeperMatchup, b ?? null])
}
