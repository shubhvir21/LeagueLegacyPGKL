// Franchise Elo: a long-term, points-based rating that carries across seasons.
//
// Games: every regular-season game moves points from the loser to the winner. Who you beat doesn't
// matter (no upset bonus); how much you won by does: 12 → 35, scaling linearly up to a 60-point
// margin. Median games: ±10 for finishing above / below the weekly median.
//
// Finish: final placement pays out on a mirrored, zero-sum scale:
//   1st +400 / 10th −400 · 2nd +250 / 9th −250 · 3rd +150 / 8th −150 · 4th +100 / 7th −100 · 5th +50 / 6th −50
// Playoff games don't pay margin points; instead the finish is paid out as the bracket resolves.
// After each playoff week a team holds the average payout of the places it can still finish in,
// so by the last week everyone holds exactly their finish bonus.
//
// Regular-season bonuses, paid after the last regular-season week: final standings and total
// points for each pay +100 / +75 / +50 / +25 / 0 / 0 / −25 / −50 / −75 / −100 by rank.
//
// Everyone starts at 1750. Before each new season ratings regress 10% toward 1750. Ratings are
// kept within 450–5000.
import type { League, Season } from './stats'
import type { BracketMatch } from './sleeper'

export const ELO = { start: 1750, min: 450, max: 5000, regress: 0.1, median: 10, marginCap: 60, game: [12, 35] }
export const TIERS = [
  { name: 'Dynasty', min: 2201 },
  { name: 'Contender', min: 1701 },
  { name: 'Average', min: 1200 },
  { name: 'Rebuilding', min: 0 },
]
export const tierOf = (r: number) => TIERS.find((t) => r >= t.min)!.name

export interface EloPoint { season: number; week: number; rating: number }
export interface EloGame { season: number; week: number; winner: string; loser: string; margin: number; pts: number; playoff: boolean }
export interface EloFinish { season: number; memberId: string; place: number; pts: number }
export interface EloResult {
  current: Record<string, number>
  history: Record<string, EloPoint[]>
  games: EloGame[]
  finishes: EloFinish[]
  peak: Record<string, EloPoint>
  low: Record<string, EloPoint>
}

const clamp = (r: number) => Math.max(ELO.min, Math.min(ELO.max, r))
const gameValue = (margin: number) => ELO.game[0] + (ELO.game[1] - ELO.game[0]) * Math.min(1, Math.abs(margin) / ELO.marginCap)
/** Season-ending payout by finish: the top half earns, the mirror place in the bottom half loses the same. */
export const FINISH = [400, 250, 150, 100, 50]
export const finishBonus = (place: number, teams: number) => (place <= teams / 2 ? FINISH[place - 1] ?? 0 : -(FINISH[teams - place] ?? 0))

/** Standings / points-for bonus by rank: the top four earn, the mirror places in the bottom four lose the same. */
export const REG_BONUS = [100, 75, 50, 25]
export const regBonus = (rank: number, teams: number) => (rank <= teams / 2 ? REG_BONUS[rank - 1] ?? 0 : -(REG_BONUS[teams - rank] ?? 0))

