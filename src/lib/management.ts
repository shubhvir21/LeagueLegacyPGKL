// Management metrics: how well each manager set lineups and built the roster in-season.
// Everything here comes from weekly points (no draft data), so keeper quirks don't matter.
import { playersOf } from './players'
import type { RawSeason } from './sleeper'
import type { League } from './stats'

const FLEX: Record<string, string[]> = {
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
}

/** Best possible lineup score from everyone on the roster that week. */
export function optimalLineup(slots: string[], players: { pos: string; pts: number }[]) {
  const pool = [...players].sort((a, b) => b.pts - a.pts)
  const used = new Set<number>()
  let total = 0
  const take = (ok: (pos: string) => boolean) => {
    const i = pool.findIndex((p, j) => !used.has(j) && ok(p.pos))
    if (i >= 0) { used.add(i); total += pool[i].pts }
  }
  // Fixed positions first, then flex slots (narrowest first) from what's left.
  for (const s of slots.filter((x) => !FLEX[x])) take((pos) => pos === s)
  for (const s of slots.filter((x) => FLEX[x]).sort((a, b) => FLEX[a].length - FLEX[b].length)) take((pos) => FLEX[s].includes(pos))
  return total
}

export interface ManagerSeason {
  season: number
  memberId: string
  inProgress: boolean
  weeks: number
  actual: number
  optimal: number
  efficiency: number // actual ÷ optimal, %
  benchPts: number // points left on the bench
  perfectWeeks: number
  lineupLosses: number // H2H losses the optimal lineup would have won
  adds: number
  waiverValue: number // started points from waiver/FA pickups
  faabPct: number // share of FAAB budget spent
  valuePerFaab: number // waiver value per 1% of budget
  trades: number
  tradeValue: number
  pickupShare: number // % of starting points from in-season pickups
  top3Share: number // % of starting points from the 3 best starters
  coachScore: number // 0–100, season-relative
  managerScore: number // 0–100, season-relative
}

const zs = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1
  return xs.map((x) => (x - m) / sd)
}
const score = (z: number) => Math.max(0, Math.min(100, 50 + 20 * z))

export function managementOf(lg: League): ManagerSeason[] {
  const pm = playersOf(lg)
  const pos = (id: string) => pm.info[id]?.pos ?? '?'
  const out: ManagerSeason[] = []

  for (const raw of lg.raw.seasons) {
    const year = Number(raw.league.season)
    const s = lg.seasons.find((x) => x.year === year)!
    const owner = lg.rosterOwner[year]
    const slots = raw.league.roster_positions.filter((p) => p !== 'BN' && p !== 'IR' && p !== 'TAXI')
    const rows: Record<string, ManagerSeason> = {}
    const started: Record<string, Record<string, number>> = {}
    const draftedBy: Record<string, Set<string>> = {}
    for (const p of raw.draft?.picks ?? []) (draftedBy[owner[p.roster_id]] ??= new Set()).add(p.player_id)

    weeksOf(raw, s.playoffStart).forEach(({ week, wk }) => {
      const byMatch: Record<number, typeof wk> = {}
      for (const m of wk) if (m.matchup_id != null) (byMatch[m.matchup_id] ??= []).push(m)
      for (const m of wk) {
        const id = owner[m.roster_id]
        const r = (rows[id] ??= blank(year, id, !s.complete))
        const players = Object.entries(m.players_points ?? {}).map(([pid, pts]) => ({ pos: pos(pid), pts }))
        const opt = optimalLineup(slots, players)
        r.weeks++
        r.actual += m.points
        r.optimal += opt
        if (m.points >= opt - 0.01) r.perfectWeeks++
        const opp = byMatch[m.matchup_id ?? -1]?.find((x) => x.roster_id !== m.roster_id)
        if (opp && m.points < opp.points && opt > opp.points) r.lineupLosses++
        m.starters.forEach((pid, i) => { (started[id] ??= {})[pid] = (started[id][pid] ?? 0) + (m.starters_points[i] ?? 0) })
        void week
      }
    })

    for (const r of Object.values(rows)) {
      const mv = pm.moves.filter((m) => m.season === year && m.memberId === r.memberId)
      const tr = pm.trades.filter((t) => t.season === year).flatMap((t) => t.sides.filter((x) => x.memberId === r.memberId && (x.gets.length || x.gives.length)))
      const roster = raw.rosters.find((x) => owner[x.roster_id] === r.memberId)
      const st = Object.entries(started[r.memberId] ?? {}).sort((a, b) => b[1] - a[1])
      const stTotal = st.reduce((a, [, v]) => a + v, 0) || 1
      const pickedUp = new Set(mv.map((m) => m.playerId))
      r.efficiency = r.optimal ? (r.actual / r.optimal) * 100 : 0
      r.benchPts = r.optimal - r.actual
      r.adds = mv.length
      r.waiverValue = mv.reduce((a, m) => a + m.value, 0)
      r.faabPct = ((roster?.settings.waiver_budget_used ?? 0) / (Number(raw.league.settings.waiver_budget) || 100)) * 100
      r.valuePerFaab = r.faabPct > 0 ? r.waiverValue / r.faabPct : 0
      r.trades = tr.length
      r.tradeValue = tr.reduce((a, x) => a + x.value, 0)
      r.pickupShare = (st.filter(([pid]) => pickedUp.has(pid) && !draftedBy[r.memberId]?.has(pid)).reduce((a, [, v]) => a + v, 0) / stTotal) * 100
      r.top3Share = (st.slice(0, 3).reduce((a, [, v]) => a + v, 0) / stTotal) * 100
    }

    // Season-relative composites
    const list = Object.values(rows)
    if (list.length) {
      const zEff = zs(list.map((r) => r.efficiency)), zLL = zs(list.map((r) => -r.lineupLosses / (r.weeks || 1)))
      const zW = zs(list.map((r) => r.waiverValue)), zT = zs(list.map((r) => r.tradeValue))
      list.forEach((r, i) => {
        const coach = 0.7 * zEff[i] + 0.3 * zLL[i]
        r.coachScore = score(coach)
        r.managerScore = score(0.45 * coach + 0.3 * zW[i] + 0.25 * zT[i])
      })
    }
    out.push(...list)
  }
  return out
}

