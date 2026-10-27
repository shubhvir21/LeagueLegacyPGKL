// Milestone races: who reached each mark (50 wins, 100 wins, ...) in the fewest weeks.
// Regular-season races count only regular-season weeks; the playoff races count every week.
import type { League } from './stats'
import { teamWeeks } from './records'

export interface Finisher { memberId: string; weeks: number; season: number; week: number; place: number }
export interface Chaser { memberId: string; have: number }
export interface Mark { mark: number; finishers: Finisher[]; chasers: Chaser[] }
export interface Race { id: string; title: string; unit: string; step: number; positive: boolean; marks: Mark[] }

interface Tick { season: number; week: number; idx: number; gain: Record<string, number> }

export function buildMilestones(lg: League): Race[] {
  const ids = lg.members.map((m) => m.id)
  const tw = teamWeeks(lg)
  const reg = tw.filter((t) => !t.playoff)
  const medianOn = new Set(lg.seasons.filter((s) => s.teamSeasons.some((t) => t.medW + t.medL > 0)).map((s) => s.year))

  // Group into league weeks in order; idx is the week number counted from the league's first week.
  const weeksOf = (rows: typeof tw) => {
    const by: Record<string, typeof tw> = {}
    for (const t of rows) (by[`${t.season}|${String(t.week).padStart(2, '0')}`] ??= []).push(t)
    return Object.keys(by).sort().map((k) => by[k])
  }
  const regWeeks = weeksOf(reg)
  const allWeeks = weeksOf(tw)

  const ticks = (weeks: typeof regWeeks, f: (t: (typeof tw)[number], wk: typeof tw) => number): Tick[] =>
    weeks.map((wk, i) => {
      const gain: Record<string, number> = {}
      for (const t of wk) gain[t.memberId] = (gain[t.memberId] ?? 0) + f(t, wk)
      return { season: wk[0].season, week: wk[0].week, idx: i + 1, gain }
    })

  const medianLine = (wk: typeof tw) => {
    const s = wk.map((t) => t.pts).sort((a, b) => b - a)
    const n = s.length
    return (s[Math.floor(n / 2) - 1] + s[Math.floor(n / 2)]) / 2
  }
  const winOf = (t: (typeof tw)[number], wk: typeof tw) =>
    (t.pts > t.oppPts ? 1 : 0) + (medianOn.has(t.season) && t.pts > medianLine(wk) ? 1 : 0)
  const lossOf = (t: (typeof tw)[number], wk: typeof tw) =>
    (t.pts < t.oppPts ? 1 : 0) + (medianOn.has(t.season) && t.pts <= medianLine(wk) ? 1 : 0)
  const max = (wk: typeof tw) => Math.max(...wk.map((t) => t.pts))
  const min = (wk: typeof tw) => Math.min(...wk.map((t) => t.pts))

  const race = (id: string, title: string, unit: string, step: number, positive: boolean, tk: Tick[]): Race => {
    const total: Record<string, number> = Object.fromEntries(ids.map((x) => [x, 0]))
    const reached: Record<number, (Finisher & { over: number })[]> = {}
    for (const t of tk) {
      for (const [m, g] of Object.entries(t.gain)) {
        const before = total[m] ?? 0
        total[m] = before + g
        for (let mk = (Math.floor(before / step) + 1) * step; mk <= total[m]; mk += step) {
          ;(reached[mk] ??= []).push({ memberId: m, weeks: t.idx, season: t.season, week: t.week, place: 0, over: total[m] })
        }
      }
    }
    const top = Math.max(0, ...Object.values(total))
    const marks: Mark[] = []
    for (let mk = step; mk <= Math.floor(top / step) * step + step; mk += step) {
      // Same week = same place; a points race breaks the tie on who went further past the mark.
      const fin = [...(reached[mk] ?? [])].sort((a, b) => a.weeks - b.weeks || (unit === 'points' || unit === 'points against' ? b.over - a.over : 0))
      fin.forEach((f, i) => {
        const prev = fin[i - 1]
        f.place = prev && prev.weeks === f.weeks && !(unit === 'points' || unit === 'points against') ? prev.place : i + 1
      })
      const done = new Set(fin.map((f) => f.memberId))
      const chasers = ids.filter((m) => !done.has(m)).map((m) => ({ memberId: m, have: total[m] })).sort((a, b) => b.have - a.have)
      marks.push({ mark: mk, finishers: fin.map(({ over: _o, ...f }) => f), chasers })
    }
    return { id, title, unit, step, positive, marks }
  }

  return [
    race('wins', 'Wins', 'wins', 50, true, ticks(regWeeks, winOf)),
    race('ap', 'All-Play Wins', 'all-play wins', 100, true, ticks(regWeeks, (t, wk) => wk.filter((o) => o.memberId !== t.memberId && t.pts > o.pts).length)),
    race('pts', 'Points', 'points', 2500, true, ticks(regWeeks, (t) => t.pts)),
    race('highs', 'Weekly High Scores', 'high scores', 10, true, ticks(regWeeks, (t, wk) => (t.pts === max(wk) ? 1 : 0))),
    race('150', '150-Point Games', '150-point games', 10, true, ticks(regWeeks, (t) => (t.pts >= 150 ? 1 : 0))),
    race('pg', 'Playoff Games', 'playoff games', 5, true, ticks(allWeeks, (t) => (t.bracket === 'winners' && t.place !== 5 ? 1 : 0))),
    race('pw', 'Playoff Wins', 'playoff wins', 5, true, ticks(allWeeks, (t) => (t.bracket === 'winners' && t.place !== 5 && t.pts > t.oppPts ? 1 : 0))),
    race('losses', 'Losses', 'losses', 50, false, ticks(regWeeks, lossOf)),
    race('apl', 'All-Play Losses', 'all-play losses', 100, false, ticks(regWeeks, (t, wk) => wk.filter((o) => o.memberId !== t.memberId && t.pts < o.pts).length)),
    race('pa', 'Points Against', 'points against', 2500, false, ticks(regWeeks, (t) => t.oppPts)),
    race('lows', 'Weekly Low Scores', 'low scores', 10, false, ticks(regWeeks, (t, wk) => (t.pts === min(wk) ? 1 : 0))),
    race('u100', 'Sub-100 Games', 'sub-100 games', 10, false, ticks(regWeeks, (t) => (t.pts < 100 ? 1 : 0))),
    race('tb', 'Toilet Bowl Games', 'toilet bowl games', 2, false, ticks(allWeeks, (t) => (t.toilet ? 1 : 0))),
    race('tbl', 'Toilet Bowl Losses', 'toilet bowl losses', 2, false, ticks(allWeeks, (t) => (t.toilet && t.pts < t.oppPts ? 1 : 0))),
  ]
}
