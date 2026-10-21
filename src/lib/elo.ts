// Franchise Elo: a long-term, points-based rating that carries across seasons.
//
// Games: every game — regular season, playoffs, toilet bowl — moves points from the loser to the
// winner. Who you beat doesn't matter (no upset bonus); how much you won by does: 12 → 35,
// scaling linearly up to a 60-point margin. Median games: ±10 for finishing above / below the
// weekly median.
//
// Finish: when a season ends, final placement pays out on a mirrored, zero-sum scale:
//   1st +450 / 10th −450 · 2nd +250 / 9th −250 · 3rd +150 / 8th −150 · 4th +100 / 7th −100 · 5th +50 / 6th −50
//
// Everyone starts at 1750. Before each new season ratings regress 10% toward 1750. Ratings are
// kept within 450–5000.
import type { League, Season } from './stats'

export const ELO = { start: 1750, min: 450, max: 5000, regress: 0.1, median: 10, marginCap: 60, game: [12, 35] }
export const TIERS = [
  { name: 'Dynasty', min: 2200 },
  { name: 'Contender', min: 1800 },
  { name: 'Average', min: 1450 },
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
export const FINISH = [450, 250, 150, 100, 50]
export const finishBonus = (place: number, teams: number) => (place <= teams / 2 ? FINISH[place - 1] ?? 0 : -(FINISH[teams - place] ?? 0))

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

function compute(lg: League): EloResult {
  const r: Record<string, number> = {}
  const history: Record<string, EloPoint[]> = {}
  const games: EloGame[] = []
  const finishes: EloFinish[] = []
  for (const s of [...lg.seasons].sort((a, b) => a.year - b.year)) {
    for (const id of Object.keys(r)) r[id] = ELO.start + (1 - ELO.regress) * (r[id] - ELO.start)
    const ids = s.teamSeasons.map((t) => t.memberId)
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
        if (g.aPts === g.bPts) continue
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
      // Season finale: pay out final placements.
      if (s.complete && week === weeks.at(-1)) {
        for (const [id, place] of Object.entries(placements(lg, s))) {
          const pts = finishBonus(place, s.teams)
          r[id] = clamp(r[id] + pts)
          finishes.push({ season: s.year, memberId: id, place, pts })
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
