// Pulls every season from Sleeper, fits the playoff-odds model, and writes the committed snapshot.
// Run: npm run sync   (also run nightly by the GitHub Action)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fetchAll, type RawData } from '../src/lib/sleeper.ts'
import { buildLeague } from '../src/lib/stats.ts'
import { DEFAULT_MODEL, fitPlayers, type OddsModel } from '../src/lib/model.ts'
import { backtest, fitResid } from '../src/lib/odds.ts'

const FILE = 'public/data/league.json'
const prev = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as RawData) : undefined
const raw = await fetchAll(prev)
const lg = buildLeague(raw)

// Fit player spread / bias / correlation, then the leftover team noise, then pick the
// roster-vs-scoring blend that best predicted past seasons.
const t0 = Date.now()
let model: OddsModel = { ...DEFAULT_MODEL, ...fitPlayers(lg), fittedAt: raw.syncedAt }
model.resid = fitResid(lg, model)
const bt = backtest(lg, model, [null, 0.3, 0.5, 0.7, 0.85, 1])
const best = bt.variants.filter((v) => v.weight != null).sort((a, b) => a.brier - b.brier)[0]
model = { ...model, rosterWeight: best?.weight ?? DEFAULT_MODEL.rosterWeight, backtest: bt }
raw.model = model
console.log(`Model fit in ${Date.now() - t0}ms from ${model.samples} player-weeks: rho ${model.rho}, resid ${model.resid}, weight ${model.rosterWeight}`)
for (const v of bt.variants) console.log(`  ${v.name.padEnd(13)} brier ${v.brier}  logloss ${v.logLoss}`)
console.log(`  baseline      brier ${bt.baseline}`)

mkdirSync('public/data', { recursive: true })
writeFileSync(FILE, JSON.stringify(raw))
console.log(`Synced ${raw.seasons.length} seasons (${lg.games.length} games) at ${raw.syncedAt}`)
