// Rivalries: every pair of franchises scored 0–100 for how heated it is.
//
//   Balance     25%  how even the series is (1 − |W − L| / games)
//   Closeness   25%  half average margin (0 at 40+ pts), half share of games within 10
//   Stakes      20%  playoff meetings (3+ = full marks), a final counts double
//   Volume      15%  games played, relative to the most-played pair
//   Drama       15%  50-point blowouts (rename rights!) and trades with each other, 5+ = full
import type { Game, League } from './stats'
import { playersOf } from './players'

export interface Rivalry {
  a: string; b: string
  games: number; aW: number; bW: number; ties: number
  avgMargin: number; closeShare: number
  playoff: number; finals: number; blowouts: number; trades: number
  streak: { id: string | null; n: number } // current
  longest: { id: string | null; n: number }
  aBest: Game | null; bBest: Game | null // biggest win for each side (oriented a vs b)
  last: Game | null
  score: number
  parts: { balance: number; closeness: number; stakes: number; volume: number; drama: number }
  tags: string[]
}

export function rivalries(lg: League): Rivalry[] {
  const pm = playersOf(lg)
  const ids = lg.members.map((m) => m.id)
  const pairs: Rivalry[] = []
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j]
    const gs = lg.games
      .filter((g) => (g.a === a && g.b === b) || (g.a === b && g.b === a))
      .filter((g) => g.aPts > 0 || g.bPts > 0)
      .map((g) => (g.a === a ? g : { ...g, a: g.b, b: g.a, aPts: g.bPts, bPts: g.aPts }))
      .sort((x, y) => x.season - y.season || x.week - y.week)
    if (!gs.length) continue
    const win = (g: Game) => (g.aPts > g.bPts ? a : g.bPts > g.aPts ? b : null)
    let cur = { id: null as string | null, n: 0 }, longest = { id: null as string | null, n: 0 }
    for (const g of gs) {
      const w = win(g)
      cur = w && w === cur.id ? { id: w, n: cur.n + 1 } : { id: w, n: w ? 1 : 0 }
      if (cur.n > longest.n) longest = { ...cur }
    }
    const margins = gs.map((g) => Math.abs(g.aPts - g.bPts))
    const big = (side: string) => gs.filter((g) => win(g) === side).sort((x, y) => Math.abs(y.aPts - y.bPts) - Math.abs(x.aPts - x.bPts))[0] ?? null
    pairs.push({
      a, b, games: gs.length,
      aW: gs.filter((g) => win(g) === a).length, bW: gs.filter((g) => win(g) === b).length, ties: gs.filter((g) => !win(g)).length,
      avgMargin: margins.reduce((s, x) => s + x, 0) / gs.length,
      closeShare: margins.filter((x) => x < 10).length / gs.length,
      playoff: gs.filter((g) => g.playoff && g.bracket === 'winners').length,
      finals: gs.filter((g) => g.playoff && g.place === 1).length,
      blowouts: margins.filter((x) => x >= 50).length,
      trades: pm.trades.filter((t) => t.sides.some((s) => s.memberId === a) && t.sides.some((s) => s.memberId === b)).length,
      streak: cur, longest, aBest: big(a), bBest: big(b), last: gs.at(-1) ?? null,
      score: 0, parts: { balance: 0, closeness: 0, stakes: 0, volume: 0, drama: 0 }, tags: [],
    })
  }
  const maxGames = Math.max(1, ...pairs.map((p) => p.games))
  for (const p of pairs) {
    const decided = p.aW + p.bW || 1
    p.parts = {
      balance: 1 - Math.abs(p.aW - p.bW) / decided,
      closeness: 0.5 * Math.max(0, 1 - p.avgMargin / 40) + 0.5 * p.closeShare,
      stakes: Math.min(1, (p.playoff + p.finals) / 3),
      volume: p.games / maxGames,
      drama: Math.min(1, (p.blowouts + p.trades) / 5),
    }
    p.score = 100 * (0.25 * p.parts.balance + 0.25 * p.parts.closeness + 0.2 * p.parts.stakes + 0.15 * p.parts.volume + 0.15 * p.parts.drama)
    if (p.finals) p.tags.push('Title rivals')
    else if (p.playoff >= 2) p.tags.push('Playoff rivals')
    if (p.closeShare >= 0.35) p.tags.push('Nail-biters')
    if (p.blowouts >= 2) p.tags.push('Bad blood')
    if (p.trades >= 3) p.tags.push('Trade partners')
    if (p.games >= 4 && p.parts.balance < 0.35) p.tags.push('One-sided')
    if (p.longest.n >= 4) p.tags.push(`${p.longest.n}-game streak`)
  }
  return pairs.sort((x, y) => y.score - x.score)
}
