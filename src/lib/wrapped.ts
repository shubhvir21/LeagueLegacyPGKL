// Season Wrapped: one member's season told as a handful of headline moments.
import type { League } from './stats'
import { playersOf } from './players'
import { ELO } from './elo'

export interface WrappedGame { week: number; opp: string; pts: number; oppPts: number; playoff: boolean }
export interface Wrapped {
  memberId: string
  year: number
  complete: boolean
  weeksPlayed: number
  teams: number
  finish: { rank: number; regRank: number; madePlayoffs: boolean; champion: boolean; toiletBowl: boolean }
  record: { wins: number; losses: number; ties: number; h2hW: number; h2hL: number }
  pf: number; pfRank: number; share: number; ppg: number
  highScores: number
  best: WrappedGame & { weekRank: number }
  worst: WrappedGame & { weekRank: number }
  bigWin: WrappedGame | null
  closeLoss: WrappedGame | null
  luck: { wins: number; expected: number; diff: number; rank: number } // rank 1 = luckiest
  mvp: { playerId: string; pts: number; starts: number } | null
  pickup: { playerId: string; gain: number; week: number } | null
  regret: { playerId: string; after: number; week: number } | null
  nemesis: { id: string; w: number; l: number } | null // most losses to
  victim: { id: string; w: number; l: number } | null // most wins over
  elo: { start: number; end: number }
}

export function seasonWrapped(lg: League, year: number, memberId: string): Wrapped | null {
  const s = lg.seasons.find((x) => x.year === year)
  const t = s?.teamSeasons.find((x) => x.memberId === memberId)
  if (!s || !t) return null
  const games = lg.games.filter((g) => g.season === year && (g.a === memberId || g.b === memberId))
    .map((g) => (g.a === memberId ? { week: g.week, opp: g.b, pts: g.aPts, oppPts: g.bPts, playoff: g.playoff } : { week: g.week, opp: g.a, pts: g.bPts, oppPts: g.aPts, playoff: g.playoff }))
    .filter((g) => g.pts > 0 || g.oppPts > 0)
  if (!games.length) return null
  const weekRank = (g: WrappedGame) => {
    const all = lg.games.filter((x) => x.season === year && x.week === g.week).flatMap((x) => [x.aPts, x.bPts])
    return all.filter((p) => p > g.pts).length + 1
  }
  const byPts = [...games].sort((a, b) => b.pts - a.pts)
  const best = byPts[0], worst = byPts[byPts.length - 1]
  const wins = games.filter((g) => g.pts > g.oppPts), losses = games.filter((g) => g.pts < g.oppPts)
  const bigWin = [...wins].sort((a, b) => (b.pts - b.oppPts) - (a.pts - a.oppPts))[0] ?? null
  const closeLoss = [...losses].sort((a, b) => (b.pts - b.oppPts) - (a.pts - a.oppPts))[0] ?? null

  const h2h: Record<string, { w: number; l: number }> = {}
  for (const g of games) { const r = (h2h[g.opp] ??= { w: 0, l: 0 }); if (g.pts > g.oppPts) r.w++; else if (g.pts < g.oppPts) r.l++ }
  const opps = Object.entries(h2h).map(([id, r]) => ({ id, ...r }))
  const nemesis = opps.filter((o) => o.l > 0).sort((a, b) => b.l - a.l || a.w - b.w)[0] ?? null
  const victim = opps.filter((o) => o.w > 0).sort((a, b) => b.w - a.w || a.l - b.l)[0] ?? null

  const pm = playersOf(lg)
  const started: Record<string, { pts: number; starts: number }> = {}
  for (const w of pm.weeks) if (w.season === year && w.memberId === memberId && w.started) { const r = (started[w.playerId] ??= { pts: 0, starts: 0 }); r.pts += w.pts; r.starts++ }
  const mvpE = Object.entries(started).sort((a, b) => b[1].pts - a[1].pts)[0]
  const pickupM = pm.moves.filter((m) => m.season === year && m.memberId === memberId && m.gain > 0).sort((a, b) => b.gain - a.gain)[0]
  const regretD = pm.drops.filter((d) => d.season === year && d.memberId === memberId && d.after > 0).sort((a, b) => b.after - a.after)[0]

  const luckOf = (x: typeof t) => x.h2hW - x.expectedWins
  const prev = lg.seasons.find((x) => x.year === year - 1)?.teamSeasons.find((x) => x.memberId === memberId)
  return {
    memberId, year, complete: s.complete, weeksPlayed: s.weeksPlayed, teams: s.teams,
    finish: { rank: t.finalRank ?? t.regRank, regRank: t.regRank, madePlayoffs: t.madePlayoffs, champion: s.champion === memberId, toiletBowl: s.toiletBowlLoser === memberId },
    record: { wins: t.wins, losses: t.losses, ties: t.ties, h2hW: t.h2hW, h2hL: t.h2hL },
    pf: t.pf, pfRank: [...s.teamSeasons].sort((a, b) => b.pf - a.pf).findIndex((x) => x.memberId === memberId) + 1,
    share: t.pointsShare, ppg: t.pf / (t.games || 1), highScores: t.highScores,
    best: { ...best, weekRank: weekRank(best) }, worst: { ...worst, weekRank: weekRank(worst) },
    bigWin, closeLoss,
    luck: { wins: t.h2hW, expected: t.expectedWins, diff: luckOf(t), rank: [...s.teamSeasons].sort((a, b) => luckOf(b) - luckOf(a)).findIndex((x) => x.memberId === memberId) + 1 },
    mvp: mvpE ? { playerId: mvpE[0], ...mvpE[1] } : null,
    pickup: pickupM ? { playerId: pickupM.playerId, gain: pickupM.gain, week: pickupM.week } : null,
    regret: regretD ? { playerId: regretD.playerId, after: regretD.after, week: regretD.week } : null,
    nemesis, victim,
    elo: { start: prev ? ELO.start + (1 - ELO.regress) * (prev.eloEnd - ELO.start) : ELO.start, end: t.eloEnd },
  }
}
