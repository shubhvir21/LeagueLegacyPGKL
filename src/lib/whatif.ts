// What-if machine: replay a season under changed conditions and re-run standings + bracket.
//
// Every scenario adjusts each team's weekly score, then everything downstream is recomputed:
//   Perfect lineups   score = best possible lineup from that week's roster
//   Undo a trade      both sides' rosters as if it never happened; score shifts by the change in
//                     best possible lineup (so a manager's usual lineup mistakes are kept)
//   Remove a player   same, with that player taken off a roster for the season
//   No median games   records count head-to-head games only
// Seeding is wins, then points for. The bracket is replayed with the scenario's scores, higher
// seed vs. lowest remaining seed each round (top 2 seeds get byes in a 6-team field).
import type { League } from './stats'
import { lineupSlots, optimalLineup } from './lineup'
import { playersOf, type Trade } from './players'

export interface Scenario { perfect: boolean; noMedian: boolean; undo: Trade[]; remove: { memberId: string; playerId: string }[] }
export interface WhatIfTeam {
  memberId: string
  wins: number; losses: number; pf: number; seed: number
  actualWins: number; actualLosses: number; actualPf: number; actualSeed: number
  finish: number | null // 1 = champion … playoff finish; null = missed
  actualFinish: number | null
}
export interface WhatIf { teams: WhatIfTeam[]; champion: string | null; actualChampion: string | null; bracket: { round: string; games: { a: string; b: string; aPts: number; bPts: number }[] }[] }

