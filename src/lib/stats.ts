// Turns raw Sleeper data into the league model every page reads from.
import type { RawData, RawSeason, BracketMatch } from './sleeper'
import overrides from '../members.json'

export interface Member {
  id: string // Sleeper user_id — stable across seasons
  name: string
  avatar: string | null
}

export interface Game {
  season: number
  week: number
  playoff: boolean
  bracket: 'winners' | 'losers' | null
  place?: number // bracket match deciding this place (1 = championship)
  a: string // member id
  b: string
  aPts: number
  bPts: number
}

export interface TeamSeason {
  season: number
  memberId: string
  rosterId: number
  teamName: string
  // Regular season
  h2hW: number; h2hL: number; h2hT: number
  medW: number; medL: number
  wins: number; losses: number; ties: number // h2h + median, matches Sleeper standings
  pf: number; pa: number
  games: number
  apW: number; apL: number; apT: number // all-play
  expectedWins: number
  luck: number
  sos: number // avg opponent points per game
  pointsShare: number // % of league regular-season points
  maxPf: number | null
  coachScore: number | null // pf / max possible pf * 100
  highScores: number // weeks as league top scorer
  regRank: number
  finalRank: number | null // null until the season is finished
  madePlayoffs: boolean
  seasonScore: number // 0-100 composite
  eloEnd: number
}

export interface Season {
  year: number
  leagueId: string
  name: string
  status: string
  complete: boolean
  teams: number
  playoffTeams: number
  playoffStart: number
  weeksPlayed: number
  teamSeasons: TeamSeason[] // sorted by final rank, else reg rank
  champion: string | null
  runnerUp: string | null
  third: string | null
  toiletBowlLoser: string | null // lost the losers-bracket final (lower score advances)
}

export interface ScheduledGame {
  season: number
  week: number
  a: string
  b: string
  playoff: boolean
}

export interface League {
  raw: RawData
  /** season -> roster_id -> member id (franchise merges applied) */
  rosterOwner: Record<number, Record<number, string>>
  schedule: ScheduledGame[] // upcoming / in-progress pairings of the current season
  nflWeek: number
  syncedAt: string
  members: Member[]
  memberById: Record<string, Member>
  seasons: Season[] // newest first
  games: Game[]
  elo: Record<string, number> // current
  eloHistory: { label: string; season: number; week: number; ratings: Record<string, number> }[]
}

const ELO_START = 50 // league rating before a member has a completed season
const round2 = (n: number) => Math.round(n * 100) / 100
const nameOverrides = (overrides as { names?: Record<string, string> }).names ?? {}
// Franchise takeovers: the old owner's seasons count toward the new owner.
const merges = (overrides as { merge?: Record<string, string> }).merge ?? {}
const franchise = (id: string) => merges[id] ?? id

function placementsFromBracket(br: BracketMatch[]): Record<number, number> {
  // Matches with p=N decide places N and N+1 (p=1 championship, p=3 third place, …).
  const place: Record<number, number> = {}
  for (const m of br) {
    if (m.p && m.w != null && m.l != null) {
      place[m.w] = m.p
      place[m.l] = m.p + 1
    }
  }
  return place
}

