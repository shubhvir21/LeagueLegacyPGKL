// Tenures: who actually ran each franchise, season by season. Franchise ids (memberId) carry a
// team's whole history through takeovers; a manager id is the Sleeper account that ran it that
// season, so stats that belong to the person (not the team) can start fresh at a takeover.
//
// Accounts are compared, not names, so a display-name change isn't a takeover. Orphaned rosters
// (Sleeper dropped the owner) count as their own manager, id `roster-<first year>-<roster_id>`;
// give them a real name with `managerNames` in members.json.
import overrides from '../members.json'
import type { League } from './stats'

export interface Tenure {
  managerId: string
  memberId: string // franchise
  name: string
  from: number
  to: number
  orphan: boolean
}

const managerNames = (overrides as { managerNames?: Record<string, string> }).managerNames ?? {}

function build(lg: League) {
  const byMember: Record<string, Tenure[]> = {}
  const bySeason: Record<number, Record<string, Tenure>> = {}
  for (const s of [...lg.raw.seasons].sort((a, b) => Number(a.league.season) - Number(b.league.season))) {
    const year = Number(s.league.season)
    bySeason[year] = {}
    for (const r of s.rosters) {
      const memberId = lg.rosterOwner[year]?.[r.roster_id]
      if (!memberId) continue
      const runs = (byMember[memberId] ??= [])
      const last = runs.at(-1)
      const same = last && last.to === year - 1 && (r.owner_id ? last.managerId === r.owner_id : last.orphan)
      if (same) last.to = year
      else {
        const managerId = r.owner_id ?? `roster-${year}-${r.roster_id}`
        const name = managerNames[managerId]
          ?? (r.owner_id ? s.users.find((u) => u.user_id === r.owner_id)?.display_name : null)
          ?? 'an absentee owner'
        runs.push({ managerId, memberId, name, from: year, to: year, orphan: !r.owner_id })
      }
      bySeason[year][memberId] = runs.at(-1)!
    }
  }
  // The current manager's own display name (with any override) wins for their run.
  for (const [id, runs] of Object.entries(byMember)) {
    const cur = runs.at(-1)!
    if (cur.managerId === id && !managerNames[id]) cur.name = lg.memberById[id]?.name ?? cur.name
  }
  return { byMember, bySeason }
}

const cache = new WeakMap<League, ReturnType<typeof build>>()
const get = (lg: League) => {
  let t = cache.get(lg)
  if (!t) cache.set(lg, (t = build(lg)))
  return t
}

/** Every manager who has run this franchise, oldest first. */
export const tenures = (lg: League, memberId: string): Tenure[] => get(lg).byMember[memberId] ?? []
/** The tenure covering this franchise's season, or null if it didn't play. */
export const tenureOf = (lg: League, year: number, memberId: string): Tenure | null => get(lg).bySeason[year]?.[memberId] ?? null
/** The manager running this franchise that season. */
export const managerOf = (lg: League, year: number, memberId: string): string | null => tenureOf(lg, year, memberId)?.managerId ?? null
/** Whether that season belongs to the franchise's current manager. */
export const isCurrentTenure = (lg: League, year: number, memberId: string) => {
  const t = tenureOf(lg, year, memberId)
  return !!t && t === tenures(lg, memberId).at(-1)
}
/** Every takeover: the franchise changed managers going into `season`. */
export const takeovers = (lg: League) =>
  Object.values(get(lg).byMember).flatMap((runs) => runs.slice(1).map((t, i) => ({ season: t.from, memberId: t.memberId, from: runs[i], to: t })))
/** Whether both sides of a game were run by their franchise's current manager. */
export const currentEra = (lg: League, g: { season: number; a: string; b: string }) =>
  isCurrentTenure(lg, g.season, g.a) && isCurrentTenure(lg, g.season, g.b)
