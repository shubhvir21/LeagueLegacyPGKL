// Upset index: every game's pre-game win probability, from what was knowable before kickoff.
//
//   Expected score = 75% projected best lineup (that week's roster + Sleeper projections)
//                  + 25% form (season average so far, shrunk toward the league mean)
//   Win chance     = Φ(expected margin / σ), where σ is the spread of real margins around
//                    expected margins across every game in league history (self-calibrating)
// Without projections for a week, form alone is used.
import type { Game, League } from './stats'
import { rosterPlan } from './odds'
import { DEFAULT_MODEL } from './model'

export interface GameOdds {
  g: Game
  expA: number; expB: number
  pA: number // pre-game chance that a wins
  winner: string | null
  loser: string | null
  pWinner: number // pre-game chance the eventual winner had
}

const PROJ_WEIGHT = 0.75
const PRIOR_WEEKS = 4

// Standard normal CDF (Abramowitz–Stegun 7.1.26).
function phi(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp((-x * x) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}

function compute(lg: League): GameOdds[] {
  const model = lg.raw.model ?? DEFAULT_MODEL
  const games = lg.games.filter((g) => g.aPts > 0 && g.bPts > 0)
  const all = games.flatMap((g) => [g.aPts, g.bPts])
  const leagueMean = all.reduce((a, b) => a + b, 0) / (all.length || 1)
  const plans: Record<string, ReturnType<typeof rosterPlan>> = {}
  const planFor = (season: number, week: number) => (plans[`${season}|${week}`] ??= rosterPlan(lg, season, week - 1, model))
  const form = (id: string, season: number, week: number) => {
    const xs = games.filter((g) => g.season === season && g.week < week && (g.a === id || g.b === id)).map((g) => (g.a === id ? g.aPts : g.bPts))
    return (xs.reduce((a, b) => a + b, 0) + PRIOR_WEEKS * leagueMean) / (xs.length + PRIOR_WEEKS)
  }
  const exp = (id: string, season: number, week: number) => {
    const f = form(id, season, week)
    const R = planFor(season, week)?.[id]?.[week]?.R
    return R ? PROJ_WEIGHT * R + (1 - PROJ_WEIGHT) * f : f
  }
  const rows = games.map((g) => ({ g, expA: exp(g.a, g.season, g.week), expB: exp(g.b, g.season, g.week) }))
  // Calibrate σ from how far real margins land from expected margins.
  const resid = rows.map((r) => (r.g.aPts - r.g.bPts) - (r.expA - r.expB))
  const sigma = Math.sqrt(resid.reduce((a, x) => a + x * x, 0) / (resid.length || 1)) || 35
  return rows.map(({ g, expA, expB }) => {
    const pA = phi((expA - expB) / sigma)
    const winner = g.aPts > g.bPts ? g.a : g.bPts > g.aPts ? g.b : null
    return { g, expA, expB, pA, winner, loser: winner ? (winner === g.a ? g.b : g.a) : null, pWinner: winner === g.a ? pA : winner === g.b ? 1 - pA : 0.5 }
  })
}

const cache = new WeakMap<League, GameOdds[]>()
export function gameOdds(lg: League) {
  let v = cache.get(lg)
  if (!v) cache.set(lg, (v = compute(lg)))
  return v
}

/** A win counts as an upset when the winner's pre-game chance was under this. */
export const UPSET_LINE = 0.35
