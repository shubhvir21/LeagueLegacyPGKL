// Rivalries: every pair of franchises scored 0–100 for how heated it is.
//
//   Balance     15%  how even the series is (1 − |W − L| / games)
//   Closeness   15%  half average margin (0 at 40+ pts), half share of games within 10
//   Stakes      35%  playoff meeting points: first round 2, semifinal 3, 3rd-place game 2,
//                    toilet bowl final 3, championship 5 (other consolation games 0)
//   Volume      25%  games played
//   Drama       10%  50-point blowouts (rename rights!) plus trades with each other
//
// Rivalries are between managers, not franchises: a takeover starts a fresh series, and the old
// manager's meetings stay with them as an archived rivalry. `a` / `b` are still franchise ids.
//
// Every part is relative to this league: a pair at or above the 80th percentile of all pairs
// gets full marks for that part, everyone else is scaled against that mark.
import type { Game, League } from './stats'
import { playersOf } from './players'
import { tenureOf, tenures, type Tenure } from './tenure'

export interface Rivalry {
  a: string; b: string // franchises
  aMgr: Tenure; bMgr: Tenure // the managers in this series
  archived: boolean // either manager has since handed the franchise over
  games: number; aW: number; bW: number; ties: number
  avgMargin: number; closeShare: number
  playoff: number; finals: number; blowouts: number; trades: number
  stakes: number // playoff meeting points
  stakeGames: { label: string; pts: number; season: number }[]
  streak: { id: string | null; n: number } // current
  longest: { id: string | null; n: number }
  aBest: Game | null; bBest: Game | null // biggest win for each side (oriented a vs b)
  last: Game | null
  score: number
  parts: { balance: number; closeness: number; stakes: number; volume: number; drama: number }
  tags: string[]
}

const REF_PCTL = 0.8
export const W = { stakes: 0.35, volume: 0.25, closeness: 0.15, balance: 0.15, drama: 0.1 }
const pctl = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] ?? 0 }
const rel = (v: number, ref: number) => (ref > 0 ? Math.min(1, v / ref) : 0)

/** Stakes points for one playoff meeting. */
function stakeOf(lg: League, g: Game): { label: string; pts: number } {
  const s = lg.seasons.find((x) => x.year === g.season)
  if (!s || !g.playoff) return { label: '', pts: 0 }
  const round = g.week - s.playoffStart
  if (g.bracket === 'winners') {
    if (g.place === 1) return { label: 'Championship', pts: 5 }
    if (g.place === 3) return { label: '3rd-place game', pts: 2 }
    if (g.place == null && round === 0) return { label: 'First round', pts: 2 }
    if (g.place == null && round === 1) return { label: 'Semifinal', pts: 3 }
  }
  // The toilet bowl final is the last losers-bracket round, the game with the last-place team.
  if (g.bracket === 'losers' && round === 1 && (g.a === s.toiletBowlLoser || g.b === s.toiletBowlLoser)) return { label: 'Toilet bowl final', pts: 3 }
  return { label: '', pts: 0 }
}