function weeksOf(raw: RawSeason, playoffStart: number) {
  return raw.matchups
    .map((wk, i) => ({ week: i + 1, wk }))
    .filter(({ week, wk }) => week < playoffStart && week <= raw.lastScored && wk.some((m) => m.points > 0))
}

function blank(season: number, memberId: string, inProgress: boolean): ManagerSeason {
  return {
    season, memberId, inProgress, weeks: 0, actual: 0, optimal: 0, efficiency: 0, benchPts: 0, perfectWeeks: 0, lineupLosses: 0,
    adds: 0, waiverValue: 0, faabPct: 0, valuePerFaab: 0, trades: 0, tradeValue: 0, pickupShare: 0, top3Share: 0, coachScore: 50, managerScore: 50,
  }
}

/** All-time averages per member (each season counts once). */
export function managementCareer(rows: ManagerSeason[]) {
  const by: Record<string, ManagerSeason[]> = {}
  for (const r of rows) (by[r.memberId] ??= []).push(r)
  return Object.entries(by).map(([memberId, rs]) => {
    const mean = (f: (r: ManagerSeason) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length
    const sum = (f: (r: ManagerSeason) => number) => rs.reduce((a, r) => a + f(r), 0)
    const optimal = sum((r) => r.optimal), actual = sum((r) => r.actual)
    return {
      ...blank(0, memberId, false),
      seasons: rs.length,
      weeks: sum((r) => r.weeks), actual, optimal,
      efficiency: optimal ? (actual / optimal) * 100 : 0,
      benchPts: mean((r) => r.benchPts), // per season
      perfectWeeks: sum((r) => r.perfectWeeks), lineupLosses: sum((r) => r.lineupLosses),
      adds: mean((r) => r.adds), waiverValue: mean((r) => r.waiverValue), faabPct: mean((r) => r.faabPct),
      valuePerFaab: mean((r) => r.valuePerFaab), trades: sum((r) => r.trades), tradeValue: mean((r) => r.tradeValue),
      pickupShare: mean((r) => r.pickupShare), top3Share: mean((r) => r.top3Share),
      coachScore: mean((r) => r.coachScore), managerScore: mean((r) => r.managerScore),
    }
  })
}

const cache = new WeakMap<League, ManagerSeason[]>()
export function managementCached(lg: League) {
  let m = cache.get(lg)
  if (!m) { m = managementOf(lg); cache.set(lg, m) }
  return m
}
