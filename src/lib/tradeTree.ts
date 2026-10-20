// Trade trees: follow everything a franchise got in a trade until it leaves — traded again
// (and then follow what came back), dropped, not kept at the next draft, or still rostered.
// Draft picks are followed to the player they became.
import type { League } from './stats'
import { playersOf, type Trade, type TradeSide } from './players'

export type Fate =
  | { kind: 'traded'; node: TradeNode; repeat?: boolean } // repeat: same deal as a sibling asset, shown once
  | { kind: 'dropped'; season: number; week: number }
  | { kind: 'expired'; season: number } // not kept going into the next season
  | { kind: 'held' } // still on the roster
  | { kind: 'drafted'; players: string[]; node: AssetNode | null } // pick used
  | { kind: 'pending' } // pick not used yet

export interface AssetNode {
  kind: 'player' | 'pick'
  id: string // player id or pick label like "2025 R3"
  holder: string
  pts: number // started points for the holder while he had it
  kept: number[] // seasons the holder kept him
  fate: Fate
}
export interface TradeNode { trade: Trade; side: TradeSide; got: AssetNode[]; gave: string[] }

type Ev = { season: number; week: number; created: number }
const key = (e: { season: number; week: number }) => e.season * 100 + e.week

export function buildTrees(lg: League) {
  const pm = playersOf(lg)
  const current = Math.max(...lg.seasons.map((s) => s.year))
  const keptBy = new Set(pm.picks.filter((p) => p.keeper).map((p) => `${p.season}|${p.memberId}|${p.playerId}`))
  const ptsOf = (pid: string, member: string, from: number, to: number) =>
    pm.weeks.reduce((a, w) => (w.playerId === pid && w.memberId === member && w.started && key(w) >= from && key(w) < to ? a + w.pts : a), 0)

  function player(pid: string, holder: string, start: Ev, depth: number, seen: Set<string>): AssetNode {
    const after = (e: Ev) => e.created > start.created || (start.created === 0 && e.season >= start.season)
    const trade = pm.trades.find((t) => after(t) && t.sides.some((s) => s.memberId === holder && s.gives.includes(pid)))
    const drop = pm.drops.find((d) => after(d) && d.memberId === holder && d.playerId === pid && !pm.trades.some((t) => t.created === d.created))
    const exit = [trade, drop].filter(Boolean).sort((a, b) => a!.created - b!.created)[0] as Ev | undefined
    const kept: number[] = []
    let fate: Fate | null = null
    let end = Infinity
    for (let s = start.season; ; s++) {
      if (exit && exit.season === s) break
      if (s >= current) { fate = { kind: 'held' }; break }
      if (keptBy.has(`${s + 1}|${holder}|${pid}`)) { kept.push(s + 1); continue }
      if (exit && exit.season === s + 1 && exit.week <= 1) break
      fate = { kind: 'expired', season: s }
      end = (s + 1) * 100
      break
    }
    if (!fate) {
      end = key(exit!)
      if (exit === trade) fate = traded(trade!, holder, depth, seen)
      else fate = { kind: 'dropped', season: drop!.season, week: drop!.week }
    }
    return { kind: 'player', id: pid, holder, pts: Math.round(ptsOf(pid, holder, key(start), end) * 100) / 100, kept, fate }
  }

  function pick(label: string, holder: string, start: Ev, depth: number, seen: Set<string>): AssetNode {
    const [yr, rd] = [Number(label.slice(0, 4)), Number(label.split('R')[1])]
    const trade = pm.trades.find((t) => t.created > start.created && t.sides.some((s) => s.memberId === holder && s.picksOut.includes(label)))
    let fate: Fate
    let pts = 0
    if (trade) fate = traded(trade, holder, depth, seen)
    else {
      const used = pm.picks.filter((p) => p.season === yr && p.round === rd && p.memberId === holder && !p.keeper)
      if (!used.length) fate = pm.picks.some((p) => p.season === yr) ? { kind: 'drafted', players: [], node: null } : { kind: 'pending' }
      else {
        // With two picks in one round we can't tell which was the acquired one, so only follow a lone pick.
        const node = used.length === 1 ? player(used[0].playerId, holder, { season: yr, week: 0, created: 0 }, depth, seen) : null
        pts = node?.pts ?? 0
        fate = { kind: 'drafted', players: used.map((p) => p.playerId), node }
      }
    }
    return { kind: 'pick', id: label, holder, pts, kept: [], fate }
  }

  function traded(t: Trade, holder: string, depth: number, seen: Set<string>): Fate {
    const k = `${t.created}|${holder}`
    const repeat = seen.has(k)
    seen.add(k)
    return { kind: 'traded', node: repeat ? { trade: t, side: t.sides.find((s) => s.memberId === holder)!, got: [], gave: [] } : tradeNode(t, holder, depth + 1, seen), repeat }
  }

  function tradeNode(t: Trade, holder: string, depth: number, seen: Set<string>): TradeNode {
    const side = t.sides.find((s) => s.memberId === holder)!
    const got = depth > 8 ? [] : [
      ...side.gets.map((pid) => player(pid, holder, t, depth, seen)),
      ...side.picksIn.map((l) => pick(l, holder, t, depth, seen)),
    ]
    return { trade: t, side, got, gave: [...side.gives, ...side.picksOut] }
  }

  return { pm, tree: (t: Trade, holder: string) => tradeNode(t, holder, 0, new Set([`${t.created}|${holder}`])) }
}

/** Total started points a franchise got out of a trade tree, and how many assets it touched. */
export function treeTotals(n: TradeNode): { pts: number; assets: number; depth: number } {
  let pts = 0, assets = 0, depth = 0
  for (const a of n.got) {
    pts += a.pts; assets++
    const sub = a.fate.kind === 'traded' ? a.fate.node : a.fate.kind === 'drafted' && a.fate.node?.fate.kind === 'traded' ? a.fate.node.fate.node : null
    if (sub) { const s = treeTotals(sub); pts += s.pts; assets += s.assets; depth = Math.max(depth, s.depth + 1) }
  }
  return { pts: Math.round(pts * 100) / 100, assets, depth }
}

const cache = new WeakMap<League, ReturnType<typeof buildTrees>>()
export function treesOf(lg: League) {
  let m = cache.get(lg)
  if (!m) cache.set(lg, (m = buildTrees(lg)))
  return m
}
