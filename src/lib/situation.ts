// Live game situation (clock, possession, down & distance) from ESPN's public scoreboard, which allows browser CORS.
// The odds Worker only knows score and quarter, so this is a separate, display-only feed keyed by NFL team.
import { normalizeTeam } from './live'

const SCOREBOARD_URL = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'

export interface GameSituation {
  clock: string // e.g. "9:17"
  period: number
  isHalftime: boolean
  downDistance: string | null // e.g. "1st & Goal at SF 1"; null between plays (timeout, punt, kickoff)
  possessionTeam: string | null // normalized abbreviation of the team with the ball
  isRedZone: boolean
}

interface EspnCompetitor { id: string; team: { abbreviation: string } }
interface EspnEvent {
  status: { displayClock: string; period: number; type: { state: string; name: string } }
  competitions: {
    competitors: EspnCompetitor[]
    situation?: { downDistanceText?: string; possession?: string; isRedZone?: boolean }
  }[]
}

export function parseSituations(events: EspnEvent[]): Map<string, GameSituation> {
  const out = new Map<string, GameSituation>()
  for (const event of events) {
    if (event.status.type.state !== 'in') continue
    const comp = event.competitions[0]
    const possessor = comp.competitors.find((c) => c.id === comp.situation?.possession)
    const situation: GameSituation = {
      clock: event.status.displayClock,
      period: event.status.period,
      isHalftime: event.status.type.name === 'STATUS_HALFTIME',
      downDistance: comp.situation?.downDistanceText ?? null,
      possessionTeam: possessor ? normalizeTeam(possessor.team.abbreviation) : null,
      isRedZone: comp.situation?.isRedZone ?? false,
    }
    for (const c of comp.competitors) out.set(normalizeTeam(c.team.abbreviation), situation)
  }
  return out
}

export async function fetchSituations(): Promise<Map<string, GameSituation>> {
  const res = await fetch(SCOREBOARD_URL)
  if (!res.ok) throw new Error(`ESPN scoreboard returned ${res.status}, expected 200`)
  const body = (await res.json()) as { events: EspnEvent[] }
  return parseSituations(body.events)
}
