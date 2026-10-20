// Runs playoff simulations off the main thread so the page stays responsive.
import { buildLeague, type League } from './stats'
import { oddsHistory, playoffOdds } from './odds'
import type { RawData } from './sleeper'

let lg: League | null = null
export type OddsRequest = { id: number; raw?: RawData; kind: 'hist' | 'odds'; year: number; week?: number }

self.onmessage = (e: MessageEvent<OddsRequest>) => {
  const { id, raw, kind, year, week } = e.data
  if (raw) lg = buildLeague(raw)
  if (!lg) return
  const res = kind === 'hist' ? oddsHistory(lg, year) : playoffOdds(lg, year, week)
  self.postMessage({ id, kind, year, week, res })
}