function buildSeason(raw: RawSeason, games: Game[], schedule: ScheduledGame[]) {
  const { league } = raw
  const year = Number(league.season)
  const n = league.total_rosters
  const playoffStart = Number(league.settings.playoff_week_start ?? 15)
  const playoffTeams = Number(league.settings.playoff_teams ?? 6)
  const median = Number(league.settings.league_average_match ?? 0) === 1
  const owner: Record<number, string> = {}
  for (const r of raw.rosters) owner[r.roster_id] = franchise(r.owner_id ?? `roster-${year}-${r.roster_id}`)
  const userById = Object.fromEntries(raw.users.map((u) => [u.user_id, u]))

  const ts: Record<number, TeamSeason> = {}
  for (const r of raw.rosters) {
    const u = r.owner_id ? userById[r.owner_id] : undefined
    const max = r.settings.ppts != null ? r.settings.ppts + (r.settings.ppts_decimal ?? 0) / 100 : null
    ts[r.roster_id] = {
      season: year, memberId: owner[r.roster_id], rosterId: r.roster_id,
      teamName: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
      h2hW: 0, h2hL: 0, h2hT: 0, medW: 0, medL: 0, wins: 0, losses: 0, ties: 0,
      pf: 0, pa: 0, games: 0, apW: 0, apL: 0, apT: 0, expectedWins: 0, luck: 0, sos: 0,
      pointsShare: 0, maxPf: max, coachScore: null, highScores: 0, regRank: 0, finalRank: null,
      madePlayoffs: false, seasonScore: 0, eloEnd: ELO_START,
    }
  }

  let weeksPlayed = 0
  let leaguePts = 0
  raw.matchups.forEach((wk, i) => {
    const week = i + 1
    if (week > raw.lastScored) {
      // Not final yet: keep the pairings as the schedule.
      const byId: Record<number, number[]> = {}
      for (const m of wk) if (m.matchup_id != null) (byId[m.matchup_id] ??= []).push(m.roster_id)
      for (const [x, y] of Object.values(byId).filter((p) => p.length === 2)) {
        schedule.push({ season: year, week, a: owner[x], b: owner[y], playoff: week >= playoffStart })
      }
      return
    }
    const scored = wk.filter((m) => m.points > 0)
    if (scored.length === 0) return
    if (week < playoffStart) {
      weeksPlayed = week
      const pts = wk.map((m) => m.points)
      const sorted = [...pts].sort((a, b) => b - a)
      const medianLine = (sorted[Math.floor(n / 2) - 1] + sorted[Math.floor(n / 2)]) / 2
      const top = sorted[0]
      for (const m of wk) {
        const t = ts[m.roster_id]
        if (!t) continue
        t.pf += m.points
        t.games++
        leaguePts += m.points
        if (m.points === top) t.highScores++
        for (const o of wk) {
          if (o.roster_id === m.roster_id) continue
          if (m.points > o.points) t.apW++
          else if (m.points < o.points) t.apL++
          else t.apT++
        }
        const beaten = wk.filter((o) => o.roster_id !== m.roster_id && m.points > o.points).length
        t.expectedWins += beaten / (wk.length - 1)
        if (median) {
          if (m.points > medianLine) t.medW++
          else t.medL++
        }
      }
    }
    // Pair teams into games
    const byMatch: Record<number, typeof wk> = {}
    for (const m of wk) if (m.matchup_id != null) (byMatch[m.matchup_id] ??= []).push(m)
    const isPlayoff = week >= playoffStart
    const bracketRound = week - playoffStart + 1
    for (const pair of Object.values(byMatch)) {
      if (pair.length !== 2) continue
      const [x, y] = pair
      let bracket: Game['bracket'] = null
      let place: number | undefined
      if (isPlayoff) {
        const find = (br: BracketMatch[]) =>
          br.find((b) => b.r === bracketRound && ((b.t1 === x.roster_id && b.t2 === y.roster_id) || (b.t1 === y.roster_id && b.t2 === x.roster_id)))
        const wm = find(raw.winnersBracket), lm = find(raw.losersBracket)
        if (wm) { bracket = 'winners'; place = wm.p }
        else if (lm) bracket = 'losers'
        else continue // not a real playoff game
      }
      games.push({
        season: year, week, playoff: isPlayoff, bracket,
        a: owner[x.roster_id], b: owner[y.roster_id], aPts: x.points, bPts: y.points, place,
      })
      if (!isPlayoff) {
        const tx = ts[x.roster_id], ty = ts[y.roster_id]
        tx.pa += y.points; ty.pa += x.points
        if (x.points > y.points) { tx.h2hW++; ty.h2hL++ }
        else if (x.points < y.points) { ty.h2hW++; tx.h2hL++ }
        else { tx.h2hT++; ty.h2hT++ }
      }
    }
  })

  const complete = league.status === 'complete'
  const place = complete ? placementsFromBracket(raw.winnersBracket) : {}
  const playoffIds = new Set(raw.winnersBracket.flatMap((b) => [b.t1, b.t2]).filter((x): x is number => x != null))

  const list = Object.values(ts)
  for (const t of list) {
    t.wins = t.h2hW + t.medW
    t.losses = t.h2hL + t.medL
    t.ties = t.h2hT
    t.pointsShare = leaguePts ? (t.pf / leaguePts) * 100 : 0
    t.sos = t.games ? t.pa / t.games : 0
    t.luck = t.h2hW - t.expectedWins
    t.coachScore = t.maxPf ? (t.pf / t.maxPf) * 100 : null
    t.madePlayoffs = playoffIds.has(t.rosterId)
  }
  list.sort((a, b) => b.wins - a.wins || b.pf - a.pf)
  list.forEach((t, i) => (t.regRank = i + 1))
  if (complete) {
    // Bracket decides the top spots; everyone else falls back to regular-season order.
    let next = Math.max(0, ...Object.values(place)) + 1
    for (const t of list) t.finalRank = place[t.rosterId] ?? next++
    list.sort((a, b) => (a.finalRank ?? 99) - (b.finalRank ?? 99))
  }
  for (const t of list) {
    const g = t.wins + t.losses + t.ties || 1
    const ap = t.apW + t.apL + t.apT || 1
    const rank = t.finalRank ?? t.regRank
    t.seasonScore = round2(
      100 * (0.3 * (t.wins / g) + 0.3 * (t.apW / ap) + 0.2 * Math.min(1, (t.pointsShare * n) / 200) + 0.2 * ((n - rank) / (n - 1))),
    )
  }
  const byRank = (r: number) => list.find((t) => t.finalRank === r)?.memberId ?? null
  const season: Season = {
    year, leagueId: league.league_id, name: league.name, status: league.status, complete,
    teams: n, playoffTeams, playoffStart, weeksPlayed, teamSeasons: list,
    champion: byRank(1), runnerUp: byRank(2), third: byRank(3),
    // Toilet bowl: the lower score advances, so the final's "winner" is the real loser.
    toiletBowlLoser: (() => {
      const f = raw.losersBracket.find((b) => b.p === 1)
      return complete && f?.w != null ? owner[f.w] : null
    })(),
  }
  return season
}

