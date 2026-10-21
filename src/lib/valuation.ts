// Franchise Valuation — a Forbes-style "what is this team worth" model.
//
// Like real sports valuations, value = trailing revenue × a market multiple.
// Only completed seasons count, and the valuation is recomputed after each one so
// every franchise has a value history and a year-over-year change.
//
// REVENUE (per completed season, $M)
//   Media rights         $180M flat — every franchise gets the same TV deal
//   Gate & local         $3.5M per win (incl. median wins)
//   Playoff gate         $15M for qualifying + $12M per playoff win
//   Prize & sponsorship  $60M title, $25M runner-up, $10M third
//   Star power           (PPG − league avg) × $2.2M, plus 4% of roster value over replacement
//   Payroll (cost)       FAAB spent as % of budget × $20M (subtracted → operating income)
//   Trailing revenue = recency-weighted average of seasons (5 / 3 / 2 / 1 …)
//
// MULTIPLE (×, clamped 4–14) — starts at 7.0
//   Trophy case    +1.2 per title, +0.4 per runner-up
//   Pedigree       +2.0 × (playoff rate − 50%)
//   Momentum       +0.06 per point of Franchise Form above 50
//   Front office   +0.04 per point of avg Manager Score above 50
//   Stigma         −0.5 per last place, −0.3 per toilet-bowl loss
//
// VALUE = trailing revenue × multiple, smoothed: 65% this year's model + 35% last year's
// value grown 5% (franchise values don't halve overnight). Debt/value is a joke stat.
import { teamRankings } from './teamRank'
import { managementCached } from './management'
import type { League } from './stats'

export interface RevenueLine { label: string; amount: number }
export interface Valuation {
  memberId: string
  year: number // value as of the end of this season
  value: number // $M
  revenue: number // trailing revenue, $M
  operatingIncome: number // $M
  multiple: number
  change: number | null // year-over-year %, null for first valued season
  revenueLines: RevenueLine[] // latest season breakdown
  multipleLines: RevenueLine[]
  debtPct: number
  titles: number
  playoffRate: number
  rating: number
}

const RECENCY = [5, 3, 2]

