// Monte Carlo playoff odds. Each simulation draws every team's "true" scoring level from a
// posterior (its average so far shrunk toward the league mean, with uncertainty that narrows as
// weeks are played), then plays out the rest of the regular season — head-to-head plus the
// median game — seeds the bracket by wins then points for, and plays the bracket.
import type { League, Season } from './stats'
import { FLEX, lineupSlots } from './lineup'
import { DEFAULT_MODEL, SKILL, posSd, type OddsModel } from './model'
import { playersOf } from './players'

export interface TeamOdds {
  memberId: string
  wins: number // current wins (h2h + median)
  losses: number
  pf: number
  rating: number // projected points next week (roster-aware when projections exist)
  scoreRating: number // from actual scores only
  rosterRating: number | null // best lineup from player ratings, next week
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

export interface OddsRun { season: number; afterWeek: number; nextWeek: number | null; sims: number; rosterAware: boolean; teams: TeamOdds[] }

const PRIOR_WEEKS = 4 // the league mean counts as this many weeks of evidence
const SD_PRIOR_WEEKS = 6
const HALF_LIFE = 6 // weeks: recent scores count more
const OUT = new Set(['Out', 'Doubtful', 'IR', 'PUP', 'NA', 'Sus', 'DNR', 'COV'])
const LONG = new Set(['IR', 'PUP', 'NA'])

interface Starter { m: number; sd: number; nfl: number } // nfl: index for correlated draws, -1 = independent
interface WeekPlan { R: number; starters: Starter[] }
type Plan = Record<string, Record<number, WeekPlan>> // member -> week -> lineup

/** Starting lineup chosen by expected points (managers start their best team). */
function pickLineup<T extends { pos: string; m: number }>(slots: string[], players: T[]): T[] {
  const pool = [...players].sort((a, b) => b.m - a.m)
  const used = new Set<number>()
  const out: T[] = []
  const take = (ok: (pos: string) => boolean) => {
    const i = pool.findIndex((p, j) => !used.has(j) && ok(p.pos))
    if (i >= 0) { used.add(i); out.push(pool[i]) }
  }
  for (const s of slots.filter((x) => !FLEX[x])) take((pos) => pos === s)
  for (const s of slots.filter((x) => FLEX[x]).sort((a, b) => FLEX[a].length - FLEX[b].length)) take((pos) => FLEX[s].includes(pos))
  return out
}

/** Per-team lineups for every week after `afterWeek`, from the roster as it stood then. Each
 *  player's expectation blends his (bias-corrected) projection with his actual points so far;
 *  byes, injuries and empty slots fall back to the best waiver-wire option at the position. */
export function rosterPlan(lg: League, year: number, afterWeek: number, model: OddsModel): Plan | null {
  const raw = lg.raw.seasons.find((s) => Number(s.league.season) === year)
  const proj = raw?.projections
  if (!raw || !proj) return null
  const latest = afterWeek >= raw.lastScored
  const pm = playersOf(lg)
  const slots = lineupSlots(raw.league.roster_positions)
  const perf: Record<string, number[]> = {}
  for (const w of pm.weeks) if (w.season === year && w.week <= afterWeek && w.pts !== 0) (perf[w.playerId] ??= []).push(w.pts)
  const nflIdx: Record<string, number> = {}
  const nflOf = (pid: string, pos: string) => {
    const tm = proj.nfl?.[pid]
    return tm && SKILL.has(pos) ? (nflIdx[tm] ??= Object.keys(nflIdx).length) : -1
  }
  // Roster as of the cutoff: today's for the latest week, otherwise that week's matchup roster.
  const rosterOf: Record<number, string[]> = {}
  if (latest) for (const r of raw.rosters) rosterOf[r.roster_id] = r.players ?? []
  else for (const m of raw.matchups[Math.max(0, afterWeek - 1)] ?? []) rosterOf[m.roster_id] = Object.keys(m.players_points ?? {})
  const out: Plan = {}
  for (const [rid, players] of Object.entries(rosterOf)) {
    const id = lg.rosterOwner[year][Number(rid)]
    if (!id) continue
    out[id] = {}
    for (const [wk, pts] of Object.entries(proj.weeks)) {
      const w = Number(wk)
      if (w <= afterWeek) continue
      const ahead = w - afterWeek - 1
      const pool = players.map((pid) => {
        const pos = pm.info[pid]?.pos ?? '?'
        const p = (pts[pid] ?? 0) * (model.pos[pos]?.bias ?? 1)
        const xs = perf[pid] ?? []
        const avg = xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
        const a = xs.length ? (0.5 * xs.length) / (xs.length + 6) : 0
        let m = p > 0 ? (1 - a) * p + a * avg : 0 // no projection = bye / not playing
        const st = latest ? proj.status?.[pid] : undefined
        if (st && ((ahead === 0 && OUT.has(st)) || (ahead < 4 && LONG.has(st)))) m = 0
        else if (st === 'Questionable' && ahead === 0) m *= 0.8
        return { pos, m, sd: m > 0 ? posSd(model, pos, m) : 0, nfl: nflOf(pid, pos) }
      })
      // One waiver-wire option per position, used only if it beats what's on the roster.
      for (const [pos, v] of Object.entries(proj.repl?.[w] ?? {})) {
        const m = v * (model.pos[pos]?.bias ?? 1)
        if (m > 0) pool.push({ pos, m, sd: posSd(model, pos, m), nfl: -1 })
      }
      const starters = pickLineup(slots, pool).filter((s) => s.m > 0)
      out[id][w] = { R: starters.reduce((a, s) => a + s.m, 0), starters }
    }
  }
  return out
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
// Precomputed standard normals: a table lookup is much cheaper than Box-Muller per draw.
const NT = 1 << 16
const NORMALS = (() => {
  const r = rng(12345), out = new Float64Array(NT)
  for (let k = 0; k < NT; k += 2) {
    let u = 0
    while (u === 0) u = r()
    const m = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * r()
    out[k] = m * Math.cos(th); out[k + 1] = m * Math.sin(th)
  }
  return out
})()
const gauss = (r: () => number) => NORMALS[(r() * NT) | 0]

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

export interface SimOpts { plan?: Plan | null; weight?: number | null; model?: OddsModel }
function simulate(c: Ctx, afterWeek: number, sims: number, seed: number, opts: SimOpts = {}): OddsRun {
  const model = opts.model ?? DEFAULT_MODEL
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
    const xs = scores[id].slice(0, afterWeek).map((p, w) => ({ p, wt: 0.5 ** ((afterWeek - 1 - w) / HALF_LIFE) })).filter((x) => x.p != null)
    const k = xs.length
    const sw = xs.reduce((a, x) => a + x.wt, 0)
    const kEff = sw ** 2 / (xs.reduce((a, x) => a + x.wt ** 2, 0) || 1) // effective sample size after decay
    const mean = xs.reduce((a, x) => a + x.p * x.wt, 0) / (sw || 1)
    const v = xs.reduce((a, x) => a + (x.p - mean) ** 2, 0)
    mu[i] = (kEff * mean + PRIOR_WEEKS * c.priorMean) / (kEff + PRIOR_WEEKS)
    sd[i] = Math.sqrt((v + SD_PRIOR_WEEKS * c.priorSd ** 2) / (Math.max(0, k - 1) + SD_PRIOR_WEEKS))
    // Spread of true team talent is narrower than week-to-week noise: ~0.45 of game sd.
    muSd[i] = Math.sqrt(1 / (1 / (0.45 * c.priorSd) ** 2 + kEff / sd[i] ** 2))
  })