export function buildLeague(raw: RawData): League {
  const games: Game[] = []
  const schedule: ScheduledGame[] = []
  const seasons = raw.seasons.map((s) => buildSeason(s, games, schedule))

  // Members: newest season's user info wins for display.
  const members: Record<string, Member> = {}
  for (const s of raw.seasons) {
    for (const u of s.users) {
      if (merges[u.user_id]) continue
      members[u.user_id] = { id: u.user_id, name: nameOverrides[u.user_id] ?? u.display_name, avatar: u.avatar }
    }
  }

  // Orphaned rosters (manager left, Sleeper dropped the owner) get a placeholder member.
  for (const s of seasons) {
    for (const t of s.teamSeasons) {
      if (!members[t.memberId]) {
        members[t.memberId] = { id: t.memberId, name: nameOverrides[t.memberId] ?? `Former Manager (${s.year} #${t.rosterId})`, avatar: null }
      }
    }
  }

  // League Rating (power rating, 0–100). Per completed season:
  //   season power = 40% all-play win % + 35% PPG vs league average + 25% final finish
  // The rating is a recency-weighted average of a member's completed seasons
  // (most recent 5, then 3, 2, 1, 1, …), recomputed after each season for the trend line.
  const power: Record<number, Record<string, number>> = {}
  for (const s of seasons.filter((x) => x.complete)) {
    const ts = s.teamSeasons
    const leaguePpg = ts.reduce((a, t) => a + t.pf / (t.games || 1), 0) / ts.length
    power[s.year] = {}
    for (const t of ts) {
      const ap = (t.apW + t.apT / 2) / (t.apW + t.apL + t.apT || 1)
      const ppg = Math.max(0, Math.min(100, 50 + 250 * ((t.pf / (t.games || 1)) / leaguePpg - 1)))
      const finish = (s.teams - (t.finalRank ?? t.regRank)) / (s.teams - 1)
      power[s.year][t.memberId] = 0.4 * ap * 100 + 0.35 * ppg + 0.25 * finish * 100
    }
  }
  const RECENCY = [5, 3, 2]
  const ratingAsOf = (id: string, year: number) => {
    const played = Object.keys(power).map(Number).filter((y) => y <= year && power[y][id] != null).sort((a, b) => b - a)
    if (!played.length) return null
    let num = 0, den = 0
    played.forEach((y, i) => { const w = RECENCY[i] ?? 1; num += w * power[y][id]; den += w })
    return Math.round((num / den) * 10) / 10
  }
  const elo: Record<string, number> = {}
  const eloHistory: League['eloHistory'] = []
  games.sort((x, y) => x.season - y.season || x.week - y.week)
  for (const s of seasons) {
    for (const t of s.teamSeasons) {
      const r = ratingAsOf(t.memberId, s.year)
      if (r != null) elo[t.memberId] = r
      t.eloEnd = elo[t.memberId] ?? 50
    }
    eloHistory.push({ label: String(s.year), season: s.year, week: 0, ratings: { ...elo } })
  }

  const rosterOwner: League['rosterOwner'] = {}
  for (const s of seasons) rosterOwner[s.year] = Object.fromEntries(s.teamSeasons.map((t) => [t.rosterId, t.memberId]))
  return {
    raw,
    rosterOwner,
    syncedAt: raw.syncedAt,
    members: Object.values(members),
    memberById: members,
    seasons: [...seasons].reverse(),
    games,
    schedule,
    nflWeek: raw.nflState.week,
    elo,
    eloHistory,
  }
}

