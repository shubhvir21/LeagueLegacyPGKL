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
  last: number // lose the toilet bowl (losers bracket, lower score advances)
  seeds: number[] // probability of each seed, index 0 = 1 seed
  ifWin: number | null // playoff odds if they go 2–0 next week (win, with the median game when the league has one)
  ifSplit?: number | null // 1–1 next week (median leagues only)
  ifLoss: number | null // 0–2 next week
}

export interface OddsRun { season: number; afterWeek: number; nextWeek: number | null; sims: number; rosterAware: boolean; teams: TeamOdds[]; frozenAt?: string; toiletLast?: boolean }

const PRIOR_WEEKS = 4 // the league mean counts as this many weeks of evidence
const SD_PRIOR_WEEKS = 6
const HALF_LIFE = 6 // weeks: recent scores count more
const OUT = new Set(['Out', 'Doubtful', 'IR', 'PUP', 'NA', 'Sus', 'DNR', 'COV'])

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
        // Status is the freshest news for next week; later weeks trust Sleeper's projection,
        // which already builds in the expected return date.
        if (st && ahead === 0 && OUT.has(st)) m = 0
        return { pos, m, sd: m > 0 ? posSd(model, pos, m) : 0, nfl: nflOf(pid, pos) }
      })
      // Waiver-wire fill-ins (the position's 3rd-best free agent): one for every lineup slot the
      // position can play, so a missing QB, RB, WR, TE, K or DEF is always replaced, used only
      // where it beats what's on the roster.
      for (const [pos, v] of Object.entries(proj.repl?.[w] ?? {})) {
        const m = v * (model.pos[pos]?.bias ?? 1)
        const fits = slots.filter((x) => x === pos || FLEX[x]?.includes(pos)).length
        if (m > 0) for (let k = 0; k < fits; k++) pool.push({ pos, m, sd: posSd(model, pos, m), nfl: -1 })
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

export interface SimOpts { plan?: Plan | null; weight?: number | null; model?: OddsModel; record?: SimRecord }
/** Filled per simulation when scenarios are wanted: who won each remaining game, who made it. */
export interface SimRecord { games: { week: number; a: number; b: number }[]; winners: Uint8Array; made: Uint8Array; bye: Uint8Array; seed: Uint8Array; remW: Uint8Array; nextW: Uint8Array; finalW: Uint8Array }
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
  const per = median ? 2 : 1
  const nxN = ids.map(() => new Float64Array(3)), nxPo = ids.map(() => new Float64Array(3))
  const rec = opts.record
  const gameIdx: Record<string, number> = {}
  if (rec) {
    for (let w = afterWeek + 1; w <= lastReg; w++) for (const [a, b] of pairings[w] ?? []) { gameIdx[`${w}|${a}`] = rec.games.length; rec.games.push({ week: w, a: idx[a], b: idx[b] }) }
    rec.winners = new Uint8Array(sims * rec.games.length); rec.made = new Uint8Array(sims * n); rec.bye = new Uint8Array(sims * n)
    rec.seed = new Uint8Array(sims * n); rec.remW = new Uint8Array(sims * n); rec.nextW = new Uint8Array(sims * n); rec.finalW = new Uint8Array(sims * n)
  }
  const G = rec ? rec.games.length : 0
  const r = rng(seed)
  const W = new Float64Array(n), PF = new Float64Array(n), str = new Float64Array(n), wk = new Float64Array(n)
  const nextWon = new Int8Array(n) // wins next week, counting the median game
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
        if (w === nextWeek) nextWon[winner]++
        if (rec) { rec.winners[s * G + gameIdx[`${w}|${a}`]] = winner === x ? 0 : 1; if (w === nextWeek) rec.nextW[s * n + winner]++ }
      }
      if (median) {
        const sorted = wk.slice().sort().reverse(), line = (sorted[Math.floor(n / 2) - 1] + sorted[Math.floor(n / 2)]) / 2
        for (let i = 0; i < n; i++) if (wk[i] > line) { W[i]++; if (w === nextWeek) nextWon[i]++; if (rec && w === nextWeek) rec.nextW[s * n + i]++ }
      }
    }
    const order = ids.map((_, i) => i).sort((a, b) => W[b] - W[a] || PF[b] - PF[a])
    order.forEach((t, place) => { seeds[t][place]++; if (rec) { rec.seed[s * n + t] = place; rec.remW[s * n + t] = W[t] - baseW[t]; rec.finalW[s * n + t] = W[t] } })
    for (let i = 0; i < n; i++) acc.wins[i] += W[i]
    const field = order.slice(0, P)
    field.forEach((t, k) => { acc.po[t]++; if (k < byes) acc.bye[t]++; if (rec) { rec.made[s * n + t] = 1; if (k < byes) rec.bye[s * n + t] = 1 } })
    if (nextWeek) for (let i = 0; i < n; i++) if (nextOpp[i] >= 0) {
      const made = field.includes(i) ? 1 : 0, k = Math.min(per, nextWon[i])
      nxN[i][k]++; nxPo[i][k] += made
    }
    // Toilet bowl: non-playoff teams, best vs worst each round, the lower score advances;
    // whoever 'wins' the last round finishes last.
    let tb = order.slice(P), tr = season.playoffStart
    if (tb.length) {
      while (tb.length > 1) {
        newWeek()
        const adv: number[] = []
        for (let k = 0; k < Math.floor(tb.length / 2); k++) { const a = tb[k], b = tb[tb.length - 1 - k]; adv.push(play(a, tr) < play(b, tr) ? a : b) }
        if (tb.length % 2) adv.push(tb[Math.floor(tb.length / 2)])
        tb = adv.sort((a, b) => order.indexOf(a) - order.indexOf(b))
        tr++
      }
      acc.last[tb[0]]++
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
    ifWin: nextWeek && nxN[i][per] ? nxPo[i][per] / nxN[i][per] : null,
    ifSplit: nextWeek && median && nxN[i][1] ? nxPo[i][1] / nxN[i][1] : null,
    ifLoss: nextWeek && nxN[i][0] ? nxPo[i][0] / nxN[i][0] : null,
  })).sort((a, b) => b.playoff - a.playoff || b.title - a.title)
  return { season: season.year, afterWeek, nextWeek, sims, rosterAware, teams, toiletLast: true }
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

