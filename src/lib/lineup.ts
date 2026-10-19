// Optimal-lineup math shared by management metrics and transaction values.

export const FLEX: Record<string, string[]> = {
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

/** Starting slots for a season (bench / IR / taxi excluded). */
export const lineupSlots = (rosterPositions: string[]) => rosterPositions.filter((p) => p !== 'BN' && p !== 'IR' && p !== 'TAXI')
