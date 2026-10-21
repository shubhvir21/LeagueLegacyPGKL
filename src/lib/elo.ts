// Franchise Elo: a long-term, points-based rating that carries across seasons.
//
// Every game moves points from the loser to the winner. Who you beat doesn't matter (no upset
// bonus); how much you won by does, scaling linearly up to a 60-point margin:
//
//   Regular season                 12 → 35
//   Winners-bracket playoff game    70 → 150
//   Championship                   200 → 300
//   Median game                    ±10 for finishing above / below the weekly median
//
// The toilet bowl punishes the loser only: losing a toilet-path game costs as much as a
// playoff win earns (70 → 150), losing the toilet bowl final as much as the championship
// (200 → 300). The winner of those games gets regular-season points. Consolation games — the
// 5th-place game and the 7th-place game between the teams that escaped the toilet — count as
// regular games.
//
// Everyone starts at 1750. Before each new season ratings regress 10% toward 1750. Ratings are
// kept within 500–3000.
import type { League } from './stats'

export const ELO = { start: 1750, min: 500, max: 3000, regress: 0.1, median: 10, marginCap: 60 }
export const BANDS = {
  regular: [12, 35],
  playoff: [70, 150],
  championship: [200, 300],
} as const
export const TIERS = [
  { name: 'Dynasty', min: 2200 },
  { name: 'Contender', min: 1800 },
  { name: 'Average', min: 1450 },
  { name: 'Rebuilding', min: 0 },
]
export const tierOf = (r: number) => TIERS.find((t) => r >= t.min)!.name

export interface EloPoint { season: number; week: number; rating: number }
export interface EloGame { season: number; week: number; winner: string; loser: string; margin: number; pts: number; lost: number; kind: keyof typeof BANDS | 'toilet' | 'toilet-final' }
export interface EloResult {
  current: Record<string, number>
  history: Record<string, EloPoint[]>
  games: EloGame[]
  peak: Record<string, EloPoint>
  low: Record<string, EloPoint>
}

const clamp = (r: number) => Math.max(ELO.min, Math.min(ELO.max, r))
const value = (kind: keyof typeof BANDS, margin: number) => {
  const [lo, hi] = BANDS[kind]
  return lo + (hi - lo) * Math.min(1, Math.abs(margin) / ELO.marginCap)
}

// The toilet bowl final is the last losers-bracket round, the game with the last-place team.
const isToiletFinal = (g: { week: number }, s: { playoffStart: number }) => g.week - s.playoffStart >= 1

function compute(lg: League): EloResult {
  const r: Record<string, number> = {}
  const history: Record<string, EloPoint[]> = {}
  const games: EloGame[] = []
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
    for (const week of [...new Set(sg.map((g) => g.week))].sort((a, b) => a - b)) {
      const wk = sg.filter((g) => g.week === week)
      for (const g of wk) {
        if (g.aPts === g.bPts) continue
        const [winner, loser] = g.aPts > g.bPts ? [g.a, g.b] : [g.b, g.a]
        const margin = Math.abs(g.aPts - g.bPts)
        let kind: EloGame['kind'] = 'regular'
        const toiletLate = isToiletFinal(g, s), inToiletFinal = g.a === s.toiletBowlLoser || g.b === s.toiletBowlLoser
        // Consolation games (5th place, and 7th place between the teams that escaped the toilet) are regular games.
        if (g.playoff && g.bracket === 'winners') kind = g.place === 1 ? 'championship' : g.place === 5 ? 'regular' : 'playoff'
        else if (g.playoff && g.bracket === 'losers') kind = !toiletLate ? 'toilet' : inToiletFinal ? 'toilet-final' : 'regular'
        const pts = value(kind === 'toilet' || kind === 'toilet-final' ? 'regular' : kind, margin)
        const lost = kind === 'toilet' ? value('playoff', margin) : kind === 'toilet-final' ? value('championship', margin) : pts
        r[winner] = clamp(r[winner] + pts)
        r[loser] = clamp(r[loser] - lost)
        games.push({ season: s.year, week, winner, loser, margin, pts, lost, kind })
      }
      // Median game: above the weekly median gains, below it loses.
      if (median && !wk.some((g) => g.playoff)) {
        const pts = ids.map((id) => wk.find((g) => g.a === id)?.aPts ?? wk.find((g) => g.b === id)?.bPts ?? 0)
        const sorted = [...pts].sort((a, b) => b - a)
        const line = (sorted[Math.floor(ids.length / 2) - 1] + sorted[Math.floor(ids.length / 2)]) / 2
        ids.forEach((id, i) => { r[id] = clamp(r[id] + (pts[i] > line ? ELO.median : -ELO.median)) })
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
  return { current: Object.fromEntries(Object.entries(r).map(([id, v]) => [id, Math.round(v)])), history, games, peak, low }
}

const cache = new WeakMap<League, EloResult>()
export function franchiseElo(lg: League) {
  let v = cache.get(lg)
  if (!v) cache.set(lg, (v = compute(lg)))
  return v
}