/** Final placement 1..N for a finished season, from the playoff games themselves. */
export function placements(lg: League, s: Season): Record<string, number> {
  const out: Record<string, number> = {}
  const gs = lg.games.filter((g) => g.season === s.year && g.playoff)
  const wl = (g: (typeof gs)[number]) => (g.aPts >= g.bPts ? [g.a, g.b] : [g.b, g.a])
  // Winners bracket: championship → 1/2, 3rd-place game → 3/4, 5th-place game → 5/6.
  for (const [place, hi] of [[1, 1], [3, 3], [5, 5]] as const) {
    const g = gs.find((x) => x.bracket === 'winners' && x.place === place)
    if (g) { const [w, l] = wl(g); out[w] = hi; out[l] = hi + 1 }
  }
  // Toilet bowl (lower score advances): the final's loser is last, the other finalist next to
  // last; the game between the teams that escaped decides the two places above that.
  const late = gs.filter((x) => x.bracket === 'losers' && x.week > s.playoffStart)
  for (const g of late) {
    if (g.a === s.toiletBowlLoser || g.b === s.toiletBowlLoser) { out[s.toiletBowlLoser!] = s.teams; out[g.a === s.toiletBowlLoser ? g.b : g.a] = s.teams - 1 }
    else { const [w, l] = wl(g); out[w] = s.teams - 3; out[l] = s.teams - 2 }
  }
  // Anyone the bracket didn't place keeps their regular-season rank order in the open spots.
  const open = Array.from({ length: s.teams }, (_, i) => i + 1).filter((p) => !Object.values(out).includes(p))
  for (const t of [...s.teamSeasons].filter((t) => out[t.memberId] == null).sort((a, b) => a.regRank - b.regRank)) out[t.memberId] = open.shift()!
  return out
}

/** Places a match's winner (side 'w') or loser ('l') can still finish in, from the bracket structure. */
function reach(br: BracketMatch[], losers: boolean, teams: number, m: BracketMatch, side: 'w' | 'l' | null): number[] {
  if (m.p) {
    // Winners bracket p decides p / p+1; toilet bowl p decides the mirror pair from the bottom.
    if (!losers) return side === 'w' ? [m.p] : side === 'l' ? [m.p + 1] : [m.p, m.p + 1]
    return [teams - m.p, teams + 1 - m.p]
  }
  const sides = side ? [side] : (['w', 'l'] as const)
  return [...new Set(sides.flatMap((sd) => {
    const next = br.filter((x) => x.t1_from?.[sd] === m.m || x.t2_from?.[sd] === m.m)
    // Unreferenced outcome (round-1 winners-bracket losers) drops into the next round's
    // placement match that has no feeders, i.e. the 5th-place game.
    if (!next.length) next.push(...br.filter((x) => x.r === m.r + 1 && x.p && !x.t1_from && !x.t2_from))
    return next.flatMap((x) => reach(br, losers, teams, x, null))
  }))]
}

/** Each bracket team's possible final places once playoff round `round` has been played. */
function possiblePlaces(lg: League, s: Season, round: number, fin: Record<string, number> | null): Record<string, number[]> {
  const raw = lg.raw.seasons.find((x) => Number(x.league.season) === s.year)
  const owner = lg.rosterOwner[s.year] ?? {}
  const out: Record<string, number[]> = {}
  if (!raw) return out
  for (const [br, losers] of [[raw.winnersBracket, false], [raw.losersBracket, true]] as const) {
    const ids = new Set(br.flatMap((m) => [m.t1, m.t2]).filter((x): x is number => x != null))
    for (const rid of ids) {
      const has = (m: BracketMatch) => m.t1 === rid || m.t2 === rid
      const played = br.filter((m) => m.r <= round && has(m) && m.w != null).sort((a, b) => b.r - a.r)[0]
      const upcoming = br.filter((m) => m.r > round && has(m)).sort((a, b) => a.r - b.r)[0]
      let places: number[] | null = null
      // Placement game already played: the exact place (once the season's final placements exist).
      if (!upcoming && played?.p && fin?.[owner[rid]] != null) places = [fin[owner[rid]]]
      else if (upcoming) places = reach(br, losers, s.teams, upcoming, null)
      else if (played) places = reach(br, losers, s.teams, played, played.w === rid ? 'w' : 'l')
      if (places?.length && owner[rid]) out[owner[rid]] = places
    }
  }
  return out
}

