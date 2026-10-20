// Week-by-week views of a season: power rankings and schedule swaps.
import type { League } from './stats'
import { rosterPlan } from './odds'
import { DEFAULT_MODEL } from './model'

// ---- Power rankings ----
//
// After each week every team gets a 0–100 power score:
//   All-play   35%  share of the league you'd have beaten each week (60% season, 40% last 3 weeks)
//   Points     25%  points per game, as a percentile within the league
//   Record     20%  win % including median games
//   Roster     20%  best-lineup projection for next week (when projections exist)
// Without projections the roster share is spread over the others.
export const POWER_WEIGHTS = { allPlay: 0.35, points: 0.25, record: 0.2, roster: 0.2 }

export interface PowerRow {
  memberId: string
  rank: number
  prev: number | null // last week's rank
  score: number
  wins: number
  losses: number
  ppg: number
  allPlay: number // season all-play %
  recent: number // last-3-week avg points
  roster: number | null // next-week roster projection
  weekPts: number
  weekRank: number // this week's score rank
}
export interface PowerWeek { week: number; rows: PowerRow[] }

const pctRank = (xs: number[]) => xs.map((x) => (xs.length > 1 ? xs.filter((y) => y < x).length / (xs.length - 1) : 0.5))

/** Every team's regular-season score by week, plus the head-to-head pairings. */
function seasonGrid(lg: League, year: number) {
  const s = lg.seasons.find((x) => x.year === year)
  if (!s) return null
  const ids = s.teamSeasons.map((t) => t.memberId)
  const pts: Record<string, Record<number, number>> = Object.fromEntries(ids.map((id) => [id, {}]))
  const opp: Record<string, Record<number, string>> = Object.fromEntries(ids.map((id) => [id, {}]))
  for (const g of lg.games) {
    if (g.season !== year || g.playoff) continue
    pts[g.a][g.week] = g.aPts; pts[g.b][g.week] = g.bPts
    opp[g.a][g.week] = g.b; opp[g.b][g.week] = g.a
  }
  const weeks = [...new Set(lg.games.filter((g) => g.season === year && !g.playoff).map((g) => g.week))].sort((a, b) => a - b)
  const raw = lg.raw.seasons.find((r) => Number(r.league.season) === year)
  const median = Number(raw?.league.settings.league_average_match ?? 0) === 1
  return { s, ids, pts, opp, weeks, median }
}

