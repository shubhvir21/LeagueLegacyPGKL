// Legacy Score: ranks every completed team-season against all others.
//
// Every part is a 0–100 sub-score, then blended:
//
//   Finish        20%  exact final finish: champion 100, last 0, evenly spaced between
//   Reg. Season   10%  regular-season seed and win % (incl. median games)
//   Dominance     30%  points-per-game, all-play win %, and average margin
//   Talent        25%  roster value: starting-lineup points over replacement level
//   Consistency   15%  weekly floor (mean − 1 SD of weekly scores) and median-beat rate
//
// Finish is absolute. The other parts are z-scores *within their own season* (so a
// high-scoring year doesn't inflate everyone), mapped as 50 + 20·z and clamped to 0–100,
// so 50 is an average team and roughly ±2 SD spans 10–90.
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
  talent: number
  consistency: number
  ppg: number
  margin: number
  rosterValue: number
  floor: number
}

export const WEIGHTS = { finish: 0.2, regular: 0.1, dominance: 0.3, talent: 0.25, consistency: 0.15 }

function z(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1
  return values.map((v) => (v - mean) / sd)
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const toScore = (zv: number) => Math.max(0, Math.min(100, 50 + 20 * zv))

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
        seed: (s.teams - t.regRank) / (s.teams - 1),
        winPct: (t.wins + t.ties / 2) / (t.wins + t.losses + t.ties || 1),
      }
    })

    const zSeed = z(rows.map((r) => r.seed)), zWin = z(rows.map((r) => r.winPct))
    const zPpg = z(rows.map((r) => r.ppg)), zAp = z(rows.map((r) => r.ap)), zMargin = z(rows.map((r) => r.margin))
    const zTalent = z(rows.map((r) => r.rosterValue))
    const zFloor = z(rows.map((r) => r.floor)), zMed = z(rows.map((r) => r.medRate))

    rows.forEach((r, i) => {
      const finish = (100 * (s.teams - (r.t.finalRank ?? s.teams))) / (s.teams - 1)
      const regular = toScore(0.5 * zSeed[i] + 0.5 * zWin[i])
      const dominance = toScore(0.4 * zPpg[i] + 0.35 * zAp[i] + 0.25 * zMargin[i])
      const talent = toScore(zTalent[i])
      const consistency = toScore(0.6 * zFloor[i] + 0.4 * zMed[i])
      const score =
        WEIGHTS.finish * finish + WEIGHTS.regular * regular + WEIGHTS.dominance * dominance +
        WEIGHTS.talent * talent + WEIGHTS.consistency * consistency
      out.push({
        t: r.t, score, finish, regular, dominance, talent, consistency,
        ppg: r.ppg, margin: r.margin, rosterValue: r.rosterValue, floor: r.floor,
      })
    })
  }
  return out.sort((a, b) => b.score - a.score)
}