// ---------- Derived views ----------

export interface CareerRow {
  member: Member
  seasons: number[]
  wins: number; losses: number; ties: number
  apW: number; apL: number; apT: number
  pf: number; pa: number; games: number
  playoffs: number
  playoffW: number; playoffL: number
  titles: number; seconds: number; thirds: number
  avgFinish: number | null
  avgScore: number
  elo: number
}

export function careers(lg: League): CareerRow[] {
  const rows: Record<string, CareerRow> = {}
  for (const s of lg.seasons) {
    for (const t of s.teamSeasons) {
      const r = (rows[t.memberId] ??= {
        member: lg.memberById[t.memberId] ?? { id: t.memberId, name: t.teamName, avatar: null },
        seasons: [], wins: 0, losses: 0, ties: 0, apW: 0, apL: 0, apT: 0, pf: 0, pa: 0, games: 0,
        playoffs: 0, playoffW: 0, playoffL: 0, titles: 0, seconds: 0, thirds: 0, avgFinish: null, avgScore: 0,
        elo: lg.elo[t.memberId] ?? ELO_START,
      })
      r.seasons.push(s.year)
      r.wins += t.wins; r.losses += t.losses; r.ties += t.ties
      r.apW += t.apW; r.apL += t.apL; r.apT += t.apT
      r.pf += t.pf; r.pa += t.pa; r.games += t.games
      if (t.madePlayoffs) r.playoffs++
      if (t.finalRank === 1) r.titles++
      if (t.finalRank === 2) r.seconds++
      if (t.finalRank === 3) r.thirds++
      r.avgScore += t.seasonScore
    }
  }
  // Playoff record excludes the 5th-place game.
  for (const g of lg.games.filter((g) => g.bracket === 'winners' && g.place !== 5)) {
    const aw = g.aPts > g.bPts
    if (rows[g.a]) aw ? rows[g.a].playoffW++ : rows[g.a].playoffL++
    if (rows[g.b]) aw ? rows[g.b].playoffL++ : rows[g.b].playoffW++
  }
  for (const r of Object.values(rows)) {
    const finished = lg.seasons.flatMap((s) => s.teamSeasons).filter((t) => t.memberId === r.member.id && t.finalRank != null)
    r.avgFinish = finished.length ? finished.reduce((a, t) => a + (t.finalRank ?? 0), 0) / finished.length : null
    r.avgScore = r.avgScore / r.seasons.length
    r.seasons.sort()
  }
  return Object.values(rows).sort((a, b) => b.elo - a.elo)
}

export interface H2H {
  w: number; l: number; t: number
  pf: number; pa: number
  games: Game[] // oriented so that `a` is the row member
  streak: string // e.g. "W3"
}

export function headToHead(lg: League, a: string, b: string): H2H {
  const games = lg.games
    .filter((g) => (g.a === a && g.b === b) || (g.a === b && g.b === a))
    .map((g) => (g.a === a ? g : { ...g, a: g.b, b: g.a, aPts: g.bPts, bPts: g.aPts }))
  const r: H2H = { w: 0, l: 0, t: 0, pf: 0, pa: 0, games, streak: '' }
  for (const g of games) {
    r.pf += g.aPts; r.pa += g.bPts
    if (g.aPts > g.bPts) r.w++
    else if (g.aPts < g.bPts) r.l++
    else r.t++
  }
  let k = 0
  const last = games.at(-1)
  if (last) {
    const res = (g: Game) => (g.aPts > g.bPts ? 'W' : g.aPts < g.bPts ? 'L' : 'T')
    const want = res(last)
    for (let i = games.length - 1; i >= 0 && res(games[i]) === want; i--) k++
    r.streak = `${want}${k}`
  }
  return r
}

export const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
export const pct = (w: number, l: number, t = 0) => {
  const g = w + l + t
  return g ? ((w + t / 2) / g).toFixed(3).replace(/^0/, '') : '.000'
}
export const record = (w: number, l: number, t = 0) => (t ? `${w}-${l}-${t}` : `${w}-${l}`)
export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
