// Franchise Valuation — what each franchise is worth, built from real fantasy results.
//
// After every completed season each franchise gets a Franchise Index (0–100) from six pillars,
// each scored against the other franchises active at that point (50 + 20·z, clamped 0–100):
//
//   Skill              40%  Elo rating at the end of the season
//   Trophy cabinet     30%  title 10 · runner-up 4 · third 2 · #1 seed 2 · points leader 2 · last −2
//   Sustained success  10%  playoff rate, average finish, career all-play % and win %
//   Legacy             10%  best single-season Team Rankings score, and seasons scored 85+
//   Momentum            5%  that season's Team Rankings score and Elo change over the season
//   Front office        5%  average Manager Score and lineup (coach) score
//
// The index is smoothed (70% this season, 30% last) so values don't lurch, then converted:
//   value = ($500M + index × $40M) × 1.07^(seasons since the league began)
import { franchiseElo } from './elo'
import { teamRankings } from './teamRank'
import { managementCached } from './management'
import type { League } from './stats'

export interface Pillar { key: string; label: string; weight: number; score: number; detail: string }
export interface Valuation {
  memberId: string
  year: number // value as of the end of this season
  value: number // $M
  index: number // 0–100, smoothed
  change: number | null // year-over-year %, null for first valued season
  pillars: Pillar[]
  elo: number
  titles: number
  playoffRate: number
  avgFinish: number
  bestSeason: number
  managerScore: number
}

export const PILLARS = [
  { key: 'skill', label: 'Skill', weight: 0.4 },
  { key: 'trophies', label: 'Trophy cabinet', weight: 0.3 },
  { key: 'sustained', label: 'Sustained success', weight: 0.1 },
  { key: 'legacy', label: 'Legacy', weight: 0.1 },
  { key: 'momentum', label: 'Momentum', weight: 0.05 },
  { key: 'office', label: 'Front office', weight: 0.05 },
] as const
const TROPHY = { title: 10, second: 4, third: 2, seed: 2, points: 2, last: -2 }
const BASE = 500, PER_POINT = 40, GROWTH = 1.07, SMOOTH = 0.7

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
/** Score each value against its peers: 50 is average, ±1 SD is ±20, clamped 0–100. */
function peer(values: number[]) {
  const mean = avg(values)
  const sd = Math.sqrt(avg(values.map((v) => (v - mean) ** 2))) || 1
  return values.map((v) => Math.max(0, Math.min(100, 50 + (20 * (v - mean)) / sd)))
}

