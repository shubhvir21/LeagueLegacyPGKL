// Legacy Score: ranks every completed team-season against all others.
//
// Each component is a z-score *within its own season* (so a high-scoring year doesn't
// inflate everyone), then blended and mapped onto a 0–100 scale (50 = an average team).
//
//   Results     30%  final finish (title-weighted) + regular-season seed
//   Dominance   30%  points-per-game, all-play win %, and average margin of victory
//   Talent      25%  roster value: starting-lineup points over replacement level
//   Consistency 15%  weekly floor (mean − 1 SD of weekly scores) and median-beat rate
//
// On top of the blend: +4 for a championship, −2 for a toilet-bowl loss. Ties in the
// title race are rare, so this bonus mostly separates champions from equally strong
// teams that flamed out in the playoffs.
import { playersOf } from './players'
import { teamWeeks } from './records'
import type { League, TeamSeason } from './stats'

export interface TeamRank {
  t: TeamSeason
  score: number
  results: number
  dominance: number
  talent: number
  consistency: number
  ppg: number
  margin: number
  rosterValue: number
  floor: number
}

const W = { results: 0.3, dominance: 0.3, talent: 0.25, consistency: 0.15 }

function z(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1
  return values.map((v) => (v - mean) / sd)
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** Finish → 0..1 with extra weight at the top (title ≫ runner-up ≫ 3rd). */
function finishValue(rank: number, n: number, playoffs: boolean) {
  const base = (n - rank) / (n - 1)
  const bonus = rank === 1 ? 0.35 : rank === 2 ? 0.18 : rank === 3 ? 0.1 : playoffs ? 0.04 : 0
  return base + bonus
}

export function teamRankings(lg: League): TeamRank[] {
  const pm = playersOf(lg)
  const tw = teamWeeks(lg).filter((t) => !t.playoff && t.pts > 0)
  const out: TeamRank[] = []

  for (const s of lg.seasons.filter((x) => x.complete)) {
    const ts = s.teamSeasons
    const weeksIn = Math.max(1, s.weeksPlayed)
    const repl = pm.replacement[s.year] ?? {}

    const rows = ts.map((t) => {
      const mine = tw.filter((w) => w.season === s.year && w.memberId === t.memberId)
      const pts = mine.map((w) => w.pts)
      const mean = avg(pts)
      const sd = Math.sqrt(avg(pts.map((p) => (p - mean) ** 2)))
      // Starting-lineup points above a replacement player at the same position, per week.
      const rosterValue = pm.weeks
        .filter((w) => w.season === s.year && w.memberId === t.memberId && w.started && w.week < s.playoffStart)
        .reduce((a, w) => a + (w.pts - (repl[pm.info[w.playerId]?.pos ?? ''] ?? 0) / weeksIn), 0)
      return {
        t,
        ppg: t.pf / (t.games || 1),
        ap: t.apW / (t.apW + t.apL + t.apT || 1),
        margin: avg(mine.map((w) => w.pts - w.oppPts)),
        rosterValue,
        floor: mean - sd,
        medRate: t.medW / (t.medW + t.medL || 1),
        finish: finishValue(t.finalRank ?? t.regRank, s.teams, t.madePlayoffs),
        seed: (s.teams - t.regRank) / (s.teams - 1),
      }
    })

    const zFinish = z(rows.map((r) => r.finish)), zSeed = z(rows.map((r) => r.seed))
    const zPpg = z(rows.map((r) => r.ppg)), zAp = z(rows.map((r) => r.ap)), zMargin = z(rows.map((r) => r.margin))
    const zTalent = z(rows.map((r) => r.rosterValue))
    const zFloor = z(rows.map((r) => r.floor)), zMed = z(rows.map((r) => r.medRate))

    rows.forEach((r, i) => {
      const results = 0.7 * zFinish[i] + 0.3 * zSeed[i]
      const dominance = 0.4 * zPpg[i] + 0.35 * zAp[i] + 0.25 * zMargin[i]
      const talent = zTalent[i]
      const consistency = 0.6 * zFloor[i] + 0.4 * zMed[i]
      const blend = W.results * results + W.dominance * dominance + W.talent * talent + W.consistency * consistency
      const bonus = (r.t.finalRank === 1 ? 4 : 0) - (s.toiletBowlLoser === r.t.memberId ? 2 : 0)
      // ~±2 SD maps to ~10–90; clamp to 0–100.
      const score = Math.max(0, Math.min(100, 50 + 20 * blend + bonus))
      out.push({
        t: r.t, score, results, dominance, talent, consistency,
        ppg: r.ppg, margin: r.margin, rosterValue: r.rosterValue, floor: r.floor,
      })
    })
  }
  return out.sort((a, b) => b.score - a.score)
}
