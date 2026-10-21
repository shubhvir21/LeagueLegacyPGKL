// Legacy Score: ranks every completed team-season against all others.
//
// Every part is a 0–100 sub-score, then blended:
//
//   Dominance     40%  points-per-game and average margin (playoffs included), and all-play win %
//   Finish        25%  final finish on a title-weighted scale: 100 / 80 / 65 / 52 / 42 / 33 / 24 / 15 / 7 / 0
//   Consistency   15%  weekly floor (mean − 1 SD of weekly scores) and median-beat rate
//   Reg. Season   20%  regular-season seed and win % (incl. median games)
//
// Finish is absolute. The other parts are z-scores *within their own season* (so a
// high-scoring year doesn't inflate everyone), mapped as 70 + 20·z and clamped to 0–100,
// so 70 is an average team and the 90th percentile (z ≈ 1.28) lands at about 95.
// rosterValue (starting-lineup points over replacement) is still computed for valuations.
import { playersOf } from './players'
import { teamWeeks } from './records'
import type { League, TeamSeason } from './stats'

export interface TeamRank {
  t: TeamSeason
  score: number
  // 0–100 sub-scores
  finish: number
  regular: number
  dominance: number
  consistency: number
  ppg: number
  margin: number
  rosterValue: number
  floor: number
}

/** Finish sub-score by place (10 teams); the title is worth a clear step over runner-up. */
export const FINISH_SCORE = [100, 80, 65, 52, 42, 33, 24, 15, 7, 0]

export const WEIGHTS = { dominance: 0.4, finish: 0.25, consistency: 0.15, regular: 0.2 }

function z(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1
  return values.map((v) => (v - mean) / sd)
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const toScore = (zv: number) => Math.max(0, Math.min(100, 70 + 20 * zv))

export function teamRankings(lg: League): TeamRank[] {
  const pm = playersOf(lg)
  const all = teamWeeks(lg).filter((t) => t.pts > 0)
  const tw = all.filter((t) => !t.playoff)
  const out: TeamRank[] = []

  for (const s of lg.seasons.filter((x) => x.complete)) {
    const ts = s.teamSeasons
    const weeksIn = Math.max(1, s.weeksPlayed)
    const repl = pm.replacement[s.year] ?? {}

    const rows = ts.map((t) => {
      const mine = tw.filter((w) => w.season === s.year && w.memberId === t.memberId)
      // Points per game and margin include playoff and toilet-bowl games.
      const withPlayoffs = all.filter((w) => w.season === s.year && w.memberId === t.memberId)
      const pts = mine.map((w) => w.pts)
      const mean = avg(pts)
      const sd = Math.sqrt(avg(pts.map((p) => (p - mean) ** 2)))
      // Starting-lineup points above a replacement player at the same position, per week.
      const rosterValue = pm.weeks
        .filter((w) => w.season === s.year && w.memberId === t.memberId && w.started && w.week < s.playoffStart)
        .reduce((a, w) => a + (w.pts - (repl[pm.info[w.playerId]?.pos ?? ''] ?? 0) / weeksIn), 0)
      return {
        t,
        ppg: avg(withPlayoffs.map((w) => w.pts)),
        ap: t.apW / (t.apW + t.apL + t.apT || 1),
        margin: avg(withPlayoffs.map((w) => w.pts - w.oppPts)),
        rosterValue,
        floor: mean - sd,
        medRate: t.medW / (t.medW + t.medL || 1),
        seed: (s.teams - t.regRank) / (s.teams - 1),
        winPct: (t.wins + t.ties / 2) / (t.wins + t.losses + t.ties || 1),
      }
    })

    const zSeed = z(rows.map((r) => r.seed)), zWin = z(rows.map((r) => r.winPct))
    const zPpg = z(rows.map((r) => r.ppg)), zAp = z(rows.map((r) => r.ap)), zMargin = z(rows.map((r) => r.margin))
    const zFloor = z(rows.map((r) => r.floor)), zMed = z(rows.map((r) => r.medRate))

    rows.forEach((r, i) => {
      const place = r.t.finalRank ?? s.teams
      // Other league sizes: stretch the 10-team scale across the field.
      const finish = s.teams === FINISH_SCORE.length ? FINISH_SCORE[place - 1] : FINISH_SCORE[Math.round(((place - 1) * (FINISH_SCORE.length - 1)) / (s.teams - 1))]
      const regular = toScore(0.5 * zSeed[i] + 0.5 * zWin[i])
      const dominance = toScore(0.45 * zPpg[i] + 0.4 * zAp[i] + 0.15 * zMargin[i])
      const consistency = toScore(0.6 * zFloor[i] + 0.4 * zMed[i])
      const score =
        WEIGHTS.dominance * dominance + WEIGHTS.finish * finish +
        WEIGHTS.consistency * consistency + WEIGHTS.regular * regular
      out.push({
        t: r.t, score, finish, regular, dominance, consistency,
        ppg: r.ppg, margin: r.margin, rosterValue: r.rosterValue, floor: r.floor,
      })
    })
  }
  return out.sort((a, b) => b.score - a.score)
}