export function valuations(lg: League): Record<string, Valuation[]> {
  const elo = franchiseElo(lg)
  const ranks = teamRankings(lg)
  const mgmt = managementCached(lg).filter((r) => !r.inProgress)
  const done = [...lg.seasons].filter((s) => s.complete).sort((a, b) => a.year - b.year)
  const first = done[0]?.year ?? 0
  const eloAt = (id: string, year: number) => elo.history[id]?.filter((p) => p.season <= year).at(-1)?.rating ?? null
  const out: Record<string, Valuation[]> = {}

  for (const s of done) {
    const upTo = done.filter((x) => x.year <= s.year)
    const ids = lg.members.map((m) => m.id).filter((id) => upTo.some((x) => x.teamSeasons.some((t) => t.memberId === id)))
    const raw = ids.map((id) => {
      const mine = upTo.map((x) => ({ s: x, t: x.teamSeasons.find((t) => t.memberId === id) })).filter((x) => x.t).map((x) => ({ s: x.s, t: x.t! }))
      const count = (f: (x: (typeof mine)[number]) => boolean) => mine.filter(f).length
      const leader = (x: (typeof mine)[number]) => [...x.s.teamSeasons].sort((a, b) => b.pf - a.pf)[0].memberId === id
      const titles = count((x) => x.t.finalRank === 1)
      const trophies = TROPHY.title * titles + TROPHY.second * count((x) => x.t.finalRank === 2) + TROPHY.third * count((x) => x.t.finalRank === 3) +
        TROPHY.seed * count((x) => x.t.regRank === 1) + TROPHY.points * count(leader) + TROPHY.last * count((x) => x.t.finalRank === x.s.teams)
      const ap = mine.reduce((a, x) => [a[0] + x.t.apW + x.t.apT / 2, a[1] + x.t.apW + x.t.apL + x.t.apT], [0, 0])
      const wl = mine.reduce((a, x) => [a[0] + x.t.wins + x.t.ties / 2, a[1] + x.t.wins + x.t.losses + x.t.ties], [0, 0])
      const playoffRate = count((x) => x.t.madePlayoffs) / mine.length
      const avgFinish = avg(mine.map((x) => x.t.finalRank ?? x.t.regRank))
      const scores = ranks.filter((r) => r.t.memberId === id && r.t.season <= s.year).map((r) => r.score)
      const bestSeason = Math.max(0, ...scores)
      const thisSeason = ranks.find((r) => r.t.memberId === id && r.t.season === s.year)?.score ?? null
      const end = eloAt(id, s.year), before = eloAt(id, s.year - 1)
      const m = mgmt.filter((r) => r.memberId === id && r.season <= s.year)
      return {
        id, titles, trophies, playoffRate, avgFinish, bestSeason, thisSeason,
        apPct: ap[1] ? ap[0] / ap[1] : 0, winPct: wl[1] ? wl[0] / wl[1] : 0,
        greats: scores.filter((x) => x >= 85).length, //valution of greats
        elo: end ?? 2000, eloChange: end != null ? end - (before ?? 2000) : 0,
        managerScore: m.length ? avg(m.map((r) => r.managerScore)) : 50,
        coachScore: m.length ? avg(m.map((r) => r.coachScore)) : 50,
      }
    })
    const col = (f: (r: (typeof raw)[number]) => number) => peer(raw.map(f)) //valuation of each pillar
    const skill = col((r) => r.elo)
    const trophies = col((r) => r.trophies)
    const [pr, fin, ap, win] = [col((r) => r.playoffRate), col((r) => -r.avgFinish), col((r) => r.apPct), col((r) => r.winPct)]
    const [best, greats] = [col((r) => r.bestSeason), col((r) => r.greats)]
    const avgScore = avg(raw.map((r) => r.thisSeason ?? 0).filter(Boolean))
    const [form, swing] = [col((r) => r.thisSeason ?? avgScore), col((r) => r.eloChange)]
    const [mgr, coach] = [col((r) => r.managerScore), col((r) => r.coachScore)]

    raw.forEach((r, i) => {
      const scores = {
        skill: skill[i],
        trophies: trophies[i],
        sustained: 0.3 * pr[i] + 0.3 * fin[i] + 0.25 * ap[i] + 0.15 * win[i],
        legacy: 0.6 * best[i] + 0.4 * greats[i],
        momentum: 0.5 * form[i] + 0.5 * swing[i],
        office: 0.5 * mgr[i] + 0.5 * coach[i],
      }
      const details: Record<string, string> = {
        skill: `${r.elo} Elo`,
        trophies: `${r.trophies} trophy points`,
        sustained: `${Math.round(r.playoffRate * 100)}% playoffs · avg finish ${r.avgFinish.toFixed(1)}`,
        legacy: `best season ${r.bestSeason.toFixed(1)}${r.greats ? ` · ${r.greats} season${r.greats > 1 ? 's' : ''} 85+` : ''}`,
        momentum: `${r.thisSeason != null ? `${s.year} score ${r.thisSeason.toFixed(1)} · ` : ''}Elo ${r.eloChange >= 0 ? '+' : '−'}${Math.abs(Math.round(r.eloChange))}`,
        office: `manager ${r.managerScore.toFixed(0)} · lineups ${r.coachScore.toFixed(0)}`,
      }
      const pillars: Pillar[] = PILLARS.map((p) => ({ ...p, score: scores[p.key], detail: details[p.key] }))
      const fresh = pillars.reduce((a, p) => a + p.weight * p.score, 0)
      const hist = (out[r.id] ??= [])
      const prev = hist.at(-1)
      const index = prev ? SMOOTH * fresh + (1 - SMOOTH) * prev.index : fresh
      const value = (BASE + PER_POINT * index) * GROWTH ** (s.year - first)
      hist.push({
        memberId: r.id, year: s.year, value, index, pillars,
        change: prev ? ((value - prev.value) / prev.value) * 100 : null,
        elo: r.elo, titles: r.titles, playoffRate: r.playoffRate, avgFinish: r.avgFinish,
        bestSeason: r.bestSeason, managerScore: r.managerScore,
      })
    })
  }
  return out
}

export const money = (m: number) => (m >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${Math.round(m)}M`)

const cache = new WeakMap<League, Record<string, Valuation[]>>()
export function valuationsOf(lg: League) {
  let v = cache.get(lg)
  if (!v) { v = valuations(lg); cache.set(lg, v) }
  return v
}
/** Latest valuation per member, ranked high to low. */
export function valuationTable(lg: League) {
  return Object.values(valuationsOf(lg)).map((h) => h.at(-1)!).sort((a, b) => b.value - a.value)
}