  // Roster-aware weeks: each starter is drawn from his own distribution (same-NFL-team players
  // correlated), plus a pull toward the team's actual scoring and a little team-level noise.
  const lastWeek = lastReg + 3
  const wR = opts.weight ?? 0
  const rosterAware = !!opts.plan && wR > 0 && ids.every((id) => opts.plan![id])
  const weekPlan = (i: number, w: number) => (rosterAware ? opts.plan![ids[i]][w] : undefined)
  if (rosterAware) for (let i = 0; i < n; i++) muSd[i] *= 0.6 // knowing the roster narrows how wrong the rating can be
  const nflN = 40
  const zN = new Float64Array(nflN)
  const sr = Math.sqrt(model.rho), sr1 = Math.sqrt(1 - model.rho)
  const meanOf = (i: number, w: number) => { const p = weekPlan(i, w); return p ? p.R + (1 - wR) * (mu[i] - p.R) : mu[i] }
  // Flat per-(team, week) starter arrays for the hot loop; base = mean incl. blend offset.
  const slot = (i: number, w: number) => i * (lastWeek + 1) + w
  const has = new Uint8Array(n * (lastWeek + 1)), base = new Float64Array(n * (lastWeek + 1))
  const sSd: Float64Array[] = [], sNfl: Int16Array[] = []
  for (let i = 0; i < n; i++) for (let w = 0; w <= lastWeek; w++) {
    const p = weekPlan(i, w), k = slot(i, w)
    if (!p) continue
    has[k] = 1
    base[k] = p.R + (1 - wR) * (mu[i] - p.R)
    sSd[k] = Float64Array.from(p.starters, (x) => x.sd)
    sNfl[k] = Int16Array.from(p.starters, (x) => (x.nfl >= 0 ? x.nfl % 40 : -1))
  }

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
  const newWeek = () => { for (let k = 0; k < nflN; k++) zN[k] = gauss(r) }
  const play = (i: number, w: number) => {
    const k = slot(i, w > lastWeek ? lastWeek : w)
    if (!has[k]) return mu[i] + str[i] + sd[i] * gauss(r)
    const sdv = sSd[k], nf = sNfl[k]
    let S = base[k] + str[i] + model.resid * gauss(r)
    for (let j = 0; j < sdv.length; j++) S += sdv[j] * (nf[j] >= 0 ? sr * zN[nf[j]] + sr1 * gauss(r) : gauss(r))
    return S
  }

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) { W[i] = baseW[i]; PF[i] = basePf[i]; str[i] = muSd[i] * gauss(r); nextWon[i] = 0 }
    for (let w = afterWeek + 1; w <= lastReg; w++) {
      newWeek()
      for (let i = 0; i < n; i++) { wk[i] = play(i, w); PF[i] += wk[i] }
      for (const [a, b] of pairings[w] ?? []) {
        const x = idx[a], y = idx[b]
        const winner = wk[x] >= wk[y] ? x : y
        W[winner]++
        if (w === nextWeek) nextWon[winner] = 1
      }
      if (median) {
        const sorted = wk.slice().sort().reverse(), line = (sorted[Math.floor(n / 2) - 1] + sorted[Math.floor(n / 2)]) / 2
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
    let round = season.playoffStart
    newWeek()
    const game = (a: number, b: number) => (play(a, round) >= play(b, round) ? a : b)
    let alive = field
    if (byes) {
      const rest = alive.slice(byes)
      const adv: number[] = []
      for (let k = 0; k < rest.length / 2; k++) adv.push(game(rest[k], rest[rest.length - 1 - k]))
      alive = [...alive.slice(0, byes), ...adv.sort((a, b) => field.indexOf(a) - field.indexOf(b))]
      round++
      newWeek()
    }
    while (alive.length > 2) {
      const adv: number[] = []
      for (let k = 0; k < alive.length / 2; k++) adv.push(game(alive[k], alive[alive.length - 1 - k]))
      alive = adv.sort((a, b) => field.indexOf(a) - field.indexOf(b))
      round++
      newWeek()
    }
    acc.fin[alive[0]]++; acc.fin[alive[1]]++
    acc.title[game(alive[0], alive[1])]++
  }

  const teams: TeamOdds[] = ids.map((id, i) => ({
    memberId: id, wins: baseW[i], losses: baseL[i], pf: basePf[i],
    rating: meanOf(i, afterWeek + 1), scoreRating: mu[i], rosterRating: weekPlan(i, afterWeek + 1)?.R ?? null,
    projWins: acc.wins[i] / sims, playoff: acc.po[i] / sims, bye: acc.bye[i] / sims,
    final: acc.fin[i] / sims, title: acc.title[i] / sims, last: acc.last[i] / sims,
    seeds: Array.from(seeds[i], (x) => x / sims),
    ifWin: nextWeek && winN[i] ? winPo[i] / winN[i] : null,
    ifLoss: nextWeek && lossN[i] ? lossPo[i] / lossN[i] : null,
  })).sort((a, b) => b.playoff - a.playoff || b.title - a.title)
  return { season: season.year, afterWeek, nextWeek, sims, rosterAware, teams }
}

