// The weekly newsletter: a recap of the latest finished week, records and milestones it produced,
// the standings after it, and a preview of the next slate. Everything is written from the data,
// so a new issue appears on its own once Sleeper finalizes a week (Monday night → Tuesday).
import { headToHead, type League } from './stats'
import { playersOf, playerName } from './players'
import { buildRecords } from './records'
import { buildMilestones } from './milestones'
import { playoffOdds } from './odds'
import { gameOdds } from './upsets'

export interface RecapGame { winner: string; loser: string; wPts: number; lPts: number; text: string; playoff: boolean }
export interface StandRow { memberId: string; rank: number; move: number; w: number; l: number; t: number; pf: number; odds: number | null; oddsMove: number | null }
export interface Note { memberId: string; memberId2?: string; text: string; good: boolean }
export interface PreviewGame { a: string; b: string; pA: number; projA: number; projB: number; text: string; playoff: boolean }
export interface Issue {
  year: number; week: number; no: number; date: Date
  headline: string; lede: string[]
  games: RecapGame[]
  standings: StandRow[]
  records: Note[]
  milestones: Note[]
  preview: PreviewGame[]; nextWeek: number | null; gameOfWeek: PreviewGame | null
}

const f1 = (n: number) => n.toFixed(1)
const pick = <T,>(xs: T[], seed: number) => xs[Math.abs(seed) % xs.length]
const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`
const rec = (w: number, l: number, t: number) => `${w}-${l}${t ? `-${t}` : ''}`
// Normal CDF approximation for win odds from projected points (weekly score sd ≈ 25 per team).
const phi = (z: number) => 1 / (1 + Math.exp(-1.702 * z))

/** Most recent Tuesday on or before now: the issue's publish date. */
function tuesday(now = new Date()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() - 2 + 7) % 7))
  return d
}

/** The current issue, or null outside weeks 1–17 of a season in progress. */
export function currentIssue(lg: League): Issue | null {
  const s = lg.seasons[0]
  if (!s || s.complete) return null
  const year = s.year
  const week = Math.max(0, ...lg.games.filter((g) => g.season === year).map((g) => g.week))
  if (week < 1 || week > 17) return null
  const nm = (id: string) => lg.memberById[id]?.name ?? id
  const pm = playersOf(lg)
  const games = lg.games.filter((g) => g.season === year && g.week === week)

  // ---- Records through each week (h2h + median), for the standings and "now 6-2" lines ----
  const medianOn = s.teamSeasons.some((t) => t.medW + t.medL > 0)
  const through = (wk: number) => {
    const r: Record<string, { w: number; l: number; t: number; pf: number }> = {}
    for (const t of s.teamSeasons) r[t.memberId] = { w: 0, l: 0, t: 0, pf: 0 }
    for (let w = 1; w <= wk; w++) {
      const gs = lg.games.filter((g) => g.season === year && g.week === w && !g.playoff)
      if (!gs.length) continue
      const pts = gs.flatMap((g) => [g.aPts, g.bPts]).sort((a, b) => b - a)
      const line = (pts[Math.floor(pts.length / 2) - 1] + pts[Math.floor(pts.length / 2)]) / 2
      for (const g of gs) {
        for (const [id, p, o] of [[g.a, g.aPts, g.bPts], [g.b, g.bPts, g.aPts]] as const) {
          const x = (r[id] ??= { w: 0, l: 0, t: 0, pf: 0 })
          x.pf += p
          if (p > o) x.w++; else if (p < o) x.l++; else x.t++
          if (medianOn) { if (p > line) x.w++; else x.l++ }
        }
      }
    }
    return r
  }
  const now = through(week), before = through(week - 1)
  const rankOf = (r: ReturnType<typeof through>) => Object.fromEntries(
    Object.entries(r).sort(([, a], [, b]) => b.w - a.w || a.l - b.l || b.pf - a.pf).map(([id], i) => [id, i + 1]),
  )
  const rNow = rankOf(now), rBefore = rankOf(before)

  // ---- Top performer per team this week ----
  const star = (id: string) => pm.weeks
    .filter((w) => w.season === year && w.week === week && w.memberId === id && w.started)
    .sort((a, b) => b.pts - a.pts)[0]

  // ---- Game recaps ----
  const odds = gameOdds(lg).filter((o) => o.g.season === year && o.g.week === week)
  const recap: RecapGame[] = games.map((g, i) => {
    const aWon = g.aPts >= g.bPts
    const [w, l, wp, lp] = aWon ? [g.a, g.b, g.aPts, g.bPts] : [g.b, g.a, g.bPts, g.aPts]
    const m = wp - lp
    const verb = m < 3 ? pick(['survived', 'escaped', 'squeaked past'], i + week) : m < 10 ? pick(['edged', 'held off', 'got past'], i + week) : m < 30 ? pick(['beat', 'handled', 'took care of'], i + week) : pick(['crushed', 'ran over', 'blew out'], i + week)
    const st = star(w)
    const o = odds.find((x) => x.g === g)
    const upset = o && o.winner === w && o.pWinner < 0.4 ? ` as a ${Math.round((1 - o.pWinner) * 100)}% underdog` : ''
    const label = g.playoff ? (g.bracket === 'winners' ? (g.place === 1 ? 'In the championship, ' : 'In the playoffs, ') : 'In the toilet bowl, ') : ''
    const after = !g.playoff && now[w] ? ` to move to ${rec(now[w].w, now[w].l, now[w].t)}` : ''
    const text = `${label}${nm(w)} ${verb} ${nm(l)} ${f1(wp)}–${f1(lp)}${upset}${after}.${st ? ` ${playerName(pm, st.playerId)} led the way with ${f1(st.pts)}.` : ''}`
    return { winner: w, loser: l, wPts: wp, lPts: lp, text, playoff: g.playoff }
  }).sort((a, b) => (b.wPts - b.lPts) - (a.wPts - a.lPts))

  // ---- Headline and lede ----
  const sides = games.flatMap((g) => [{ id: g.a, pts: g.aPts, opp: g.b, oppPts: g.bPts }, { id: g.b, pts: g.bPts, opp: g.a, oppPts: g.aPts }])
  const top = [...sides].sort((a, b) => b.pts - a.pts)[0]
  const low = [...sides].sort((a, b) => a.pts - b.pts)[0]
  const close = [...recap].sort((a, b) => (a.wPts - a.lPts) - (b.wPts - b.lPts))[0]
  const blow = recap[0]
  const upsetGame = [...odds].filter((o) => o.winner && o.pWinner < 0.4).sort((a, b) => a.pWinner - b.pWinner)[0]
  const leader = Object.entries(rNow).find(([, r]) => r === 1)?.[0]
  const headline = upsetGame
    ? `${nm(upsetGame.winner!)} stuns ${nm(upsetGame.loser!)}`
    : blow && blow.wPts - blow.lPts >= 40
      ? `${nm(blow.winner)} flattens ${nm(blow.loser)}`
      : top ? `${nm(top.id)} puts up ${f1(top.pts)} to own week ${week}` : `Week ${week} in the books`
  const lede: string[] = []
  if (top) lede.push(`${nm(top.id)} owned week ${week} with ${f1(top.pts)}, the top score in the league${top.pts > top.oppPts ? '' : ', and somehow still lost'}. At the other end, ${nm(low.id)} managed just ${f1(low.pts)}${low.pts < low.oppPts ? '' : ' and still won'}.`)
  if (close && blow && close !== blow) lede.push(`The tightest finish was ${nm(close.winner)} over ${nm(close.loser)} by ${f1(close.wPts - close.lPts)}, while ${nm(blow.winner)} won the biggest blowout by ${f1(blow.wPts - blow.lPts)}.`)
  if (leader) {
    const r = now[leader]
    lede.push(rBefore[leader] === 1 ? `${nm(leader)} stays on top of the standings at ${rec(r.w, r.l, r.t)}.` : `${nm(leader)} takes over first place at ${rec(r.w, r.l, r.t)}.`)
  }

  // ---- Playoff odds and movement ----
  const regWeeks = Math.max(0, ...lg.games.filter((g) => g.season === year && !g.playoff).map((g) => g.week))
  const inPlayoffs = games.some((g) => g.playoff)
  const oNow = inPlayoffs ? null : playoffOdds(lg, year)
  const oBefore = inPlayoffs || week < 2 ? null : playoffOdds(lg, year, week - 1)
  const standings: StandRow[] = Object.keys(now).map((id) => {
    const o = oNow?.teams.find((t) => t.memberId === id)?.playoff ?? null
    const ob = oBefore?.teams.find((t) => t.memberId === id)?.playoff ?? null
    return { memberId: id, rank: rNow[id], move: week > 1 ? rBefore[id] - rNow[id] : 0, ...now[id], odds: o, oddsMove: o != null && ob != null ? o - ob : null }
  }).sort((a, b) => a.rank - b.rank)

  // ---- New records and top-3 entries set this week ----
  const tag = new RegExp(`\\b${year} W${week}\\b`)
  const records: Note[] = []
  for (const d of buildRecords(lg)) {
    d.rows.slice(0, 3).forEach((r, i) => {
      if (!tag.test(r.context)) return
      const first = d.rows.findIndex((x) => x.value === r.value) + 1
      const where = first === 1 ? (d.positive ? 'set a new league record' : 'set a new chud-cord') : `moved into ${ord(first)} all-time`
      records.push({ memberId: r.memberId, memberId2: r.memberId2, good: d.positive, text: `${where}: ${d.title} (${r.display})` })
    })
  }

  // ---- Milestones reached this week ----
  const milestones: Note[] = []
  for (const race of buildMilestones(lg)) {
    for (const m of race.marks) {
      for (const f of m.finishers) {
        if (f.season !== year || f.week !== week) continue
        milestones.push({ memberId: f.memberId, good: race.positive, text: `reached ${m.mark.toLocaleString()} ${race.unit}, ${f.place === 1 ? 'the first to get there' : `${ord(f.place)} to get there`} (${f.weeks} weeks)` })
      }
    }
  }

  // ---- Next week preview ----
  const nextWeeks = lg.schedule.filter((g) => g.season === year && g.week > week).map((g) => g.week)
  const nextWeek = nextWeeks.length && week < 17 ? Math.min(...nextWeeks) : null
  const proj = (id: string) => oNow?.teams.find((t) => t.memberId === id)?.rating ?? (now[id] ? now[id].pf / Math.max(1, week) : 120)
  // Before the bracket is set, Sleeper's playoff-week pairings are placeholders; skip them.
  const slate = nextWeek == null ? [] : lg.schedule.filter((g) => g.season === year && g.week === nextWeek && (!g.playoff || inPlayoffs || regWeeks >= nextWeek - 1))
  const preview: PreviewGame[] = slate.map((g) => {
    const pa = proj(g.a), pb = proj(g.b)
    const pA = phi((pa - pb) / 35)
    const h = headToHead(lg, g.a, g.b)
    const fav = pA >= 0.5 ? g.a : g.b
    const series = h.w + h.l + h.t === 0 ? 'First ever meeting.' : h.w === h.l ? `The all-time series is tied ${rec(h.w, h.l, h.t)}.` : `${nm(h.w > h.l ? g.a : g.b)} leads the all-time series ${h.w > h.l ? rec(h.w, h.l, h.t) : rec(h.l, h.w, h.t)}.`
    const stakes = !g.playoff && now[g.a] && now[g.b] ? ` ${nm(g.a)} (${rec(now[g.a].w, now[g.a].l, now[g.a].t)}) vs ${nm(g.b)} (${rec(now[g.b].w, now[g.b].l, now[g.b].t)}).` : ''
    const text = `${nm(fav)} is projected to win ${f1(Math.max(pa, pb))}–${f1(Math.min(pa, pb))} (${Math.round(Math.max(pA, 1 - pA) * 100)}%).${stakes} ${series}`
    return { a: g.a, b: g.b, pA, projA: pa, projB: pb, text, playoff: g.playoff }
  })
  const gameOfWeek = [...preview].sort((x, y) => Math.abs(x.pA - 0.5) - Math.abs(y.pA - 0.5) || (y.projA + y.projB) - (x.projA + x.projB))[0] ?? null

  return { year, week, no: week, date: tuesday(), headline, lede, games: recap, standings, records, milestones, preview, nextWeek, gameOfWeek }
}
