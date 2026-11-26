// Turns the live view of a week in progress into what the playoff simulation needs: per team, the points already
// scored and the starters whose games are still to come, so Thursday's result counts before Tuesday.
import { unknownShare, type StarterLine } from './live'
import { posSd, type OddsModel } from './model'
import type { PartialTeam, PartialWeek } from './odds'

export interface PartialSide {
  memberId: string
  lines: StarterLine[]
  pos: (playerId: string) => string
  /** The player's NFL team, so teammates share a correlated draw; null when unknown. */
  nflOf: (playerId: string) => string | null
}

export function buildPartialWeek(week: number, sides: PartialSide[], model: OddsModel): PartialWeek {
  const nfl = new Map<string, number>()
  const indexOf = (team: string | null) => (team === null ? -1 : nfl.get(team) ?? (nfl.set(team, nfl.size), nfl.size - 1))
  const teams: Record<string, PartialTeam> = {}
  for (const side of sides) {
    let fixed = 0
    let open = 0
    const starters: PartialTeam['starters'] = []
    for (const line of side.lines) {
      fixed += line.actual
      const share = unknownShare(line)
      open += share
      if (share <= 0) continue
      starters.push({
        m: Math.max(0, line.projected - line.actual),
        sd: posSd(model, side.pos(line.playerId), line.projected) * Math.sqrt(share),
        nfl: indexOf(side.nflOf(line.playerId)),
      })
    }
    teams[side.memberId] = { fixed, starters, open: side.lines.length ? open / side.lines.length : 0 }
  }
  return { week, teams }
}