const cache = new WeakMap<League, Record<string, unknown>>()
function memo<T>(lg: League, key: string, f: () => T): T {
  let m = cache.get(lg)
  if (!m) cache.set(lg, (m = {}))
  return (m[key] ??= f()) as T
}

const modelOf = (lg: League) => lg.raw.model ?? DEFAULT_MODEL
const optsAt = (lg: League, year: number, w: number, model = modelOf(lg), weight: number | null = model.rosterWeight): SimOpts =>
  ({ model, weight, plan: weight ? rosterPlan(lg, year, w, model) : null })

/** Odds as of the latest scored regular-season week (or a chosen week). */
export function playoffOdds(lg: League, year: number, afterWeek?: number, sims = 10000): OddsRun | null {
  return memo(lg, `odds|${year}|${afterWeek}|${sims}`, () => {
    const c = context(lg, year)
    if (!c) return null
    const w = Math.min(afterWeek ?? weeksScored(c), weeksScored(c))
    return simulate(c, w, sims, year * 100 + (afterWeek ?? 99), optsAt(lg, year, w))
  })
}

/** Odds re-run after every week of the season so far — the odds over time. */
export function oddsHistory(lg: League, year: number, sims = 1500): OddsRun[] {
  return memo(lg, `hist|${year}|${sims}`, () => {
    const c = context(lg, year)
    if (!c) return []
    return Array.from({ length: weeksScored(c) + 1 }, (_, w) => simulate(c, w, sims, year * 1000 + w, optsAt(lg, year, w)))
  })
}