function compute(lg: League): EloResult {
  const r: Record<string, number> = {}
  const history: Record<string, EloPoint[]> = {}
  const games: EloGame[] = []
  const finishes: EloFinish[] = []
  for (const s of [...lg.seasons].sort((a, b) => a.year - b.year)) {
    for (const id of Object.keys(r)) r[id] = ELO.start + (1 - ELO.regress) * (r[id] - ELO.start)
    const ids = s.teamSeasons.map((t) => t.memberId)
    const paid: Record<string, number> = {}
    for (const id of ids) {
      r[id] ??= ELO.start
      ;(history[id] ??= []).push({ season: s.year, week: 0, rating: Math.round(r[id]) })
    }
    const raw = lg.raw.seasons.find((x) => Number(x.league.season) === s.year)
    const median = Number(raw?.league.settings.league_average_match ?? 0) === 1
    const sg = lg.games.filter((g) => g.season === s.year && (g.aPts > 0 || g.bPts > 0))
    const weeks = [...new Set(sg.map((g) => g.week))].sort((a, b) => a - b)
    for (const week of weeks) {
      const wk = sg.filter((g) => g.week === week)
      for (const g of wk) {
        if (g.playoff || g.aPts === g.bPts) continue
        const [winner, loser] = g.aPts > g.bPts ? [g.a, g.b] : [g.b, g.a]
        const margin = Math.abs(g.aPts - g.bPts)
        const pts = gameValue(margin)
        r[winner] = clamp(r[winner] + pts)
        r[loser] = clamp(r[loser] - pts)
        games.push({ season: s.year, week, winner, loser, margin, pts, playoff: g.playoff })
      }
      // Median game: above the weekly median gains, below it loses.
      if (median && !wk.some((g) => g.playoff)) {
        const pts = ids.map((id) => wk.find((g) => g.a === id)?.aPts ?? wk.find((g) => g.b === id)?.bPts ?? 0)
        const sorted = [...pts].sort((a, b) => b - a)
        const line = (sorted[Math.floor(ids.length / 2) - 1] + sorted[Math.floor(ids.length / 2)]) / 2
        ids.forEach((id, i) => { r[id] = clamp(r[id] + (pts[i] > line ? ELO.median : -ELO.median)) })
      }
      // End of the regular season: standings and points-for bonuses.
      if (week === s.playoffStart - 1 && weeks.includes(week)) {
        const byPf = [...s.teamSeasons].sort((a, b) => b.pf - a.pf)
        for (const t of s.teamSeasons) {
          r[t.memberId] = clamp(r[t.memberId] + regBonus(t.regRank, s.teams) + regBonus(byPf.indexOf(t) + 1, s.teams))
        }
      }
      // Playoff weeks: pay out the finish as the bracket narrows each team's possible places.
      if (wk.some((g) => g.playoff)) {
        const fin = s.complete ? placements(lg, s) : null
        const final = week === weeks.at(-1) ? fin : null
        const possible = possiblePlaces(lg, s, week - s.playoffStart + 1, fin)
        for (const id of ids) {
          const places = final ? [final[id]] : possible[id]
          if (!places?.length) continue
          const target = places.reduce((a, p) => a + finishBonus(p, s.teams), 0) / places.length
          const delta = target - (paid[id] ?? 0)
          paid[id] = target
          r[id] = clamp(r[id] + delta)
          if (final) finishes.push({ season: s.year, memberId: id, place: final[id], pts: target })
        }
      }
      for (const id of ids) history[id].push({ season: s.year, week, rating: Math.round(r[id]) })
    }
  }
  const peak: Record<string, EloPoint> = {}, low: Record<string, EloPoint> = {}
  for (const [id, h] of Object.entries(history)) {
    const pts = h.filter((p) => p.week > 0)
    peak[id] = pts.reduce((a, p) => (p.rating > a.rating ? p : a), pts[0] ?? h[0])
    low[id] = pts.reduce((a, p) => (p.rating < a.rating ? p : a), pts[0] ?? h[0])
  }
  return { current: Object.fromEntries(Object.entries(r).map(([id, v]) => [id, Math.round(v)])), history, games, finishes, peak, low }
}

const cache = new WeakMap<League, EloResult>()
export function franchiseElo(lg: League) {
  let v = cache.get(lg)
  if (!v) cache.set(lg, (v = compute(lg)))
  return v
}