export function valuations(lg: League): Record<string, Valuation[]> {
  const ranks = teamRankings(lg)
  const done = [...lg.seasons].filter((s) => s.complete).sort((a, b) => a.year - b.year)
  const rawRoster = (year: number, rosterId: number) =>
    lg.raw.seasons.find((s) => Number(s.league.season) === year)?.rosters.find((r) => r.roster_id === rosterId)
  const budget = (year: number) => Number(lg.raw.seasons.find((s) => Number(s.league.season) === year)?.league.settings.waiver_budget ?? 100) || 100

  // Per-season revenue lines
  const season: Record<string, Record<number, { lines: RevenueLine[]; total: number; payroll: number }>> = {}
  for (const s of done) {
    const leaguePpg = s.teamSeasons.reduce((a, t) => a + t.pf / (t.games || 1), 0) / s.teamSeasons.length
    for (const t of s.teamSeasons) {
      const poWins = lg.games.filter((g) => g.season === s.year && g.bracket === 'winners' && g.place !== 5 &&
        ((g.a === t.memberId && g.aPts > g.bPts) || (g.b === t.memberId && g.bPts > g.aPts))).length
      const rank = ranks.find((r) => r.t.season === s.year && r.t.memberId === t.memberId)
      const star = ((t.pf / (t.games || 1)) - leaguePpg) * 2.2 + 0.04 * Math.max(0, rank?.rosterValue ?? 0)
      const prize = t.finalRank === 1 ? 60 : t.finalRank === 2 ? 25 : t.finalRank === 3 ? 10 : 0
      const lines: RevenueLine[] = [
        { label: 'Media rights', amount: 180 },
        { label: 'Gate & local', amount: 3.5 * t.wins },
        { label: 'Playoff gate', amount: t.madePlayoffs ? 15 + 12 * poWins : 0 },
        { label: 'Prize & sponsorship', amount: prize },
        { label: 'Star power', amount: star },
      ]
      const used = rawRoster(s.year, t.rosterId)?.settings.waiver_budget_used ?? 0
      ;(season[t.memberId] ??= {})[s.year] = {
        lines,
        total: lines.reduce((a, l) => a + l.amount, 0),
        payroll: (used / budget(s.year)) * 20,
      }
    }
  }

  const out: Record<string, Valuation[]> = {}
  for (const m of lg.members) {
    const hist: Valuation[] = []
    for (const s of done) {
      const years = Object.keys(season[m.id] ?? {}).map(Number).filter((y) => y <= s.year).sort((a, b) => b - a)
      if (!years.includes(s.year) && !years.length) continue
      if (!years.length) continue
      let num = 0, den = 0, pay = 0
      years.forEach((y, i) => { const w = RECENCY[i] ?? 1; num += w * season[m.id][y].total; pay += w * season[m.id][y].payroll; den += w })
      const revenue = num / den
      const payroll = pay / den

      const mine = done.filter((x) => x.year <= s.year).map((x) => ({ s: x, t: x.teamSeasons.find((t) => t.memberId === m.id) })).filter((x) => x.t)
      const titles = mine.filter((x) => x.t!.finalRank === 1).length
      const seconds = mine.filter((x) => x.t!.finalRank === 2).length
      const playoffRate = mine.filter((x) => x.t!.madePlayoffs).length / (mine.length || 1)
      const lasts = mine.filter((x) => x.t!.finalRank === x.s.teams).length
      const toilets = mine.filter((x) => x.s.toiletBowlLoser === m.id).length
      const rating = lg.formHistory.find((h) => h.season === s.year)?.ratings[m.id] ?? 50
      const mgr = managementCached(lg).filter((r) => r.memberId === m.id && !r.inProgress && r.season <= s.year)
      const mgrScore = mgr.length ? mgr.reduce((a, r) => a + r.managerScore, 0) / mgr.length : 50

      const multipleLines: RevenueLine[] = [
        { label: 'League base', amount: 7 },
        { label: 'Trophy case', amount: 1.2 * titles + 0.4 * seconds },
        { label: 'Playoff pedigree', amount: 2 * (playoffRate - 0.5) },
        { label: 'Momentum', amount: 0.06 * (rating - 50) },
        { label: 'Front office', amount: 0.04 * (mgrScore - 50) },
        { label: 'Stigma', amount: -0.5 * lasts - 0.3 * toilets },
      ]
      const multiple = Math.max(4, Math.min(14, multipleLines.reduce((a, l) => a + l.amount, 0)))
      const prev = hist.at(-1)
      // Valuations are sticky: blend this year's model with last year's value grown 5%.
      const value = prev ? 0.65 * revenue * multiple + 0.35 * prev.value * 1.05 : revenue * multiple
      hist.push({
        memberId: m.id, year: s.year, value, revenue, multiple,
        operatingIncome: revenue - 150 - payroll,
        change: prev ? ((value - prev.value) / prev.value) * 100 : null,
        revenueLines: season[m.id][years[0]].lines,
        multipleLines,
        debtPct: Math.min(40, 4 + 6 * lasts + 4 * toilets + 3 * mine.filter((x) => !x.t!.madePlayoffs).length),
        titles, playoffRate, rating,
      })
    }
    if (hist.length) out[m.id] = hist
  }
  return out
}

export const money = (m: number) => (m >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${Math.round(m)}M`)

const cache = new WeakMap<League, Record<string, Valuation[]>>()
export function valuationsOf(lg: League) {
  let v = cache.get(lg)
  if (!v) { v = valuations(lg); cache.set(lg, v) }
  return v
}
/** Latest valuation per member, ranked high to low. */
export function valuationTable(lg: League) {
  return Object.values(valuationsOf(lg)).map((h) => h.at(-1)!).sort((a, b) => b.value - a.value)
}