export function rivalries(lg: League): Rivalry[] {
  const pm = playersOf(lg)
  const ids = lg.members.map((m) => m.id)
  const pairs: Rivalry[] = []
  const current = (t: Tenure) => t === tenures(lg, t.memberId).at(-1)
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j]
    const all = lg.games
      .filter((g) => (g.a === a && g.b === b) || (g.a === b && g.b === a))
      .filter((g) => g.aPts > 0 || g.bPts > 0)
      .map((g) => (g.a === a ? g : { ...g, a: g.b, b: g.a, aPts: g.bPts, bPts: g.aPts }))
      .sort((x, y) => x.season - y.season || x.week - y.week)
    // One series per pair of managers.
    const series = new Map<string, { aMgr: Tenure; bMgr: Tenure; gs: Game[] }>()
    for (const g of all) {
      const aMgr = tenureOf(lg, g.season, a), bMgr = tenureOf(lg, g.season, b)
      if (!aMgr || !bMgr) continue
      const key = `${aMgr.managerId}|${bMgr.managerId}`
      if (!series.has(key)) series.set(key, { aMgr, bMgr, gs: [] })
      series.get(key)!.gs.push(g)
    }
    // Current managers who haven't met yet still get an (empty) active series.
    const aNow = tenures(lg, a).at(-1), bNow = tenures(lg, b).at(-1)
    if (aNow && bNow && !series.has(`${aNow.managerId}|${bNow.managerId}`)) series.set(`${aNow.managerId}|${bNow.managerId}`, { aMgr: aNow, bMgr: bNow, gs: [] })
    for (const { aMgr, bMgr, gs } of series.values()) {
      const win = (g: Game) => (g.aPts > g.bPts ? a : g.bPts > g.aPts ? b : null)
      let cur = { id: null as string | null, n: 0 }, longest = { id: null as string | null, n: 0 }
      for (const g of gs) {
        const w = win(g)
        cur = w && w === cur.id ? { id: w, n: cur.n + 1 } : { id: w, n: w ? 1 : 0 }
        if (cur.n > longest.n) longest = { ...cur }
    }
    const margins = gs.map((g) => Math.abs(g.aPts - g.bPts))
    const stakeGames = gs.map((g) => ({ ...stakeOf(lg, g), season: g.season })).filter((x) => x.pts > 0)
    const big = (side: string) => gs.filter((g) => win(g) === side).sort((x, y) => Math.abs(y.aPts - y.bPts) - Math.abs(x.aPts - x.bPts))[0] ?? null
    // Trades count only when these two managers made them.
    const ran = (t: Tenure, year: number) => year >= t.from && year <= t.to
    pairs.push({
      a, b, aMgr, bMgr, archived: !current(aMgr) || !current(bMgr), games: gs.length,
      aW: gs.filter((g) => win(g) === a).length, bW: gs.filter((g) => win(g) === b).length, ties: gs.filter((g) => !win(g)).length,
      avgMargin: gs.length ? margins.reduce((s, x) => s + x, 0) / gs.length : 0,
      closeShare: gs.length ? margins.filter((x) => x < 10).length / gs.length : 0,
      playoff: gs.filter((g) => g.playoff && g.bracket === 'winners').length,
      finals: gs.filter((g) => g.playoff && g.place === 1).length,
      blowouts: margins.filter((x) => x >= 50).length,
      trades: pm.trades.filter((t) => ran(aMgr, t.season) && ran(bMgr, t.season) && t.sides.some((s) => s.memberId === a) && t.sides.some((s) => s.memberId === b)).length,
      stakes: stakeGames.reduce((s, x) => s + x.pts, 0), stakeGames,
      streak: cur, longest, aBest: big(a), bBest: big(b), last: gs.at(-1) ?? null,
      score: 0, parts: { balance: 0, closeness: 0, stakes: 0, volume: 0, drama: 0 }, tags: [],
    })
    }
  }
  const rawParts = (p: Rivalry) => ({
    balance: p.games ? 1 - Math.abs(p.aW - p.bW) / (p.aW + p.bW || 1) : 0,
    closeness: 0.5 * Math.max(0, 1 - p.avgMargin / 40) + 0.5 * p.closeShare,
    stakes: p.stakes,
    volume: p.games,
    drama: p.blowouts + p.trades,
  })
  const raws = pairs.map(rawParts)
  // Marks come from active series, so short archived ones don't lower the bar for everyone.
  const ref = raws.filter((_, i) => !pairs[i].archived)
  const mark = Object.fromEntries((Object.keys(raws[0] ?? {}) as (keyof Rivalry['parts'])[]).map((k) => [k, pctl(ref.map((r) => r[k]), REF_PCTL)])) as Rivalry['parts']
  pairs.forEach((p, i) => {
    const r = raws[i]
    p.parts = {
      balance: rel(r.balance, mark.balance), closeness: rel(r.closeness, mark.closeness), stakes: rel(r.stakes, mark.stakes),
      volume: rel(r.volume, mark.volume), drama: rel(r.drama, mark.drama),
    }
    p.score = 100 * (W.balance * p.parts.balance + W.closeness * p.parts.closeness + W.stakes * p.parts.stakes + W.volume * p.parts.volume + W.drama * p.parts.drama)
    if (p.finals) p.tags.push('Title rivals')
    else if (p.playoff >= 2) p.tags.push('Playoff rivals')
    if (p.closeShare >= 0.35) p.tags.push('Nail-biters')
    if (p.blowouts >= 2) p.tags.push('Bad blood')
    if (p.trades >= 3) p.tags.push('Trade partners')
    if (p.games >= 4 && p.parts.balance < 0.35) p.tags.push('One-sided')
    if (p.longest.n >= 4) p.tags.push(`${p.longest.n}-game streak`)
  })
  return pairs.sort((x, y) => y.score - x.score)
}