export function whatIf(lg: League, year: number, sc: Scenario): WhatIf | null {
  const s = lg.seasons.find((x) => x.year === year)
  const raw = lg.raw.seasons.find((r) => Number(r.league.season) === year)
  if (!s || !raw) return null
  const pm = playersOf(lg)
  const pos = (pid: string) => pm.info[pid]?.pos ?? '?'
  const slots = lineupSlots(raw.league.roster_positions)
  const owner = lg.rosterOwner[year]
  const lastWeek = Math.min(raw.matchups.length, s.playoffStart + 2)
  const opt = (pp: Record<string, number>) => optimalLineup(slots, Object.entries(pp).map(([pid, pts]) => ({ pos: pos(pid), pts })))

  // Week -> member -> roster points, plus everyone's points that week (for players added back).
  const score: Record<number, Record<string, number>> = {}
  for (let w = 1; w <= lastWeek; w++) {
    const wk = raw.matchups[w - 1] ?? []
    if (w > raw.lastScored || !wk.some((m) => m.points > 0)) break
    const all: Record<string, number> = {}
    for (const m of wk) Object.assign(all, m.players_points ?? {})
    score[w] = {}
    for (const m of wk) {
      const id = owner[m.roster_id]
      const pp = { ...(m.players_points ?? {}) }
      const base = sc.perfect ? opt(pp) : m.points
      // Roster edits: apply every undone trade / removal in effect this week.
      let edited = false
      for (const t of sc.undo) {
        if (t.season !== year || w < t.week) continue
        const side = t.sides.find((x) => x.memberId === id)
        if (!side) continue
        for (const p of side.gets) delete pp[p]
        for (const p of side.gives) if (all[p] != null) pp[p] = all[p]
        edited = true
      }
      for (const r of sc.remove) if (r.memberId === id && pp[r.playerId] != null) { delete pp[r.playerId]; edited = true }
      score[w][id] = edited ? (sc.perfect ? opt(pp) : base + opt(pp) - opt(m.players_points ?? {})) : base
    }
  }
  const weeks = Object.keys(score).map(Number).sort((a, b) => a - b)
  const reg = weeks.filter((w) => w < s.playoffStart)
  const median = !sc.noMedian && Number(raw.league.settings.league_average_match ?? 0) === 1
  const ids = s.teamSeasons.map((t) => t.memberId)
  const W: Record<string, number> = {}, L: Record<string, number> = {}, PF: Record<string, number> = {}
  for (const id of ids) { W[id] = 0; L[id] = 0; PF[id] = 0 }
  for (const w of reg) {
    const sw = score[w]
    for (const g of lg.games.filter((x) => x.season === year && x.week === w && !x.playoff)) {
      const a = sw[g.a] ?? 0, b = sw[g.b] ?? 0
      if (a > b) { W[g.a]++; L[g.b]++ } else if (b > a) { W[g.b]++; L[g.a]++ }
    }
    if (median) {
      const xs = ids.map((id) => sw[id] ?? 0).sort((p, q) => q - p)
      const line = (xs[Math.floor(ids.length / 2) - 1] + xs[Math.floor(ids.length / 2)]) / 2
      for (const id of ids) (sw[id] ?? 0) > line ? W[id]++ : L[id]++
    }
    for (const id of ids) PF[id] += sw[id] ?? 0
  }
  const order = [...ids].sort((a, b) => W[b] - W[a] || PF[b] - PF[a])

  // Bracket replay with scenario scores.
  const P = s.playoffTeams, byes = P === 6 ? 2 : 0
  const field = order.slice(0, P)
  const seedOf = (id: string) => field.indexOf(id)
  const finish: Record<string, number> = {}
  const bracket: WhatIf['bracket'] = []
  let champion: string | null = null
  const canPlay = weeks.includes(s.playoffStart + (byes ? 2 : 1))
  if (s.complete && canPlay) {
    let alive = field, wk = s.playoffStart, r = 0
    const play = (a: string, b: string) => {
      const x = score[wk]?.[a] ?? 0, y = score[wk]?.[b] ?? 0
      bracket[r].games.push({ a, b, aPts: x, bPts: y })
      return x >= y ? [a, b] : [b, a]
    }
    const names = P === 6 ? ['Quarterfinals', 'Semifinals', 'Final'] : ['Semifinals', 'Final']
    // House rule: top seeds pick their opponents. When the same teams are alive as in reality,
    // reuse the real pairings; otherwise fall back to best seed vs. worst remaining.
    const pairs = (round: number, teams: string[]): [string, string][] => {
      const real = raw.winnersBracket.filter((m) => m.r === round && m.p == null && m.t1 != null && m.t2 != null).map((m) => [owner[m.t1!], owner[m.t2!]] as [string, string])
      const same = real.length * 2 === teams.length && real.flat().every((id) => teams.includes(id))
      if (same) return real
      return Array.from({ length: teams.length / 2 }, (_, k) => [teams[k], teams[teams.length - 1 - k]] as [string, string])
    }
    if (byes) {
      bracket.push({ round: names[0], games: [] })
      const adv: string[] = []
      for (const [x, y] of pairs(1, alive.slice(byes))) { const [win, lose] = play(x, y); adv.push(win); finish[lose] = 5 }
      alive = [...alive.slice(0, byes), ...adv].sort((a, b) => seedOf(a) - seedOf(b))
      wk++; r++
    }
    while (alive.length > 1) {
      bracket.push({ round: names[r] ?? `Round ${r + 1}`, games: [] })
      const adv: string[] = []
      for (const [x, y] of pairs(r + 1, alive)) {
        const [win, lose] = play(x, y)
        adv.push(win)
        finish[lose] = alive.length === 2 ? 2 : 3
      }
      alive = adv.sort((a, b) => seedOf(a) - seedOf(b))
      wk++; r++
    }
    champion = alive[0]
    finish[champion] = 1
  }
  const actualOrder = [...s.teamSeasons].sort((a, b) => a.regRank - b.regRank).map((t) => t.memberId)
  const teams: WhatIfTeam[] = order.map((id, k) => {
    const t = s.teamSeasons.find((x) => x.memberId === id)!
    const fr = t.finalRank
    const af = !t.madePlayoffs || fr == null ? null : fr <= 2 ? fr : fr <= 4 ? 3 : 5
    return {
      memberId: id, wins: W[id], losses: L[id], pf: PF[id], seed: k + 1,
      actualWins: t.wins, actualLosses: t.losses, actualPf: t.pf, actualSeed: actualOrder.indexOf(id) + 1,
      finish: k < P ? finish[id] ?? null : null, actualFinish: af,
    }
  })
  return { teams, champion, actualChampion: s.champion, bracket }
}
