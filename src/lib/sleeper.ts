// Raw Sleeper API fetching. Shared by the browser Resync button and scripts/sync.ts.
import type { OddsModel } from './model'

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
  players?: string[] | null
  reserve?: string[] | null // IR
  taxi?: string[] | null
  settings: Record<string, number | undefined>
}
export interface SleeperMatchup {
  roster_id: number
  matchup_id: number | null
  points: number
  starters: string[]
  starters_points: number[]
  players?: string[] | null
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
  t1_from?: { w?: number; l?: number }
  t2_from?: { w?: number; l?: number }
}
export interface DraftPick {
  round: number
  pick_no: number
  roster_id: number
  player_id: string
  is_keeper: boolean | null
}
export interface Transaction {
  type: 'trade' | 'waiver' | 'free_agent' | 'commissioner'
  status: string
  leg: number
  created: number
  roster_ids: number[]
  adds: Record<string, number> | null
  drops: Record<string, number> | null
  draft_picks: { round: number; season: string; roster_id: number; owner_id: number; previous_owner_id: number }[]
  waiver_bid?: number
}
/** Compact player directory: id -> [full name, position, NFL team] */
export type PlayerMap = Record<string, [string, string, string]>

export interface RawSeason {
  league: SleeperLeague
  users: SleeperUser[]
  rosters: SleeperRoster[]
  matchups: SleeperMatchup[][] // index = week - 1
  winnersBracket: BracketMatch[]
  losersBracket: BracketMatch[]
  lastScored: number // weeks after this are scheduled / in progress
  draft: { type: string; rounds: number; picks: DraftPick[] } | null
  transactions: Transaction[]
  /** In-progress seasons only: Sleeper projections for remaining weeks, scored with league settings. */
  projections?: Projections
}
export interface Projections {
  weeks: Record<string, Record<string, number>> // week -> player id -> projected league points (rostered players)
  repl: Record<string, Record<string, number>> // week -> position -> waiver-wire level (3rd best unrostered)
  nfl: Record<string, string> // player id -> NFL team (for same-team correlation)
  status: Record<string, string> // player id -> current injury status (current season only)
}
export interface RawData {
  syncedAt: string
  nflState: { season: string; week: number; season_type: string }
  seasons: RawSeason[] // oldest first
  players: PlayerMap
  model?: OddsModel // fitted offline by scripts/sync.ts (variance, bias, blend weight, backtest)
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(API + path)
  if (!res.ok) throw new Error(`Sleeper ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

const PROJ = 'https://api.sleeper.app/projections/nfl'
const PROJ_POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((p) => `position[]=${p}`).join('&')
type ProjRow = { player_id: string; team?: string | null; stats: Record<string, number>; player?: { injury_status?: string | null; position?: string } | null }

// Projections come from Sleeper's unofficial endpoint; failures just leave them out.
// Weeks already played never change, so they're reused from the previous snapshot when present.
async function fetchProjections(league: SleeperLeague, matchups: SleeperMatchup[][], rosters: SleeperRoster[], lastScored: number, prev?: Projections): Promise<Projections | undefined> {
  const scoring = (league as SleeperLeague & { scoring_settings?: Record<string, number> }).scoring_settings ?? {}
  const current = new Set(rosters.flatMap((r) => r.players ?? []))
  const out: Projections = { weeks: {}, repl: {}, nfl: { ...(prev?.nfl ?? {}) }, status: {} }
  const fetchWeeks: number[] = []
  for (let w = 1; w <= 17; w++) {
    if (prev?.weeks[w] && w <= lastScored && prev.repl?.[w]) { out.weeks[w] = prev.weeks[w]; out.repl[w] = prev.repl[w] }
    else if (league.status !== 'complete' || w <= lastScored) fetchWeeks.push(w)
  }
  const rows = await Promise.all(fetchWeeks.map((w) =>
    fetch(`${PROJ}/${league.season}/${w}?season_type=regular&${PROJ_POS}`).then((r) => (r.ok ? (r.json() as Promise<ProjRow[]>) : [])).catch(() => [] as ProjRow[]),
  ))
  rows.forEach((wk, i) => {
    if (!wk.length) return
    const w = fetchWeeks[i]
    const rostered = w <= lastScored ? new Set((matchups[w - 1] ?? []).flatMap((m) => Object.keys(m.players_points ?? {}))) : current
    const week: Record<string, number> = {}
    const free: Record<string, number[]> = {}
    for (const p of wk) {
      let pts = 0
      for (const [k, v] of Object.entries(p.stats ?? {})) if (scoring[k] != null) pts += v * scoring[k]
      pts = Math.round(pts * 100) / 100
      if (rostered.has(p.player_id) || current.has(p.player_id)) {
        week[p.player_id] = pts
        if (p.team) out.nfl[p.player_id] = p.team
        if (w === lastScored + 1 && p.player?.injury_status) out.status[p.player_id] = p.player.injury_status
      } else if (p.player?.position && pts > 0) (free[p.player.position] ??= []).push(pts)
    }
    out.weeks[w] = week
    out.repl[w] = Object.fromEntries(Object.entries(free).map(([pos, xs]) => [pos, xs.sort((a, b) => b - a)[2] ?? 0]))
  })
  return Object.keys(out.weeks).length ? out : undefined
}

async function fetchSeason(leagueId: string, prev?: RawData): Promise<RawSeason> {
  const league = await get<SleeperLeague>(`/league/${leagueId}`)
  const lastScored = Number(league.settings.last_scored_leg ?? 0)
  // Fetch the whole regular season + playoffs so upcoming weeks give us the schedule.
  const lastWeek = league.status === 'complete' ? lastScored : 17
  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1)
  const [users, rosters, winnersBracket, losersBracket, matchups, drafts, transactions] = await Promise.all([
    get<SleeperUser[]>(`/league/${leagueId}/users`),
    get<SleeperRoster[]>(`/league/${leagueId}/rosters`),
    get<BracketMatch[] | null>(`/league/${leagueId}/winners_bracket`).catch(() => null),
    get<BracketMatch[] | null>(`/league/${leagueId}/losers_bracket`).catch(() => null),
    Promise.all(weeks.map((w) => get<SleeperMatchup[]>(`/league/${leagueId}/matchups/${w}`).catch(() => []))),
    get<{ draft_id: string; type: string; status: string; settings: { rounds: number } }[]>(`/league/${leagueId}/drafts`).catch(() => []),
    Promise.all(Array.from({ length: 18 }, (_, i) => get<Transaction[]>(`/league/${leagueId}/transactions/${i + 1}`).catch(() => []))),
  ])
  const slim = matchups.map((wk) =>
    (wk ?? []).map(({ roster_id, matchup_id, points, starters, starters_points, players_points }) => ({
      roster_id, matchup_id, points, starters, starters_points, players_points,
    })),
  )
  const d = drafts.find((x) => x.status === 'complete') ?? null
  const picks = d ? await get<DraftPick[]>(`/draft/${d.draft_id}/picks`).catch(() => []) : []
  const draft = d
    ? { type: d.type, rounds: d.settings.rounds, picks: picks.map(({ round, pick_no, roster_id, player_id, is_keeper }) => ({ round, pick_no, roster_id, player_id, is_keeper })) }
    : null
  const txns = transactions.flat().filter((t) => t.status === 'complete').map(
    ({ type, status, leg, created, roster_ids, adds, drops, draft_picks, settings }: Transaction & { settings?: { waiver_bid?: number } | null }) =>
      ({ type, status, leg, created, roster_ids, adds, drops, draft_picks: draft_picks ?? [], waiver_bid: settings?.waiver_bid }),
  )
  // Managers who later left the league aren't in /users; look them up directly.
  const known = new Set(users.map((u) => u.user_id))
  const missing = rosters.map((r) => r.owner_id).filter((id): id is string => !!id && !known.has(id))
  const departed = await Promise.all(missing.map((id) => get<SleeperUser>(`/user/${id}`).catch(() => null)))
  for (const u of departed) if (u) users.push({ user_id: u.user_id, display_name: u.display_name, avatar: u.avatar })
  const projections = await fetchProjections(league, slim, rosters, lastScored, prev?.seasons.find((s) => s.league.league_id === leagueId)?.projections)
  return {
    projections,
    league, users, rosters: rosters.map(({ roster_id, owner_id, players, settings }) => ({ roster_id, owner_id, players, settings })),
    matchups: slim, winnersBracket: winnersBracket ?? [], losersBracket: losersBracket ?? [],
    lastScored, draft, transactions: txns,
  }
}

/** Walks previous_league_id back from the current league and fetches every season. */
/** prev: the last snapshot, so finished weeks' projections aren't downloaded again. */
export async function fetchAll(prev?: RawData, currentId = CURRENT_LEAGUE_ID): Promise<RawData> {
  const seasons: RawSeason[] = []
  let id: string | null = currentId
  while (id && id !== '0') {
    const s = await fetchSeason(id, prev)
    seasons.unshift(s)
    id = s.league.previous_league_id
  }
  const nflState = await get<RawData['nflState']>('/state/nfl')
  return { syncedAt: new Date().toISOString(), nflState, seasons, players: await fetchPlayers(seasons), model: prev?.model }
}

/** Sleeper's full player list is large; keep only players who appear in this league. */
async function fetchPlayers(seasons: RawSeason[]): Promise<PlayerMap> {
  const ids = new Set<string>()
  for (const s of seasons) {
    for (const wk of s.matchups) for (const m of wk) for (const id of Object.keys(m.players_points ?? {})) ids.add(id)
    for (const p of s.draft?.picks ?? []) ids.add(p.player_id)
    for (const t of s.transactions) for (const id of [...Object.keys(t.adds ?? {}), ...Object.keys(t.drops ?? {})]) ids.add(id)
  }
  const all = await get<Record<string, { full_name?: string; first_name?: string; last_name?: string; position?: string; team?: string | null }>>('/players/nfl')
  const out: PlayerMap = {}
  for (const id of ids) {
    const p = all[id]
    out[id] = p
      ? [p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || id, p.position ?? '?', p.team ?? 'FA']
      : [id, /^[A-Z]{2,3}$/.test(id) ? 'DEF' : '?', id]
  }
  return out
}