/** Backtest: replay finished seasons from every week with each model variant and score the
 *  playoff probabilities against who actually made it (Brier score; lower is better). */
export function backtest(lg: League, model: OddsModel, weights: (number | null)[], sims = 600): NonNullable<OddsModel['backtest']> {
  const seasons = lg.seasons.filter((s) => s.complete && lg.raw.seasons.find((r) => Number(r.league.season) === s.year)?.projections)
  const made = new Set(seasons.flatMap((s) => s.teamSeasons.filter((t) => t.madePlayoffs).map((t) => `${s.year}|${t.memberId}`)))
  const rate = made.size / (seasons.reduce((a, s) => a + s.teams, 0) || 1)
  type Pt = { p: number; y: number; week: number }
  const points: Record<string, Pt[]> = {}
  for (const s of seasons) {
    const c = context(lg, s.year)!
    for (let w = 1; w < c.lastReg; w++) {
      for (const wt of weights) {
        const run = simulate(c, w, sims, s.year * 1000 + w, { model, weight: wt, plan: wt ? rosterPlan(lg, s.year, w, model) : null })
        for (const t of run.teams) (points[String(wt)] ??= []).push({ p: t.playoff, y: made.has(`${s.year}|${t.memberId}`) ? 1 : 0, week: w })
      }
    }
  }
  const brier = (xs: Pt[]) => xs.reduce((a, x) => a + (x.p - x.y) ** 2, 0) / (xs.length || 1)
  const ll = (xs: Pt[]) => -xs.reduce((a, x) => { const p = Math.min(0.999, Math.max(0.001, x.p)); return a + (x.y ? Math.log(p) : Math.log(1 - p)) }, 0) / (xs.length || 1)
  const variants = weights.map((wt) => ({
    name: wt == null ? 'Scoring only' : `Roster ${Math.round(wt * 100)}%`, weight: wt,
    brier: +brier(points[String(wt)]).toFixed(4), logLoss: +ll(points[String(wt)]).toFixed(4), n: points[String(wt)].length,
  }))
  const best = [...variants].filter((v) => v.weight != null).sort((a, b) => a.brier - b.brier)[0] ?? variants[0]
  const bp = points[String(best.weight)] ?? []
  const edges = [0, 0.1, 0.25, 0.4, 0.6, 0.75, 0.9, 1.0001]
  const calibration = edges.slice(0, -1).map((lo, k) => {
    const xs = bp.filter((x) => x.p >= lo && x.p < edges[k + 1])
    return { lo, hi: Math.min(1, edges[k + 1]), predicted: +(xs.reduce((a, x) => a + x.p, 0) / (xs.length || 1)).toFixed(3), actual: +(xs.reduce((a, x) => a + x.y, 0) / (xs.length || 1)).toFixed(3), n: xs.length }
  }).filter((b) => b.n)
  const sc = points['null'] ?? []
  const weeks = [...new Set(bp.map((x) => x.week))].sort((a, b) => a - b)
  return {
    seasons: seasons.map((s) => s.year), baseline: +(rate * (1 - rate)).toFixed(4), variants, calibration,
    byWeek: weeks.map((w) => ({ week: w, scoring: +brier(sc.filter((x) => x.week === w)).toFixed(4), model: +brier(bp.filter((x) => x.week === w)).toFixed(4) })),
  }
}

/** Team-level noise left over after player variance: actual minus planned lineup, played weeks. */
export function fitResid(lg: League, model: OddsModel): number {
  let ss = 0, pv = 0, k = 0
  for (const s of lg.seasons) {
    const raw = lg.raw.seasons.find((r) => Number(r.league.season) === s.year)
    if (!raw?.projections) continue
    for (let w = 1; w < Math.min(raw.lastScored, s.playoffStart); w++) {
      const plan = rosterPlan(lg, s.year, w - 1 || 0, model)
      if (!plan) continue
      for (const g of lg.games.filter((x) => x.season === s.year && x.week === w)) for (const [id, pts] of [[g.a, g.aPts], [g.b, g.bPts]] as const) {
        const p = plan[id]?.[w]
        if (!p) continue
        ss += (pts - p.R) ** 2
        pv += p.starters.reduce((a, x) => a + x.sd ** 2, 0)
        k++
      }
    }
  }
  return k ? +Math.sqrt(Math.max(0, (ss - pv) / k)).toFixed(2) : DEFAULT_MODEL.resid
}
