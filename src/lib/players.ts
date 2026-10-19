// Player-level model: season stats, value over replacement, draft picks (with keepers),
// and transaction values. Everything is derived from Sleeper's weekly players_points.
import type { RawSeason } from './sleeper'
import type { League } from './stats'
import keeperOverrides from '../keepers.json'

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const

export interface PlayerInfo { id: string; name: string; pos: string; team: string }

export interface PlayerWeek { playerId: string; season: number; week: number; memberId: string; pts: number; started: boolean }

export interface PlayerSeason {
  playerId: string
  season: number
  pts: number // points while on any roster in this league
  startedPts: number
  starts: number
  weeks: number
  best: number
  members: string[] // members who rostered him this season
  vor: number // value over replacement for the season
}

export interface Pick {
  season: number
  round: number
  pickNo: number
  memberId: string
  playerId: string
  keeper: boolean
  value: number // player's VOR that season, floored at 0
  expected: number // average VOR for non-keeper picks in this round (all seasons)
  surplus: number // value - expected
  pending: boolean // season still in progress — not valued yet
}

export interface Move {
  season: number
  week: number
  type: 'waiver' | 'free_agent'
  memberId: string
  playerId: string
  dropId: string | null
  bid?: number
  created: number
  value: number // started points for this team the rest of the season
}

export interface TradeSide {
  memberId: string
  gets: string[]
  gives: string[]
  picksIn: string[]
  picksOut: string[]
  value: number // started points from acquired players minus started points of departed players
}
export interface Trade { season: number; week: number; created: number; sides: TradeSide[] }

