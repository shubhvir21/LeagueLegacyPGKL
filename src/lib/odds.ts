// Monte Carlo playoff odds. Each simulation draws every team's "true" scoring level from a
// posterior (its average so far shrunk toward the league mean, with uncertainty that narrows as
// weeks are played), then plays out the rest of the regular season — head-to-head plus the
// median game — seeds the bracket by wins then points for, and plays the bracket.
import type { League, Season } from './stats'

export interface TeamOdds {
  memberId: string
  wins: number // current wins (h2h + median)
  losses: number
  pf: number
  rating: number // posterior mean points per week
  projWins: number
  playoff: number // 0-1
  bye: number
  final: number
  title: number
  last: number // finish last in the regular season
  seeds: number[] // probability of each seed, index 0 = 1 seed
  ifWin: number | null // playoff odds if they win next week's head-to-head
  ifLoss: number | null
}

export interface OddsRun { season: number; afterWeek: number; nextWeek: number | null; sims: number; teams: TeamOdds[] }

const PRIOR_WEEKS = 4 // the league mean counts as this many weeks of evidence
const SD_PRIOR_WEEKS = 6

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const gauss = (r: () => number) => {
  let u = 0
  while (u === 0) u = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r())
}

interface Ctx {
  season: Season
  ids: string[]
  scores: Record<string, number[]> // regular-season week -> points, index week-1
  pairings: Record<number, [string, string][]> // regular-season week -> games
  lastReg: number
  median: boolean
  priorMean: number
  priorSd: number
}

function context(lg: League, year: number): Ctx | null {
  const season = lg.seasons.find((s) => s.year === year)
  if (!season) return null
  const ids = season.teamSeasons.map((t) => t.memberId)
  const lastReg = season.playoffStart - 1
  const scores: Record<string, number[]> = Object.fromEntries(ids.map((id) => [id, []]))
  const pairings: Record<number, [string, string][]> = {}
  for (const g of lg.games) {
    if (g.season !== year || g.playoff || g.week > lastReg) continue
    ;(pairings[g.week] ??= []).push([g.a, g.b])
    scores[g.a][g.week - 1] = g.aPts
    scores[g.b][g.week - 1] = g.bPts
  }
  for (const g of lg.schedule) {
    if (g.season !== year || g.playoff || g.week > lastReg) continue
    if (!pairings[g.week]?.some(([a, b]) => a === g.a && b === g.b)) (pairings[g.week] ??= []).push([g.a, g.b])
  }
  const raw = lg.raw.seasons.find((s) => Number(s.league.season) === year)
  const median = Number(raw?.league.settings.league_average_match ?? 0) === 1
  // Prior from every regular-season score in league history.
  const all = lg.games.filter((g) => !g.playoff).flatMap((g) => [g.aPts, g.bPts]).filter((p) => p > 0)
  const priorMean = all.reduce((a, b) => a + b, 0) / (all.length || 1) || 110
  const priorSd = Math.sqrt(all.reduce((a, p) => a + (p - priorMean) ** 2, 0) / (all.length || 1)) || 25
  return { season, ids, scores, pairings, lastReg, median, priorMean, priorSd }
}

function weeksScored(c: Ctx) {
  let w = 0
  for (let k = 1; k <= c.lastReg; k++) if (c.ids.every((id) => c.scores[id][k - 1] != null)) w = k
  return w
}

