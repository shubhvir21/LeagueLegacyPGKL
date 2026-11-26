// The current week as the playoff simulation needs it, kept fresh while the page is open. It reads the same sources
// as the Live page (Sleeper matchups, the odds feed of Vegas player props, ESPN's list of finished games), so the week
// is projected from Vegas wherever the feed has a player and from Sleeper only for the rest. If any source fails it
// stays null and the simulation falls back to Sleeper's roster plan.
import { useEffect, useRef, useState } from 'react'
import { useLeague } from './data'
import { buildBenchLines, buildStarterLine, EMPTY_SLOT, fetchLiveFeed, fetchMatchups, fetchSleeperProjections, fetchRosters, fetchWeek, indexBySleeperId, indexGamesByTeam, normalizeTeam, pairMatchups } from './live'
import { lineupSlots } from './lineup'
import { DEFAULT_MODEL } from './model'
import type { PartialWeek } from './odds'
import { buildPartialWeek } from './partial'
import { playersOf } from './players'
import { selectWeekGames } from './scope'
import { applyFinals, fetchEspnSnapshot, parseFinishedTeams } from './situation'

const REFRESH_MS = 60_000

export function usePartialWeek(enabled: boolean): PartialWeek | null {
  const lg = useLeague()
  const [partial, setPartial] = useState<PartialWeek | null>(null)
  const lastKey = useRef('')

  useEffect(() => {
    if (!enabled) { setPartial(null); return }
    let alive = true
    const season = lg.seasons[0]
    const info = playersOf(lg).info
    const model = lg.raw.model ?? DEFAULT_MODEL
    const latest = lg.raw.seasons.at(-1)
    const slots = lineupSlots(latest?.league.roster_positions ?? [])
    const load = async () => {
      const week = await fetchWeek()
      const [matchups, rosters, projections, rawFeed, espn] = await Promise.all([
        fetchMatchups(week), fetchRosters(), fetchSleeperProjections(week), fetchLiveFeed(), fetchEspnSnapshot().catch(() => null),
      ])
      if (!alive || !season) return
      const dates = new Set(projections.gameDates)
      const feed = applyFinals(selectWeekGames(rawFeed, dates), espn ? parseFinishedTeams(espn.events, dates) : new Set())
      const live = indexBySleeperId(feed)
      const teamGames = indexGamesByTeam(feed)
      const ctx = {
        live, sleeperProjections: projections.points,
        gameOf: (id: string) => live.get(id)?.game ?? teamGames.get(normalizeTeam(info[id]?.team ?? '')) ?? null,
      }
      const sides = pairMatchups(matchups).flatMap(([a, b]) => [a, ...(b ? [b] : [])]).flatMap((m) => {
        const memberId = season.teamSeasons.find((t) => t.rosterId === m.roster_id)?.memberId
        return memberId ? [{
          memberId, slots,
          starters: m.starters.map((id, i) => (id === EMPTY_SLOT ? null : buildStarterLine(id, m.starters_points[i] ?? 0, ctx))),
          bench: buildBenchLines(m, rosters.find((r) => r.roster_id === m.roster_id), ctx),
          replacement: Object.fromEntries(Object.entries(latest?.projections?.repl?.[week] ?? {}).map(([pos, v]) => [pos, v * (model.pos[pos]?.bias ?? 1)])),
          pos: (id: string) => info[id]?.pos ?? 'WR',
          nflOf: (id: string) => { const t = live.get(id)?.row.team ?? info[id]?.team; return t ? normalizeTeam(t) : null },
        }] : []
      })
      const next = buildPartialWeek(week, sides, model)
      // The simulation is not cheap: only run it again when the week has moved by a point or more.
      const key = JSON.stringify(next, (_k, v) => (typeof v === 'number' ? Math.round(v) : v))
      if (key === lastKey.current) return
      lastKey.current = key
      setPartial(next)
    }
    const tick = () => { if (!document.hidden) load().catch(() => undefined) } // an extra on top of the published odds: if it fails the table stays as it was
    tick()
    const id = setInterval(tick, REFRESH_MS)
    return () => { alive = false; clearInterval(id) }
  }, [lg, enabled])

  return partial
}