// Snapshots frozen before 'last' meant losing the toilet bowl stored standings-last odds; keep
// everything else as published and fill in toilet-bowl odds from a fresh run.
const frozenOf = (lg: League, year: number, w: number, c: Ctx, split = false): OddsRun | undefined => {
  const f = lg.raw.frozen?.[`${year}|${w}`]
  const needSplit = split && !!f?.nextWeek && c.median && f.teams.every((t) => t.ifSplit === undefined)
  if (!f || (f.toiletLast && !needSplit)) return f
  // Older snapshots: next-week odds were head-to-head only (no 2–0 / 1–1 / 0–2), and 'last' meant standings-last.
  const fresh = Object.fromEntries(simulate(c, w, 10000, year * 100 + w, optsAt(lg, year, w)).teams.map((t) => [t.memberId, t]))
  return {
    ...f, toiletLast: true,
    teams: f.teams.map((t) => {
      const x = fresh[t.memberId]
      return { ...t, last: f.toiletLast ? t.last : x?.last ?? t.last, ...(needSplit && x ? { ifWin: x.ifWin, ifSplit: x.ifSplit, ifLoss: x.ifLoss } : {}) }
    }),
  }
}

/** Odds as of the latest scored regular-season week (or a chosen week). A week whose odds were
 *  frozen when published (right before the next week's first kickoff) returns that snapshot,
 *  so rewinding shows what was shown live; pass live to re-simulate with today's data. */
export function playoffOdds(lg: League, year: number, afterWeek?: number, sims = 10000, live = false): OddsRun | null {
  return memo(lg, `odds|${year}|${afterWeek}|${sims}|${live}`, () => {
    const c = context(lg, year)
    if (!c) return null
    const w = Math.min(afterWeek ?? weeksScored(c), weeksScored(c))
    if (!live) { const f = frozenOf(lg, year, w, c, true); if (f) return f }
    return simulate(c, w, sims, year * 100 + w, optsAt(lg, year, w))
  })
}

