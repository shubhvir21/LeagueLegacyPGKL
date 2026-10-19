// Raw Sleeper API fetching. Shared by the browser Resync button and scripts/sync.ts.

export const CURRENT_LEAGUE_ID = '1362926045359013888'
const API = 'https://api.sleeper.app/v1'

export interface SleeperLeague {
  league_id: string
  previous_league_id: string | null
  season: string
  status: string
  name: string
  total_rosters: number
  roster_positions: string[]
  settings: Record<string, number | null | undefined>
}
export interface SleeperUser {
  user_id: string
  display_name: string
  avatar: string | null
  metadata?: { team_name?: string }
}
export interface SleeperRoster {
  roster_id: number
  owner_id: string | null
  settings: Record<string, number | undefined>
}
export interface SleeperMatchup {
  roster_id: number
  matchup_id: number | null
  points: number
  starters: string[]
  starters_points: number[]
  players_points?: Record<string, number>
}
export interface BracketMatch {
  m: number
  r: number
  t1: number | null
  t2: number | null
  w: number | null
  l: number | null
  p?: number
}
export interface RawSeason {
  league: SleeperLeague
  users: SleeperUser[]
  rosters: SleeperRoster[]
  matchups: SleeperMatchup[][] // index = week - 1
  winnersBracket: BracketMatch[]
  losersBracket: BracketMatch[]
}
export interface RawData {
  syncedAt: string
  nflState: { season: string; week: number; season_type: string }
  seasons: RawSeason[] // oldest first
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(API + path)
  if (!res.ok) throw new Error(`Sleeper ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

async function fetchSeason(leagueId: string): Promise<RawSeason> {
  const league = await get<SleeperLeague>(`/league/${leagueId}`)
  const lastWeek = Number(league.settings.last_scored_leg ?? league.settings.leg ?? 17) || 17
  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1)
  const [users, rosters, winnersBracket, losersBracket, matchups] = await Promise.all([
    get<SleeperUser[]>(`/league/${leagueId}/users`),
    get<SleeperRoster[]>(`/league/${leagueId}/rosters`),
    get<BracketMatch[] | null>(`/league/${leagueId}/winners_bracket`).catch(() => null),
    get<BracketMatch[] | null>(`/league/${leagueId}/losers_bracket`).catch(() => null),
    Promise.all(weeks.map((w) => get<SleeperMatchup[]>(`/league/${leagueId}/matchups/${w}`))),
  ])
  // Trim player-level detail we don't use yet to keep the snapshot small.
  const slim = matchups.map((wk) =>
    (wk ?? []).map(({ roster_id, matchup_id, points, starters, starters_points }) => ({
      roster_id, matchup_id, points, starters, starters_points,
    })),
  )
  // Managers who later left the league aren't in /users; look them up directly.
  const known = new Set(users.map((u) => u.user_id))
  const missing = rosters.map((r) => r.owner_id).filter((id): id is string => !!id && !known.has(id))
  const departed = await Promise.all(missing.map((id) => get<SleeperUser>(`/user/${id}`).catch(() => null)))
  for (const u of departed) if (u) users.push({ user_id: u.user_id, display_name: u.display_name, avatar: u.avatar })
  return {
    league, users, rosters, matchups: slim,
    winnersBracket: winnersBracket ?? [], losersBracket: losersBracket ?? [],
  }
}

/** Walks previous_league_id back from the current league and fetches every season. */
export async function fetchAll(currentId = CURRENT_LEAGUE_ID): Promise<RawData> {
  const seasons: RawSeason[] = []
  let id: string | null = currentId
  while (id && id !== '0') {
    const s = await fetchSeason(id)
    seasons.unshift(s)
    id = s.league.previous_league_id
  }
  const nflState = await get<RawData['nflState']>('/state/nfl')
  return { syncedAt: new Date().toISOString(), nflState, seasons }
}
