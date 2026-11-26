// Turns the live view of a week in progress into what the playoff simulation needs: per team, the points already
// scored and the players still to come, so Thursday's result counts before Tuesday.
//
// A player's slot is locked once his game starts. Everyone else is still movable, so the open slots are refilled with
// the best unplayed players on the roster (starters and bench), the way the roster plan does for future weeks.
import { unknownShare, type StarterLine } from './live'
import { posSd, type OddsModel } from './model'
import { pickLineup, type PartialTeam, type PartialWeek } from './odds'

export interface PartialSide {
  memberId: string
  /** Starting slots in order (QB, RB, FLEX, ...), aligned with `starters`. */
  slots: string[]
  /** What is in each slot right now; null for an empty slot. */
  starters: (StarterLine | null)[]
  bench: StarterLine[]
  /** Points of the best free player at each position, already corrected for projection bias: the pickup for an open slot. */
  replacement: Record<string, number>
  pos: (playerId: string) => string
  /** The player's NFL team, so teammates share a correlated draw; null when unknown. */
  nflOf: (playerId: string) => string | null
}

const hasStarted = (line: StarterLine) => line.game !== null && line.game.status !== 'scheduled'

export function buildPartialWeek(week: number, sides: PartialSide[], model: OddsModel): PartialWeek {
  const nfl = new Map<string, number>()
  const indexOf = (team: string | null) => (team === null ? -1 : nfl.get(team) ?? (nfl.set(team, nfl.size), nfl.size - 1))
  const teams: Record<string, PartialTeam> = {}
  for (const side of sides) {
    const locked = side.starters.filter((l): l is StarterLine => l !== null && hasStarted(l))
    const openSlots = side.slots.filter((_, i) => !(side.starters[i] && hasStarted(side.starters[i]!)))
    const pool: { pos: string; m: number; line: StarterLine | null }[] = [...side.starters, ...side.bench]
      .filter((l): l is StarterLine => l !== null && !hasStarted(l) && l.projected > 0)
      .map((line) => ({ pos: side.pos(line.playerId), m: line.projected, line }))
    for (const [pos, m] of Object.entries(side.replacement)) if (m > 0) pool.push({ pos, m, line: null })
    const refilled = pickLineup(openSlots, pool)

    let fixed = 0
    let open = 0
    const starters: PartialTeam['starters'] = []
    const add = (pos: string, projected: number, actual: number, share: number, team: string | null) => {
      fixed += actual
      open += share
      if (share > 0) starters.push({ m: Math.max(0, projected - actual), sd: posSd(model, pos, projected) * Math.sqrt(share), nfl: indexOf(team) })
    }
    for (const l of locked) add(side.pos(l.playerId), l.projected, l.actual, unknownShare(l), side.nflOf(l.playerId))
    for (const p of refilled) add(p.pos, p.m, 0, 1, p.line ? side.nflOf(p.line.playerId) : null)
    teams[side.memberId] = { fixed, starters, open: side.slots.length ? Math.min(1, open / side.slots.length) : 0 }
  }
  return { week, teams }
}