/** Odds re-run after every week of the season so far — the odds over time (frozen weeks as published). */
export function oddsHistory(lg: League, year: number, sims = 1500): OddsRun[] {
  return memo(lg, `hist|${year}|${sims}`, () => {
    const c = context(lg, year)
    if (!c) return []
    return Array.from({ length: weeksScored(c) + 1 }, (_, w) => frozenOf(lg, year, w, c) ?? simulate(c, w, sims, year * 1000 + w, optsAt(lg, year, w)))
  })
}

/** Freeze the current week's odds unless the next week has kicked off (any points scored), so
 *  the last sync before Thursday night's game is what sticks. Returns the frozen week or null. */
export function freezeOdds(lg: League, year: number): number | null {
  const raw = lg.raw.seasons.find((s) => Number(s.league.season) === year)
  const c = context(lg, year)
  if (!raw || !c || raw.league.status === 'complete') return null
  const w = weeksScored(c)
  const next = raw.matchups[w] ?? [] // week w+1
  if (next.some((m) => Object.values(m.players_points ?? {}).some((p) => p !== 0))) return null
  const run = playoffOdds(lg, year, w, 10000, true)
  if (!run) return null
  lg.raw.frozen = { ...lg.raw.frozen, [`${year}|${w}`]: { ...run, frozenAt: lg.raw.syncedAt } }
  return w
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

export interface GameSwing { week: number; a: string; b: string; ifA: number; ifB: number }
/** One outcome (playoffs, bye, 1 seed) measured against the record over the remaining games. */
export interface Threshold {
  all: boolean // happened in every simulation
  never: boolean // happened in none
  clinchAt: number | null // lowest remaining-win total at which it happened in every simulation (and every better total)
  outAt: number | null // highest remaining-win total at which it never happened (and every worse total)
  // Lower record that also works whenever they win the points-for tiebreak against these teams.
  tiebreak: { at: number; rivals: string[] } | null
}
export interface TeamScenario {
  memberId: string
  playoff: number
  bye: number
  top: number // 1 seed
  weeks: number // regular-season weeks left
  games: number // games left, counting the median game
  playoffT: Threshold
  byeT: Threshold
  topT: Threshold
  winOut: number | null
  loseOut: number | null
  byWins: { wins: number; odds: number; share: number }[] // playoff odds by wins over the remaining games
  next: { week: number; both: number | null; split: number | null; none: number | null; median: boolean } | null
  ownGames: GameSwing[] // their own head-to-head games: odds if they win (ifA) / lose (ifB), a = them
  rootFor: GameSwing[] // other games that move their odds most, a = the side to root for
}
export interface WeekLine { memberId: string; kind: 'clinch' | 'out'; what: string; text: string }
export interface ScenarioRun { season: number; afterWeek: number; sims: number; byes: boolean; median: boolean; teams: TeamScenario[]; nextWeek: number | null; weekLines: WeekLine[] }

/** Playoff scenarios for the rest of the regular season, from one recorded simulation run. */
export function scenarios(lg: League, year: number, sims = 10000): ScenarioRun | null {
  return memo(lg, `scen|${year}|${sims}`, () => {
    const c = context(lg, year)
    if (!c) return null
    const w = weeksScored(c)
    const rec: SimRecord = { games: [], winners: new Uint8Array(), made: new Uint8Array(), bye: new Uint8Array(), seed: new Uint8Array(), remW: new Uint8Array(), nextW: new Uint8Array(), finalW: new Uint8Array() }
    simulate(c, w, sims, year * 100 + w, { ...optsAt(lg, year, w), record: rec })
    const n = c.ids.length, G = rec.games.length
    const weeks = Math.max(0, c.lastReg - w), per = c.median ? 2 : 1, games = weeks * per
    const nextWeek = weeks ? w + 1 : null
    const rate = (a: number, b: number) => (b ? a / b : 0)
    const base0 = Array.from({ length: n }, (_, i) => rec.finalW[i] - rec.remW[i])
    const allPairs = rec.games.map((g) => [g.a, g.b] as [number, number])
    const Ks = [...new Set([1, ...(c.season.playoffTeams === 6 ? [2] : []), c.season.playoffTeams])]
    const half = c.median ? Math.floor(n / 2) : 0
    const exact = { strict: exactByRecord(base0, allPairs, c.median ? weeks : 0, half, Ks, true), fav: exactByRecord(base0, allPairs, c.median ? weeks : 0, half, Ks, false) }
    const teams: TeamScenario[] = c.ids.map((id, i) => {
      const N = new Float64Array(games + 1), Po = new Float64Array(games + 1), By = new Float64Array(games + 1), Tp = new Float64Array(games + 1)
      const nx = [0, 0, 0], nxPo = [0, 0, 0]
      const perGame = rec.games.map(() => [0, 0, 0, 0]) // [a won, playoffs | a won, b won, playoffs | b won]
      let po = 0, by = 0, tp = 0
      for (let s = 0; s < sims; s++) {
        const k = Math.min(games, rec.remW[s * n + i]), made = rec.made[s * n + i], bye = rec.bye[s * n + i], top = rec.seed[s * n + i] === 0 ? 1 : 0
        N[k]++; Po[k] += made; By[k] += bye; Tp[k] += top
        po += made; by += bye; tp += top
        const nw = Math.min(2, rec.nextW[s * n + i]); nx[nw]++; nxPo[nw] += made
        for (let gi = 0; gi < G; gi++) { const o = rec.winners[s * G + gi] * 2; perGame[gi][o]++; perGame[gi][o + 1] += made }
      }
      // Misses at each record for a cutoff (top K seeds): were they all lost on the points-for
      // tiebreak, and to whom (teams level on wins that finished inside the cutoff)?
      const tieInfo = (K: number) => {
        const hard = new Uint8Array(games + 1)
        const rivals: Set<number>[] = Array.from({ length: games + 1 }, () => new Set())
        const bySeed = new Int32Array(n)
        for (let s = 0; s < sims; s++) {
          const seed = rec.seed[s * n + i]
          if (seed < K) continue
          const k = Math.min(games, rec.remW[s * n + i])
          if (hard[k]) continue
          for (let j = 0; j < n; j++) bySeed[rec.seed[s * n + j]] = j
          const mine = rec.finalW[s * n + i]
          if (rec.finalW[s * n + bySeed[K - 1]] !== mine) { hard[k] = 1; continue }
          for (let q = 0; q < K; q++) if (rec.finalW[s * n + bySeed[q]] === mine) rivals[k].add(bySeed[q])
        }
        return { hard, rivals }
      }
      const thr = (hit: Float64Array, total: number, K: number): Threshold => {
        let clinchAt: number | null = null, outAt: number | null = null
        for (let k = games; k >= 0; k--) { if (!N[k]) continue; if (hit[k] === N[k]) clinchAt = k; else break }
        for (let k = 0; k <= games; k++) { if (!N[k]) continue; if (hit[k] === 0) outAt = k; else break }
        let tiebreak: Threshold['tiebreak'] = null
        if (total > 0 && total < sims && K > 0) {
          const { hard, rivals } = tieInfo(K)
          let at: number | null = null
          const who = new Set<number>()
          for (let k = games; k >= 0; k--) {
            if (!N[k]) continue
            if (hit[k] === N[k] || !hard[k]) { at = k; rivals[k].forEach((x) => who.add(x)) } else break
          }
          who.delete(i)
          if (at != null && (clinchAt == null || at < clinchAt) && who.size && who.size <= 3) tiebreak = { at, rivals: [...who].map((x) => c.ids[x]) }
        }
        // Exact override: clinch / elimination by record from every remaining result.
        const ex = exact.strict, fav = exact.fav
        if (K > 0 && ex.lock[K]) {
          const L = ex.lock[K][i], S = ex.shut[K][i], F = fav.lock[K][i], seenK = ex.seen[i]
          let cA: number | null = null, oA: number | null = null, fA: number | null = null
          for (let k = ex.maxK; k >= 0; k--) { if (!seenK[k]) continue; if (L[k]) cA = k; else break }
          for (let k = ex.maxK; k >= 0; k--) { if (!seenK[k]) continue; if (F[k]) fA = k; else break }
          for (let k = 0; k <= ex.maxK; k++) { if (!seenK[k]) continue; if (S[k]) oA = k; else break }
          const reach = seenK.map((v, k) => (v ? k : -1)).filter((k) => k >= 0)
          const all = reach.every((k) => L[k]), never = reach.every((k) => S[k])
          const tb = fA != null && (cA == null || fA < cA) ? { at: fA, rivals: tiebreak?.rivals ?? [] } : null
          return { all, never, clinchAt: all ? 0 : cA, outAt: never ? null : oA, tiebreak: tb }
        }
        return { all: total === sims, never: total === 0, clinchAt, outAt, tiebreak }
      }
      const swing = (gi: number, flip: boolean): GameSwing => {
        const g = rec.games[gi], [na, pa, nb, pb] = perGame[gi]
        const A = { id: c.ids[g.a], o: rate(pa, na) }, B = { id: c.ids[g.b], o: rate(pb, nb) }
        const [x, y] = flip ? [B, A] : [A, B]
        return { week: g.week, a: x.id, b: y.id, ifA: x.o, ifB: y.o }
      }
      const mine = rec.games.map((g, k) => ({ g, k })).filter(({ g }) => g.a === i || g.b === i)
      const rootFor = rec.games.map((g, gi) => ({ g, gi })).filter(({ g }) => g.a !== i && g.b !== i)
        .map(({ gi }) => { const sw = swing(gi, false); return sw.ifB > sw.ifA ? swing(gi, true) : sw })
        .filter((sw) => sw.ifA - sw.ifB >= 0.01)
        .sort((p, q) => (q.ifA - q.ifB) - (p.ifA - p.ifB)).slice(0, 5)
      return {
        memberId: id, playoff: po / sims, bye: by / sims, top: tp / sims, weeks, games,
        playoffT: thr(Po, po, c.season.playoffTeams), byeT: thr(By, by, c.season.playoffTeams === 6 ? 2 : 0), topT: thr(Tp, tp, 1),
        winOut: games && N[games] ? Po[games] / N[games] : null, loseOut: games && N[0] ? Po[0] / N[0] : null,
        byWins: Array.from({ length: games + 1 }, (_, k) => ({ wins: k, odds: rate(Po[k], N[k]), share: N[k] / sims })),
        next: nextWeek ? { week: nextWeek, median: c.median, both: nx[per] ? nxPo[per] / nx[per] : null, split: c.median && nx[1] ? nxPo[1] / nx[1] : null, none: nx[0] ? nxPo[0] / nx[0] : null } : null,
        ownGames: mine.map(({ g, k }) => swing(k, g.b === i)), rootFor,
      }
    }).sort((a, b) => b.playoff - a.playoff || b.bye - a.bye)
    return { season: year, afterWeek: w, sims, byes: c.season.playoffTeams === 6, median: c.median, teams, nextWeek, weekLines: nextWeek ? weekLines(lg, c, rec, sims, weeks, per) : [] }
  })
}

/** Exact clinch / elimination by final record for every team, from the current standings:
 *  for each result of the remaining head-to-head games and each record a team can still
 *  reach, the median wins (half the league each week) go to rivals as harmfully as possible
 *  (clinch) or as kindly as possible (elimination). With tiesLose, a tie on wins counts
 *  against the team; otherwise in its favor (it wins the points-for tiebreak). */
function exactByRecord(W0: ArrayLike<number>, pairs: [number, number][], mw: number, perWeek: number, Ks: number[], tiesLose: boolean) {
  const n = W0.length, m = pairs.length, maxK = m ? Math.max(...Array.from({ length: n }, (_, i) => pairs.filter((p) => p[0] === i || p[1] === i).length)) + mw : mw
  const mk = (v: boolean) => Array.from({ length: n }, () => Array<boolean>(maxK + 1).fill(v))
  const lock: Record<number, boolean[][]> = {}, shut: Record<number, boolean[][]> = {}
  for (const K of Ks) { lock[K] = mk(true); shut[K] = mk(true) }
  const seen = mk(false)
  const hw = new Int32Array(n), h = new Int32Array(n)
  const short: number[] = [], gain: number[] = []
  for (let mask = 0; mask < 1 << m; mask++) {
    for (let j = 0; j < n; j++) { hw[j] = W0[j]; h[j] = 0 }
    for (let g = 0; g < m; g++) { const w = (mask >> g) & 1 ? pairs[g][1] : pairs[g][0]; hw[w]++; h[w]++ }
    for (let i = 0; i < n; i++) for (let mi = 0; mi <= mw; mi++) {
      const k = h[i] + mi, mine = hw[i] + mi
      seen[i][k] = true
      const budget0 = perWeek * mw - mi // median wins left for rivals
      // Clinch test: how many rivals can reach (or pass) this team?
      let level = 0
      short.length = 0
      for (let j = 0; j < n; j++) if (j !== i) {
        const d = (tiesLose ? mine : mine + 1) - hw[j]
        if (d <= 0) level++; else if (d <= mw) short.push(d)
      }
      short.sort((x, y) => x - y)
      let budget = budget0
      for (const d of short) { if (d > budget) break; budget -= d; level++ }
      // Elimination test: how many rivals must finish ahead, placing median wins kindly?
      let ahead = 0, room = 0
      gain.length = 0
      for (let j = 0; j < n; j++) if (j !== i) {
        const cap = tiesLose ? mine - hw[j] : mine - 1 - hw[j] // wins j can add and still not pass
        if (cap < 0) { ahead++; room += mw; continue }
        const safe = Math.min(mw, cap); room += safe; gain.push(mw - safe)
      }
      let need = budget0 - room
      gain.sort((x, y) => y - x)
      for (const g of gain) { if (need <= 0) break; need -= g; ahead++ }
      for (const K of Ks) { if (level >= K) lock[K][i][k] = false; if (ahead < K) shut[K][i][k] = false }
    }
  }
  return { lock, shut, seen, maxK }
}

/** Exact lock check from a standings state: goes through every result of the remaining
 *  head-to-head games, with the median wins (half the league each week) handed out as
 *  harmfully (for clinches) or as kindly (for eliminations) as possible. Ties on wins count
 *  against the team, since points for could go either way. */
function lockState(W0: ArrayLike<number>, pairs: [number, number][], mw: number, perWeek: number, Ks: number[]) {
  const n = W0.length, m = pairs.length
  const lock: Record<number, boolean[]> = {}, shut: Record<number, boolean[]> = {}
  for (const K of Ks) { lock[K] = Array(n).fill(true); shut[K] = Array(n).fill(true) }
  const hw = new Int32Array(n)
  const others = perWeek - 1 // median wins left for everyone else each week once i takes or skips one
  for (let mask = 0; mask < 1 << m; mask++) {
    for (let j = 0; j < n; j++) hw[j] = W0[j]
    for (let g = 0; g < m; g++) hw[(mask >> g) & 1 ? pairs[g][1] : pairs[g][0]]++
    for (let i = 0; i < n; i++) {
      // Worst case for i: no median wins; perWeek a week go to rivals just short of i.
      let level = 0
      const short: number[] = []
      for (let j = 0; j < n; j++) if (j !== i) { const d = hw[i] - hw[j]; if (d <= 0) level++; else if (d <= mw) short.push(d) }
      short.sort((x, y) => x - y)
      let budget = perWeek * mw
      for (const d of short) { if (d > budget) break; budget -= d; level++ }
      // Best case for i: every median win; the rest go where they push nobody past i.
      const top = hw[i] + mw
      let ahead = 0, room = 0
      const gain: number[] = []
      for (let j = 0; j < n; j++) if (j !== i) {
        if (hw[j] > top) { ahead++; room += mw; continue }
        const safe = Math.min(mw, top - hw[j]); room += safe; gain.push(mw - safe)
      }
      let need = others * mw - room
      gain.sort((x, y) => y - x)
      for (const g of gain) { if (need <= 0) break; need -= g; ahead++ }
      for (const K of Ks) { if (level >= K) lock[K][i] = false; if (ahead < K) shut[K][i] = false }
    }
  }
  return { lock, shut }
}

/** Clinch and elimination scenarios for next week only: results locked once next week is
 *  played, whatever happens after (exact over the remaining schedule). */
function weekLines(lg: League, c: Ctx, rec: SimRecord, sims: number, weeks: number, per: number): WeekLine[] {
  const n = c.ids.length, G = rec.games.length
  const P = c.season.playoffTeams, byes = P === 6 ? 2 : 0
  const half = c.median ? Math.floor(n / 2) : 0
  const base = Array.from({ length: n }, (_, i) => rec.finalW[i] - rec.remW[i])
  const wk = rec.games[0]?.week
  const nextGames = rec.games.map((g, gi) => ({ g, gi })).filter(({ g }) => g.week === wk)
  const later = rec.games.filter((g) => g.week !== wk).map((g) => [g.a, g.b] as [number, number])
  const all = rec.games.map((g) => [g.a, g.b] as [number, number])
  const Ks = [...new Set([1, ...(byes ? [2, 3] : []), P])]
  const name = (i: number) => lg.memberById[c.ids[i]]?.name ?? c.ids[i]
  const mwAfter = c.median ? weeks - 1 : 0
  const now = lockState(base, all, c.median ? weeks : 0, half, Ks)
  const cache = new Map<string, ReturnType<typeof lockState>>()
  const stateOf = (W: Int32Array) => {
    const key = W.join(',')
    let v = cache.get(key)
    if (!v) { v = lockState(W, later, mwAfter, half, Ks); cache.set(key, v) }
    return v
  }
  type St = ReturnType<typeof lockState>
  type Ev = { what: string; kind: 'clinch' | 'out'; test: (st: St, i: number) => boolean }
  const evs: Ev[] = [
    { what: 'the 1 seed', kind: 'clinch', test: (st, i) => st.lock[1][i] },
    ...(byes ? [{ what: 'a bye', kind: 'clinch' as const, test: (st: St, i: number) => st.lock[2][i] }] : []),
    ...(byes ? [{ what: 'the 3 seed', kind: 'clinch' as const, test: (st: St, i: number) => st.lock[3][i] && st.shut[2][i] }] : []),
    { what: 'a playoff spot', kind: 'clinch', test: (st, i) => st.lock[P][i] },
    { what: 'the playoffs', kind: 'out', test: (st, i) => st.shut[P][i] },
  ]
  // Phrases for this team's own result next week: "full" = enough on its own at this result and
  // every better one; "part" = needs the extra condition that follows.
  const two = per === 2
  const r = (w: number) => `${w}–${per - w}`
  const fullC = (k: number) => k === 0 ? 'no matter what' : k === per ? `by going ${r(k)}` : `by going ${r(k)} or better`
  const partC = (k: number) => k === per ? `by going ${r(k)}` : `at ${r(k)}`
  const fullO = (k: number) => k === per ? 'no matter what' : k === 0 ? `by going ${r(0)}` : `at ${r(k)} or worse`
  const partO = (k: number) => k === 0 ? `by going ${r(0)}` : `at ${r(k)}`
  // Conditions on other teams' results next week, used to spell out "with help".
  type Cond = { text: string; ok: (s: number) => boolean }
  const conds = (i: number): Cond[] => {
    const out: Cond[] = []
    for (let j = 0; j < n; j++) if (j !== i) {
      const nw = (s: number) => rec.nextW[s * n + j]
      out.push({ text: `${name(j)} goes ${r(0)}`, ok: (s) => nw(s) === 0 })
      if (two) out.push({ text: `${name(j)} loses at least once`, ok: (s) => nw(s) <= 1 })
      out.push({ text: `${name(j)} goes ${r(per)}`, ok: (s) => nw(s) === per })
      if (two) out.push({ text: `${name(j)} wins at least once`, ok: (s) => nw(s) >= 1 })
    }
    for (const { g, gi } of nextGames) if (g.a !== i && g.b !== i) {
      out.push({ text: `${name(g.a)} beats ${name(g.b)}`, ok: (s) => rec.winners[s * G + gi] === 0 })
      out.push({ text: `${name(g.b)} beats ${name(g.a)}`, ok: (s) => rec.winners[s * G + gi] === 1 })
    }
    return out
  }
  const join = (xs: string[]) => xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
  /** Scenarios (each a set of other results) that together cover every way it happens: built
   *  greedily, adding the result that most narrows things down until it's certain. */
  const scenariosFor = (i: number, idx: number[], ok: (s: number) => boolean): { list: string[]; rest: boolean } => {
    const cs = conds(i)
    let left = idx.filter(ok) // ways it happens not yet explained
    const found: { conds: Cond[]; set: Set<number> }[] = []
    while (left.length && found.length < 8) {
      let pool = idx, picked: Cond[] = []
      while (!pool.every(ok) && picked.length < 5) {
        let best: { cd: Cond; m: number[]; score: number } | null = null
        for (const cd of cs) {
          if (picked.includes(cd)) continue
          const m = pool.filter(cd.ok)
          const good = m.filter(ok).length, cover = left.filter((s) => m.includes(s)).length
          if (!good || !cover) continue
          const score = good / m.length + cover / (left.length * 50)
          if (!best || score > best.score) best = { cd, m, score }
        }
        if (!best) break
        picked.push(best.cd); pool = best.m
      }
      if (!picked.length || !pool.every(ok)) break
      // Drop conditions that don't narrow anything (implied by the others).
      picked = picked.filter((cd, k) => { const rest = picked.filter((_, q) => q !== k); return !idx.filter((s) => rest.every((x) => x.ok(s))).every(ok) })
      const set = new Set(idx.filter((s) => picked.every((x) => x.ok(s))))
      found.push({ conds: picked, set })
      left = left.filter((s) => !set.has(s))
    }
    // Drop scenarios fully inside another (e.g. "A beats B" inside "B loses at least once").
    const keep = found.filter((x, k) => !found.some((y, q) => q !== k && y.set.size >= x.set.size && [...x.set].every((s) => y.set.has(s)) && (y.set.size > x.set.size || q < k)))
    if (!keep.length) return { list: [], rest: left.length > 0 }
    // Pull out conditions every scenario shares: "if A, and B or C".
    const common = keep[0].conds.filter((cd) => keep.every((x) => x.conds.some((y) => y.text === cd.text)))
    const restOf = keep.map((x) => x.conds.filter((cd) => !common.some((y) => y.text === cd.text)))
    let text: string
    if (keep.length === 1) text = join(keep[0].conds.map((x) => x.text))
    else if (common.length && restOf.every((r) => r.length === 1)) text = `${join(common.map((x) => x.text))}, and ${restOf.map((r) => r[0].text).join(' or ')}`
    else if (common.length && restOf.every((r) => r.length >= 1)) text = `${join(common.map((x) => x.text))}, and either ${restOf.map((r) => join(r.map((x) => x.text))).join('; or ')}`
    else return { list: keep.map((x) => join(x.conds.map((y) => y.text))), rest: left.length > 0 }
    return { list: [text], rest: left.length > 0 }
  }
  const W = new Int32Array(n)
  const states: St[] = []
  for (let s = 0; s < sims; s++) { for (let j = 0; j < n; j++) W[j] = base[j] + rec.nextW[s * n + j]; states.push(stateOf(W)) }
  const lines: WeekLine[] = []
  for (let i = 0; i < n; i++) {
    for (const ev of evs) {
      if (ev.test(now, i)) continue // already locked before next week
      const seen = new Float64Array(per + 1), hit = new Float64Array(per + 1)
      let any = 0
      for (let s = 0; s < sims; s++) {
        const k = Math.min(per, rec.nextW[s * n + i])
        const ok = ev.test(states[s], i)
        seen[k]++; if (ok) { hit[k]++; any++ }
      }
      if (!any) continue
      const order = ev.kind === 'clinch' ? Array.from({ length: per + 1 }, (_, k) => per - k) : Array.from({ length: per + 1 }, (_, k) => k)
      let full: string | null = null, extra: string | null = null
      for (const k of order) {
        if (!seen[k]) continue
        if (hit[k] === seen[k]) { full = ev.kind === 'clinch' ? fullC(k) : fullO(k); continue }
        if (hit[k] > 0) {
          const say = ev.kind === 'clinch' ? partC(k) : partO(k)
          const idx: number[] = []
          for (let s = 0; s < sims; s++) if (Math.min(per, rec.nextW[s * n + i]) === k) idx.push(s)
          const sc = scenariosFor(i, idx, (s) => ev.test(states[s], i))
          extra = sc.list.length ? `${say} if ${sc.list.join('; or if ')}${sc.rest ? '; or in a few other rare combinations' : ''}` : `${say} only in rare combinations of other results`
        }
        break
      }
      const parts = [full, extra].filter((x): x is string => !!x)
      if (!parts.length) continue
      const how = parts.join(', or ')
      if (lines.some((l) => l.memberId === c.ids[i] && l.kind === ev.kind && l.text.endsWith(` ${how}`))) continue // same path as a bigger prize
      lines.push({ memberId: c.ids[i], kind: ev.kind, what: ev.what, text: `${ev.kind === 'clinch' ? `clinches ${ev.what}` : 'is eliminated from the playoffs'} ${how}` })
    }
  }
  return lines
}