export function powerRankings(lg: League, year: number): PowerWeek[] {
  const g = seasonGrid(lg, year)
  if (!g) return []
  const { ids, pts, opp, weeks, median } = g
  const model = lg.raw.model ?? DEFAULT_MODEL
  const out: PowerWeek[] = []
  const W: Record<string, number> = {}, L: Record<string, number> = {}, apW: Record<string, number> = {}, apN: Record<string, number> = {}
  const apWeek: Record<string, number[]> = {}
  let prev: Record<string, number> | null = null
  for (const w of weeks) {
    const wk = ids.map((id) => pts[id][w] ?? 0)
    const sorted = [...wk].sort((a, b) => b - a)
    const line = (sorted[Math.floor(ids.length / 2) - 1] + sorted[Math.floor(ids.length / 2)]) / 2
    ids.forEach((id, i) => {
      const me = wk[i]
      const beat = wk.filter((x, j) => j !== i && me > x).length
      apW[id] = (apW[id] ?? 0) + beat
      apN[id] = (apN[id] ?? 0) + ids.length - 1
      ;(apWeek[id] ??= []).push(beat / (ids.length - 1))
      const o = opp[id][w]
      if (o != null) { if (me > (pts[o][w] ?? 0)) W[id] = (W[id] ?? 0) + 1; else if (me < (pts[o][w] ?? 0)) L[id] = (L[id] ?? 0) + 1 }
      if (median) { if (me > line) W[id] = (W[id] ?? 0) + 1; else L[id] = (L[id] ?? 0) + 1 }
    })
    const plan = rosterPlan(lg, year, w, model)
    const rosterOf = (id: string) => plan?.[id]?.[w + 1]?.R ?? null
    const has = ids.every((id) => rosterOf(id) != null)
    const sofar = weeks.filter((x) => x <= w), last3 = sofar.slice(-3)
    const ppg = ids.map((id) => sofar.reduce((a, x) => a + (pts[id][x] ?? 0), 0) / sofar.length)
    const ap = ids.map((id) => apW[id] / apN[id])
    const rec3 = ids.map((id) => { const xs = apWeek[id].slice(-3); return xs.reduce((a, b) => a + b, 0) / xs.length })
    const winPct = ids.map((id) => (W[id] ?? 0) / ((W[id] ?? 0) + (L[id] ?? 0) || 1))
    const ppgP = pctRank(ppg)
    const rosterP = has ? pctRank(ids.map((id) => rosterOf(id)!)) : null
    const wt = has ? POWER_WEIGHTS : { allPlay: 0.35 / 0.8, points: 0.25 / 0.8, record: 0.2 / 0.8, roster: 0 }
    const weekRank = pctRank(wk)
    const rows: PowerRow[] = ids.map((id, i) => ({
      memberId: id, rank: 0, prev: prev?.[id] ?? null,
      score: 100 * (wt.allPlay * (0.6 * ap[i] + 0.4 * rec3[i]) + wt.points * ppgP[i] + wt.record * winPct[i] + wt.roster * (rosterP?.[i] ?? 0)),
      wins: W[id] ?? 0, losses: L[id] ?? 0, ppg: ppg[i], allPlay: ap[i],
      recent: last3.reduce((a, x) => a + (pts[id][x] ?? 0), 0) / last3.length,
      roster: rosterOf(id), weekPts: wk[i], weekRank: ids.length - Math.round(weekRank[i] * (ids.length - 1)),
    }))
    rows.sort((a, b) => b.score - a.score).forEach((r, k) => (r.rank = k + 1))
    prev = Object.fromEntries(rows.map((r) => [r.memberId, r.rank]))
    out.push({ week: w, rows })
  }
  return out
}

// ---- Schedule luck ----
//
// What would your head-to-head record be with someone else's schedule? Your score each week vs.
// the opponent they faced (if that opponent was you, you face them instead). Median games are
// left out — they don't depend on the schedule.
export interface LuckRow {
  memberId: string
  actual: number // h2h wins
  games: number
  expected: number // all-play expected wins
  avgSwap: number // average wins across every schedule
  best: { id: string; wins: number }
  worst: { id: string; wins: number }
  luck: number // actual − expected
  rankAmong: number // how many schedules would give you fewer wins than your own
}
export interface ScheduleLuck { ids: string[]; matrix: Record<string, Record<string, number>>; games: number; rows: LuckRow[] }

export function scheduleLuck(lg: League, year: number): ScheduleLuck | null {
  const g = seasonGrid(lg, year)
  if (!g || !g.weeks.length) return null
  const { ids, pts, opp, weeks } = g
  const matrix: Record<string, Record<string, number>> = {}
  for (const a of ids) {
    matrix[a] = {}
    for (const b of ids) {
      let wins = 0
      for (const w of weeks) {
        let o = opp[b][w]
        if (o == null) continue
        if (o === a) o = b
        if ((pts[a][w] ?? 0) > (pts[o][w] ?? 0)) wins++
        else if ((pts[a][w] ?? 0) === (pts[o][w] ?? 0)) wins += 0.5
      }
      matrix[a][b] = wins
    }
  }
  const rows = ids.map((a) => {
    const others = ids.map((b) => ({ id: b, wins: matrix[a][b] }))
    const expected = weeks.reduce((acc, w) => acc + ids.filter((o) => o !== a && (pts[a][w] ?? 0) > (pts[o][w] ?? 0)).length / (ids.length - 1), 0)
    const sorted = [...others].sort((x, y) => y.wins - x.wins)
    return {
      memberId: a, actual: matrix[a][a], games: weeks.length, expected,
      avgSwap: others.reduce((s, x) => s + x.wins, 0) / others.length,
      best: sorted[0], worst: sorted[sorted.length - 1],
      luck: matrix[a][a] - expected,
      rankAmong: others.filter((x) => x.wins < matrix[a][a]).length,
    }
  }).sort((x, y) => y.luck - x.luck)
  return { ids, matrix, games: weeks.length, rows }
}
