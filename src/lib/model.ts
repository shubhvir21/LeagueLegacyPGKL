// Odds-model parameters fitted from this league's own history (run by scripts/sync.ts):
// how far real points land from Sleeper projections at each position, how much teammates on
// the same NFL team move together, leftover team-level noise, and — via a backtest of past
// seasons — how much to trust roster projections vs. actual scoring.
import type { League } from './stats'

export interface PosModel { bias: number; sd0: number; sd1: number } // actual ≈ bias·proj, sd = sd0 + sd1·proj
export interface Variant { name: string; weight: number | null; brier: number; logLoss: number; n: number }
export interface OddsModel {
  fittedAt: string
  rosterWeight: number
  pos: Record<string, PosModel>
  rho: number // correlation between same-NFL-team skill players
  resid: number // team-level sd not explained by player variance
  samples: number // player-weeks used in the fit
  backtest: {
    seasons: number[]
    baseline: number // Brier of always predicting the league-wide playoff rate
    variants: Variant[]
    calibration: { lo: number; hi: number; predicted: number; actual: number; n: number }[]
    byWeek: { week: number; scoring: number; model: number }[]
  } | null
}

export const DEFAULT_MODEL: OddsModel = {
  fittedAt: '', rosterWeight: 0.7, rho: 0.15, resid: 8, samples: 0, backtest: null,
  pos: {
    QB: { bias: 1, sd0: 4, sd1: 0.3 }, RB: { bias: 1, sd0: 3, sd1: 0.45 }, WR: { bias: 1, sd0: 3, sd1: 0.5 },
    TE: { bias: 1, sd0: 2.5, sd1: 0.5 }, K: { bias: 1, sd0: 3, sd1: 0.2 }, DEF: { bias: 1, sd0: 4, sd1: 0.3 },
  },
}
export const SKILL = new Set(['QB', 'RB', 'WR', 'TE'])
export const posSd = (m: OddsModel, pos: string, proj: number) => {
  const p = m.pos[pos] ?? DEFAULT_MODEL.pos.WR
  return Math.max(1, p.sd0 + p.sd1 * proj)
}

/** Fit per-position bias and spread, same-team correlation, from every played week with projections. */
export function fitPlayers(lg: League): Pick<OddsModel, 'pos' | 'rho' | 'samples'> {
  const info = lg.raw.players
  const rows: { pos: string; p: number; a: number; nfl: string; key: string }[] = []
  for (const s of lg.raw.seasons) {
    const pr = s.projections
    if (!pr) continue
    for (let w = 1; w <= s.lastScored; w++) {
      const proj = pr.weeks[w]
      if (!proj) continue
      const seen = new Set<string>()
      for (const m of s.matchups[w - 1] ?? []) for (const [pid, a] of Object.entries(m.players_points ?? {})) {
        const p = proj[pid], pos = info[pid]?.[1]
        if (!p || p <= 0 || !pos || seen.has(pid)) continue
        seen.add(pid)
        rows.push({ pos, p, a, nfl: pr.nfl?.[pid] ?? '', key: `${s.league.season}|${w}` })
      }
    }
  }
  const pos: Record<string, PosModel> = {}
  for (const P of Object.keys(DEFAULT_MODEL.pos)) {
    const xs = rows.filter((r) => r.pos === P)
    if (xs.length < 60) { pos[P] = DEFAULT_MODEL.pos[P]; continue }
    const bias = xs.reduce((a, r) => a + r.a, 0) / xs.reduce((a, r) => a + r.p, 0)
    // Spread grows with projection: bin by projection, then a weighted line through bin sds.
    const sorted = [...xs].sort((a, b) => a.p - b.p)
    const bins = 8, size = Math.ceil(sorted.length / bins)
    const pts: { x: number; y: number; n: number }[] = []
    for (let b = 0; b < bins; b++) {
      const chunk = sorted.slice(b * size, (b + 1) * size)
      if (chunk.length < 10) continue
      const x = chunk.reduce((a, r) => a + r.p, 0) / chunk.length
      const y = Math.sqrt(chunk.reduce((a, r) => a + (r.a - bias * r.p) ** 2, 0) / chunk.length)
      pts.push({ x, y, n: chunk.length })
    }
    const N = pts.reduce((a, q) => a + q.n, 0)
    const mx = pts.reduce((a, q) => a + q.x * q.n, 0) / N, my = pts.reduce((a, q) => a + q.y * q.n, 0) / N
    const sxx = pts.reduce((a, q) => a + q.n * (q.x - mx) ** 2, 0), sxy = pts.reduce((a, q) => a + q.n * (q.x - mx) * (q.y - my), 0)
    const sd1 = sxx ? Math.max(0, sxy / sxx) : 0
    pos[P] = { bias: +bias.toFixed(3), sd0: +Math.max(1, my - sd1 * mx).toFixed(2), sd1: +sd1.toFixed(3) }
  }
  // Same-NFL-team correlation of standardized residuals (skill positions).
  const groups: Record<string, number[]> = {}
  for (const r of rows) {
    if (!SKILL.has(r.pos) || !r.nfl) continue
    const pm = pos[r.pos]
    ;(groups[`${r.key}|${r.nfl}`] ??= []).push((r.a - pm.bias * r.p) / Math.max(1, pm.sd0 + pm.sd1 * r.p))
  }
  let cross = 0, pairs = 0, sq = 0, cnt = 0
  for (const z of Object.values(groups)) {
    for (let i = 0; i < z.length; i++) { sq += z[i] ** 2; cnt++; for (let j = i + 1; j < z.length; j++) { cross += z[i] * z[j]; pairs++ } }
  }
  const rho = pairs && cnt ? Math.max(0, Math.min(0.5, cross / pairs / (sq / cnt))) : DEFAULT_MODEL.rho
  return { pos, rho: +rho.toFixed(3), samples: rows.length }
}