function simulate(c: Ctx, afterWeek: number, sims: number, seed: number): OddsRun {
  const { ids, scores, pairings, lastReg, median, season } = c
  const n = ids.length
  const idx = Object.fromEntries(ids.map((id, i) => [id, i]))
  const baseW = new Float64Array(n), baseL = new Float64Array(n), basePf = new Float64Array(n)
  const mu = new Float64Array(n), muSd = new Float64Array(n), sd = new Float64Array(n)

  for (let w = 1; w <= afterWeek; w++) {
    const wk = ids.map((id) => scores[id][w - 1] ?? 0)
    for (const [a, b] of pairings[w] ?? []) {
      const x = wk[idx[a]], y = wk[idx[b]]
      if (x > y) { baseW[idx[a]]++; baseL[idx[b]]++ } else if (y > x) { baseW[idx[b]]++; baseL[idx[a]]++ }
    }
    if (median) {
      const s = [...wk].sort((p, q) => q - p), line = (s[Math.floor(n / 2) - 1] + s[Math.floor(n / 2)]) / 2
      wk.forEach((p, i) => (p > line ? baseW[i]++ : baseL[i]++))
    }
    wk.forEach((p, i) => (basePf[i] += p))
  }
  ids.forEach((id, i) => {
    const xs = scores[id].slice(0, afterWeek).filter((p) => p != null)
    const k = xs.length
    const mean = xs.reduce((a, b) => a + b, 0) / (k || 1)
    const v = xs.reduce((a, p) => a + (p - mean) ** 2, 0)
    mu[i] = (k * mean + PRIOR_WEEKS * c.priorMean) / (k + PRIOR_WEEKS)
    sd[i] = Math.sqrt((v + SD_PRIOR_WEEKS * c.priorSd ** 2) / (Math.max(0, k - 1) + SD_PRIOR_WEEKS))
    // Spread of true team talent is narrower than week-to-week noise: ~0.45 of game sd.
    muSd[i] = Math.sqrt(1 / (1 / (0.45 * c.priorSd) ** 2 + k / sd[i] ** 2))
  })

  const nextWeek = afterWeek < lastReg ? afterWeek + 1 : null
  const nextOpp = new Int32Array(n).fill(-1)
  for (const [a, b] of nextWeek ? pairings[nextWeek] ?? [] : []) { nextOpp[idx[a]] = idx[b]; nextOpp[idx[b]] = idx[a] }

  const P = season.playoffTeams, byes = P === 6 ? 2 : 0
  const acc = { wins: new Float64Array(n), po: new Float64Array(n), bye: new Float64Array(n), fin: new Float64Array(n), title: new Float64Array(n), last: new Float64Array(n) }
  const seeds = ids.map(() => new Float64Array(n))
  const winN = new Float64Array(n), winPo = new Float64Array(n), lossN = new Float64Array(n), lossPo = new Float64Array(n)
  const r = rng(seed)
  const W = new Float64Array(n), PF = new Float64Array(n), str = new Float64Array(n), wk = new Float64Array(n)
  const nextWon = new Int8Array(n)
  const play = (i: number) => str[i] + sd[i] * gauss(r)

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) { W[i] = baseW[i]; PF[i] = basePf[i]; str[i] = mu[i] + muSd[i] * gauss(r); nextWon[i] = 0 }
    for (let w = afterWeek + 1; w <= lastReg; w++) {
      for (let i = 0; i < n; i++) { wk[i] = play(i); PF[i] += wk[i] }
      for (const [a, b] of pairings[w] ?? []) {
        const x = idx[a], y = idx[b]
        const winner = wk[x] >= wk[y] ? x : y
        W[winner]++
        if (w === nextWeek) nextWon[winner] = 1
      }
      if (median) {
        const sorted = Array.from(wk).sort((p, q) => q - p), line = (sorted[Math.floor(n / 2) - 1] + sorted[Math.floor(n / 2)]) / 2
        for (let i = 0; i < n; i++) if (wk[i] > line) W[i]++
      }
    }
    const order = ids.map((_, i) => i).sort((a, b) => W[b] - W[a] || PF[b] - PF[a])
    order.forEach((t, place) => { seeds[t][place]++ })
    acc.last[order[n - 1]]++
    for (let i = 0; i < n; i++) acc.wins[i] += W[i]
    const field = order.slice(0, P)
    field.forEach((t, k) => { acc.po[t]++; if (k < byes) acc.bye[t]++ })
    if (nextWeek) for (let i = 0; i < n; i++) if (nextOpp[i] >= 0) {
      const made = field.includes(i) ? 1 : 0
      if (nextWon[i]) { winN[i]++; winPo[i] += made } else { lossN[i]++; lossPo[i] += made }
    }
    // Bracket: higher seed plays lowest remaining seed each round.
    const game = (a: number, b: number) => (play(a) >= play(b) ? a : b)
    let alive = field
    if (byes) {
      const rest = alive.slice(byes)
      const adv: number[] = []
      for (let k = 0; k < rest.length / 2; k++) adv.push(game(rest[k], rest[rest.length - 1 - k]))
      alive = [...alive.slice(0, byes), ...adv.sort((a, b) => field.indexOf(a) - field.indexOf(b))]
    }
    while (alive.length > 2) {
      const adv: number[] = []
      for (let k = 0; k < alive.length / 2; k++) adv.push(game(alive[k], alive[alive.length - 1 - k]))
      alive = adv.sort((a, b) => field.indexOf(a) - field.indexOf(b))
    }
    acc.fin[alive[0]]++; acc.fin[alive[1]]++
    acc.title[game(alive[0], alive[1])]++
  }

  const teams: TeamOdds[] = ids.map((id, i) => ({
    memberId: id, wins: baseW[i], losses: baseL[i], pf: basePf[i], rating: mu[i],
    projWins: acc.wins[i] / sims, playoff: acc.po[i] / sims, bye: acc.bye[i] / sims,
    final: acc.fin[i] / sims, title: acc.title[i] / sims, last: acc.last[i] / sims,
    seeds: Array.from(seeds[i], (x) => x / sims),
    ifWin: nextWeek && winN[i] ? winPo[i] / winN[i] : null,
    ifLoss: nextWeek && lossN[i] ? lossPo[i] / lossN[i] : null,
  })).sort((a, b) => b.playoff - a.playoff || b.title - a.title)
  return { season: season.year, afterWeek, nextWeek, sims, teams }
}

const cache = new WeakMap<League, Record<string, unknown>>()
function memo<T>(lg: League, key: string, f: () => T): T {
  let m = cache.get(lg)
  if (!m) cache.set(lg, (m = {}))
  return (m[key] ??= f()) as T
}

/** Odds as of the latest scored regular-season week (or a chosen week). */
export function playoffOdds(lg: League, year: number, afterWeek?: number, sims = 10000): OddsRun | null {
  return memo(lg, `odds|${year}|${afterWeek}|${sims}`, () => {
    const c = context(lg, year)
    if (!c) return null
    return simulate(c, Math.min(afterWeek ?? weeksScored(c), weeksScored(c)), sims, year * 100 + (afterWeek ?? 99))
  })
}

/** Odds re-run after every week of the season so far — the odds over time. */
export function oddsHistory(lg: League, year: number, sims = 2500): OddsRun[] {
  return memo(lg, `hist|${year}|${sims}`, () => {
    const c = context(lg, year)
    if (!c) return []
    const last = weeksScored(c)
    return Array.from({ length: last + 1 }, (_, w) => simulate(c, w, sims, year * 1000 + w))
  })
}
