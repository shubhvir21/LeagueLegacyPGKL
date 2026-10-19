// Pulls every season from Sleeper and writes the committed snapshot.
// Run: npm run sync   (also used by the scheduled GitHub Action in Phase 4)
import { writeFileSync, mkdirSync } from 'node:fs'
import { fetchAll } from '../src/lib/sleeper.ts'
import { buildLeague } from '../src/lib/stats.ts'

const raw = await fetchAll()
const lg = buildLeague(raw) // sanity check that it computes
mkdirSync('public/data', { recursive: true })
writeFileSync('public/data/league.json', JSON.stringify(raw))
console.log(`Synced ${raw.seasons.length} seasons (${lg.games.length} games) at ${raw.syncedAt}`)