export interface PlayerModel {
  info: Record<string, PlayerInfo>
  weeks: PlayerWeek[]
  seasons: PlayerSeason[]
  picks: Pick[]
  moves: Move[]
  drops: { season: number; week: number; memberId: string; playerId: string; after: number; created: number; standalone: boolean }[]
  trades: Trade[]
  replacement: Record<number, Record<string, number>>
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Starting slots per position for one team; FLEX is split between RB/WR/TE. */
function slots(s: RawSeason) {
  const c: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
  for (const p of s.league.roster_positions) {
    if (p in c) c[p]++
    else if (p === 'FLEX') { c.RB += 0.4; c.WR += 0.5; c.TE += 0.1 }
    else if (p === 'SUPER_FLEX') { c.QB += 0.6; c.RB += 0.2; c.WR += 0.2 }
    else if (p === 'REC_FLEX') { c.WR += 0.7; c.TE += 0.3 }
    else if (p === 'WRRB_FLEX') { c.RB += 0.5; c.WR += 0.5 }
  }
  return c
}

export function buildPlayers(lg: League): PlayerModel {
  const raw = lg.raw
  const info: Record<string, PlayerInfo> = {}
  for (const [id, [name, pos, team]] of Object.entries(raw.players ?? {})) info[id] = { id, name, pos, team }
  const posOf = (id: string) => info[id]?.pos ?? '?'

  // ---- Weekly player lines ----
  const weeks: PlayerWeek[] = []
  for (const s of raw.seasons) {
    const year = Number(s.league.season)
    const owner = lg.rosterOwner[year]
    s.matchups.forEach((wk, i) => {
      const week = i + 1
      if (week > s.lastScored) return
      for (const m of wk) {
        const started = new Set(m.starters)
        for (const [pid, pts] of Object.entries(m.players_points ?? {})) {
          weeks.push({ playerId: pid, season: year, week, memberId: owner[m.roster_id], pts, started: started.has(pid) })
        }
      }
    })
  }
  // ---- Season aggregates ----
  const seasonMap: Record<string, PlayerSeason> = {}
  for (const s of raw.seasons) {
    const year = Number(s.league.season)
    const owner = lg.rosterOwner[year]
    s.matchups.forEach((wk, i) => {
      if (i + 1 > s.lastScored) return
      for (const m of wk) {
        const started = new Set(m.starters)
        for (const [pid, pts] of Object.entries(m.players_points ?? {})) {
          const ps = (seasonMap[`${pid}|${year}`] ??= { playerId: pid, season: year, pts: 0, startedPts: 0, starts: 0, weeks: 0, best: 0, members: [], vor: 0 })
          ps.pts += pts
          ps.weeks++
          ps.best = Math.max(ps.best, pts)
          if (started.has(pid)) { ps.startedPts += pts; ps.starts++ }
          const mid = owner[m.roster_id]
          if (!ps.members.includes(mid)) ps.members.push(mid)
        }
      }
    })
  }
  const seasons = Object.values(seasonMap)

  // ---- Replacement level per season & position ----
  const replacement: PlayerModel['replacement'] = {}
  for (const s of raw.seasons) {
    const year = Number(s.league.season)
    const n = s.league.total_rosters
    const sl = slots(s)
    replacement[year] = {}
    for (const pos of POSITIONS) {
      const pool = seasons.filter((p) => p.season === year && posOf(p.playerId) === pos).map((p) => p.pts).sort((a, b) => b - a)
      const idx = Math.round(sl[pos] * n)
      replacement[year][pos] = pool.length ? pool[Math.min(idx, pool.length - 1)] ?? 0 : 0
    }
  }
  for (const p of seasons) p.vor = round2(p.pts - (replacement[p.season][posOf(p.playerId)] ?? 0))
  const vorOf = (pid: string, year: number) => seasonMap[`${pid}|${year}`]?.vor ?? -(replacement[year]?.[posOf(pid)] ?? 0)

  // ---- Draft picks & keepers ----
  const forced = keeperOverrides as Record<string, string[]> // season -> player ids
  const picks: Pick[] = []
  raw.seasons.forEach((s, i) => {
    const year = Number(s.league.season)
    const prev = raw.seasons[i - 1]
    const prevRound: Record<string, number> = {}
    for (const p of prev?.draft?.picks ?? []) prevRound[p.player_id] = p.round
    const prevRoster: Record<number, Set<string>> = {}
    for (const r of prev?.rosters ?? []) prevRoster[r.roster_id] = new Set(r.players ?? [])
    for (const p of s.draft?.picks ?? []) {
      // Keepers stay at the round they were drafted. Sleeper doesn't flag them here, so a pick
      // is a keeper when the team had the player at the end of last season and either took him
      // in the same round last year or he went undrafted (waiver keeper).
      const kept = !!prev && prevRoster[p.roster_id]?.has(p.player_id) && (prevRound[p.player_id] === p.round || prevRound[p.player_id] == null)
      picks.push({
        season: year, round: p.round, pickNo: p.pick_no, memberId: lg.rosterOwner[year][p.roster_id], playerId: p.player_id,
        keeper: !!p.is_keeper || kept || (forced[String(year)] ?? []).includes(p.player_id),
        value: 0, expected: 0, surplus: 0, pending: false,
      })
    }
  })
  const done = new Set(lg.seasons.filter((s) => s.complete).map((s) => s.year))
  // Value floors at 0: a bust is "worth nothing", and the damage shows up as negative surplus
  // against what that round normally returns.
  for (const p of picks) p.value = done.has(p.season) ? round2(Math.max(0, vorOf(p.playerId, p.season))) : 0
  const roundAvg: Record<number, number> = {}
  for (const r of new Set(picks.map((p) => p.round))) {
    const pool = picks.filter((p) => p.round === r && !p.keeper && done.has(p.season))
    roundAvg[r] = pool.length ? pool.reduce((a, p) => a + p.value, 0) / pool.length : 0
  }
  for (const p of picks) {
    p.pending = !done.has(p.season)
    p.expected = round2(roundAvg[p.round])
    p.surplus = p.pending ? 0 : round2(p.value - p.expected)
  }

  // ---- Transactions ----
  // Started points a member got from a player in weeks >= from (same season).
  const startedFor = (pid: string, year: number, member: string, from: number) => {
    let total = 0
    const s = raw.seasons.find((x) => Number(x.league.season) === year)!
    const owner = lg.rosterOwner[year]
    s.matchups.forEach((wk, i) => {
      const week = i + 1
      if (week < from || week > s.lastScored) return
      for (const m of wk) {
        if (owner[m.roster_id] !== member) continue
        const idx = m.starters.indexOf(pid)
        if (idx >= 0) total += m.starters_points[idx] ?? 0
      }
    })
    return round2(total)
  }
  const ptsAfter = (pid: string, year: number, from: number) => {
    let total = 0
    const s = raw.seasons.find((x) => Number(x.league.season) === year)!
    s.matchups.forEach((wk, i) => {
      const week = i + 1
      if (week < from || week > s.lastScored) return
      for (const m of wk) total += m.players_points?.[pid] ?? 0
    })
    return round2(total)
  }
  const moves: Move[] = []
  const drops: PlayerModel['drops'] = []
  const trades: Trade[] = []
  for (const s of raw.seasons) {
    const year = Number(s.league.season)
    const owner = lg.rosterOwner[year]
    for (const t of [...s.transactions].sort((a, b) => a.created - b.created)) {
      const week = Math.max(1, t.leg)
      if (t.type === 'waiver' || t.type === 'free_agent') {
        const dropIds = Object.keys(t.drops ?? {})
        for (const [pid, rid] of Object.entries(t.adds ?? {})) {
          moves.push({ season: year, week, type: t.type, memberId: owner[rid], playerId: pid, dropId: dropIds[0] ?? null, bid: t.waiver_bid, created: t.created, value: startedFor(pid, year, owner[rid], week) })
        }
        for (const [pid, rid] of Object.entries(t.drops ?? {})) drops.push({ season: year, week, memberId: owner[rid], playerId: pid, after: ptsAfter(pid, year, week), created: t.created, standalone: !t.adds })
      } else if (t.type === 'trade') {
        const sides: TradeSide[] = t.roster_ids.map((rid) => ({ memberId: owner[rid], gets: [], gives: [], picksIn: [], picksOut: [], value: 0 }))
        const side = (rid: number) => sides[t.roster_ids.indexOf(rid)]
        for (const [pid, rid] of Object.entries(t.adds ?? {})) side(rid)?.gets.push(pid)
        for (const [pid, rid] of Object.entries(t.drops ?? {})) side(rid)?.gives.push(pid)
        for (const dp of t.draft_picks) {
          const label = `${dp.season} R${dp.round}`
          side(dp.owner_id)?.picksIn.push(label)
          side(dp.previous_owner_id)?.picksOut.push(label)
        }
        for (const sd of sides) {
          const gained = sd.gets.reduce((a, pid) => a + startedFor(pid, year, sd.memberId, week), 0)
          const lost = sd.gives.reduce((a, pid) => {
            const to = Object.entries(t.adds ?? {}).find(([p]) => p === pid)?.[1]
            return a + (to != null ? startedFor(pid, year, owner[to], week) : 0)
          }, 0)
          sd.value = round2(gained - lost)
        }
        trades.push({ season: year, week, created: t.created, sides })
      }
    }
  }

  return { info, weeks, seasons, picks, moves, drops, trades, replacement }
}

const cache = new WeakMap<League, PlayerModel>()
/** Memoized per league build. */
export function playersOf(lg: League) {
  let m = cache.get(lg)
  if (!m) { m = buildPlayers(lg); cache.set(lg, m) }
  return m
}

export const playerName = (m: PlayerModel, id: string) => m.info[id]?.name ?? id
export const playerPos = (m: PlayerModel, id: string) => m.info[id]?.pos ?? '?'
