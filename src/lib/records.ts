// Record Book: ranked lists computed from the league model.
import { careers, fmt, pct, record, type Game, type League, type TeamSeason } from './stats'
import { gameOdds, UPSET_LINE, type GameOdds } from './upsets'

const UPSET_TIP = 'pre-game chance from projected lineups and form'

export interface RecordRow {
  memberId: string
  value: number
  display: string
  context: string // season / week / opponent
  link?: string
}
export interface RecordDef {
  id: string
  category: Category
  title: string
  desc: string
  positive: boolean // good thing to hold vs a blunder
  rows: RecordRow[] // best first
}
export const CATEGORIES = ['League', 'Season', 'Matchup', 'Streaks & Droughts', 'Milestones'] as const
export type Category = (typeof CATEGORIES)[number]

/** One row per team per week (both sides of every game). */
export interface TeamWeek {
  season: number
  week: number
  memberId: string
  oppId: string
  pts: number
  oppPts: number
  playoff: boolean
  bracket: Game['bracket']
}
export function teamWeeks(lg: League): TeamWeek[] {
  return lg.games.flatMap((g) => [
    { season: g.season, week: g.week, memberId: g.a, oppId: g.b, pts: g.aPts, oppPts: g.bPts, playoff: g.playoff, bracket: g.bracket },
    { season: g.season, week: g.week, memberId: g.b, oppId: g.a, pts: g.bPts, oppPts: g.aPts, playoff: g.playoff, bracket: g.bracket },
  ])
}

const top = <T,>(items: T[], f: (x: T) => number, asc = false, n = 25) =>
  [...items].sort((a, b) => (asc ? f(a) - f(b) : f(b) - f(a))).slice(0, n)

export function buildRecords(lg: League): RecordDef[] {
  const name = (id: string) => lg.memberById[id]?.name ?? '?'
  const cr = careers(lg)
  const tsAll = lg.seasons.flatMap((s) => s.teamSeasons)
  const tsDone = lg.seasons.filter((s) => s.complete).flatMap((s) => s.teamSeasons)
  const tw = teamWeeks(lg)
  const regTw = tw.filter((t) => !t.playoff)
  const defs: RecordDef[] = []
  const add = (category: Category, id: string, title: string, desc: string, positive: boolean, rows: RecordRow[]) =>
    defs.push({ id, category, title, desc, positive, rows })

  // ---------- League (career) ----------
  const career = (id: string, title: string, desc: string, positive: boolean, f: (r: (typeof cr)[number]) => number, show: (r: (typeof cr)[number]) => string, asc = false) =>
    add('League', id, title, desc, positive, top(cr, f, asc).map((r) => ({ memberId: r.member.id, value: f(r), display: show(r), context: `${r.seasons.length} seasons`, link: `/member/${r.member.id}` })))
  career('wins', 'Most Total Wins', 'All-time regular-season wins (incl. median).', true, (r) => r.wins, (r) => String(r.wins))
  career('losses', 'Most Total Losses', 'All-time regular-season losses (incl. median).', false, (r) => r.losses, (r) => String(r.losses))
  career('winpct', 'Best Win Percentage', 'All-time regular-season win %.', true, (r) => r.wins / (r.wins + r.losses + r.ties || 1), (r) => pct(r.wins, r.losses, r.ties))
  career('appct', 'Best All-Play Percentage', 'All-time all-play win %.', true, (r) => r.apW / (r.apW + r.apL + r.apT || 1), (r) => pct(r.apW, r.apL, r.apT))
  career('apwins', 'Most All-Play Wins', 'All-time all-play wins.', true, (r) => r.apW, (r) => String(r.apW))
  career('pf', 'Most Total Points', 'All-time regular-season points scored.', true, (r) => r.pf, (r) => fmt(r.pf))
  career('ppg', 'Best Points Per Game', 'All-time regular-season points per game.', true, (r) => r.pf / (r.games || 1), (r) => fmt(r.pf / (r.games || 1)))
  career('pa', 'Most Points Against', 'All-time regular-season points allowed.', false, (r) => r.pa, (r) => fmt(r.pa))
  career('titles', 'Most Championships', 'League titles won.', true, (r) => r.titles, (r) => String(r.titles))
  career('playoffs', 'Most Playoff Appearances', 'Seasons reaching the winners bracket.', true, (r) => r.playoffs, (r) => String(r.playoffs))
  career('pwins', 'Most Playoff Wins', 'Winners-bracket games won.', true, (r) => r.playoffW, (r) => String(r.playoffW))
  career('elo', 'Highest League Rating', 'Current 0–100 power rating.', true, (r) => r.elo, (r) => r.elo.toFixed(1))
  career('luck', 'Luckiest All-Time', 'Total luck (actual minus expected H2H wins).', true, (r) => careerSum(tsAll, r.member.id, (t) => t.luck), (r) => signed(careerSum(tsAll, r.member.id, (t) => t.luck)))
  career('unluck', 'Unluckiest All-Time', 'Lowest total luck.', false, (r) => careerSum(tsAll, r.member.id, (t) => t.luck), (r) => signed(careerSum(tsAll, r.member.id, (t) => t.luck)), true)
  career('highs', 'Most Weekly High Scores', 'Weeks finishing as the top scorer.', true, (r) => careerSum(tsAll, r.member.id, (t) => t.highScores), (r) => String(careerSum(tsAll, r.member.id, (t) => t.highScores)))

  // ---------- Season ----------
  const ctx = (t: TeamSeason) => `${t.season} · ${t.teamName}`
  const season = (id: string, title: string, desc: string, positive: boolean, pool: TeamSeason[], f: (t: TeamSeason) => number, show: (t: TeamSeason) => string, asc = false) =>
    add('Season', id, title, desc, positive, top(pool, f, asc).map((t) => ({ memberId: t.memberId, value: f(t), display: show(t), context: ctx(t), link: `/season/${t.season}/team/${t.memberId}` })))
  season('s-pf', 'Most Points in a Season', 'Regular-season points scored.', true, tsDone, (t) => t.pf, (t) => fmt(t.pf))
  season('s-pf-low', 'Fewest Points in a Season', 'Regular-season points scored.', false, tsDone, (t) => t.pf, (t) => fmt(t.pf), true)
  season('s-ppg', 'Best Points Per Game', 'Regular-season PPG (includes the current season).', true, tsAll, (t) => t.pf / (t.games || 1), (t) => fmt(t.pf / (t.games || 1)))
  season('s-wins', 'Most Wins in a Season', 'Regular-season wins incl. median.', true, tsDone, (t) => t.wins, (t) => record(t.wins, t.losses, t.ties))
  season('s-losses', 'Most Losses in a Season', 'Regular-season losses incl. median.', false, tsDone, (t) => t.losses, (t) => record(t.wins, t.losses, t.ties))
  season('s-ap', 'Best All-Play Season', 'All-play win %.', true, tsAll, (t) => t.apW / (t.apW + t.apL + t.apT || 1), (t) => `${record(t.apW, t.apL, t.apT)} (${pct(t.apW, t.apL, t.apT)})`)
  season('s-ap-low', 'Worst All-Play Season', 'All-play win %.', false, tsAll, (t) => t.apW / (t.apW + t.apL + t.apT || 1), (t) => `${record(t.apW, t.apL, t.apT)} (${pct(t.apW, t.apL, t.apT)})`, true)
  season('s-pa', 'Most Points Against', 'Regular-season points allowed.', false, tsDone, (t) => t.pa, (t) => fmt(t.pa))
  season('s-luck', 'Luckiest Season', 'Actual minus expected H2H wins.', true, tsAll, (t) => t.luck, (t) => signed(t.luck))
  season('s-unluck', 'Unluckiest Season', 'Actual minus expected H2H wins.', false, tsAll, (t) => t.luck, (t) => signed(t.luck), true)
  season('s-share', 'Highest Points Share', '% of all league points.', true, tsAll, (t) => t.pointsShare, (t) => `${t.pointsShare.toFixed(2)}%`)
  season('s-coach', 'Best Coach Score', 'Points ÷ max possible points.', true, tsAll.filter((t) => t.coachScore != null), (t) => t.coachScore!, (t) => t.coachScore!.toFixed(1))
  season('s-coach-low', 'Worst Coach Score', 'Points ÷ max possible points.', false, tsAll.filter((t) => t.coachScore != null), (t) => t.coachScore!, (t) => t.coachScore!.toFixed(1), true)
  season('s-score', 'Best Season Score', 'Composite season score.', true, tsDone, (t) => t.seasonScore, (t) => t.seasonScore.toFixed(1))
  season('s-highs', 'Most High Scores in a Season', 'Weeks as top scorer.', true, tsAll, (t) => t.highScores, (t) => String(t.highScores))

  // ---------- Matchup ----------
  const wkCtx = (t: TeamWeek) => `${t.season} W${t.week} vs ${name(t.oppId)}${t.bracket === 'winners' ? ' (playoffs)' : ''}`
  const weekly = (id: string, title: string, desc: string, positive: boolean, pool: TeamWeek[], f: (t: TeamWeek) => number, asc = false) =>
    add('Matchup', id, title, desc, positive, top(pool, f, asc).map((t) => ({ memberId: t.memberId, value: f(t), display: fmt(f(t)), context: wkCtx(t), link: `/versus/${t.memberId}/${t.oppId}` })))
  const realTw = tw.filter((t) => t.pts > 0)
  weekly('m-high', 'Most Points in a Matchup', 'Single-week score.', true, realTw, (t) => t.pts)
  weekly('m-low', 'Fewest Points in a Matchup', 'Single-week score.', false, realTw, (t) => t.pts, true)
  weekly('m-blowout', 'Biggest Blowout', 'Margin of victory.', true, realTw.filter((t) => t.pts > t.oppPts), (t) => t.pts - t.oppPts)
  weekly('m-close', 'Closest Win', 'Smallest margin of victory.', true, realTw.filter((t) => t.pts > t.oppPts), (t) => t.pts - t.oppPts, true)
  weekly('m-hiloss', 'Highest Score in a Loss', 'Most points while losing.', false, realTw.filter((t) => t.pts < t.oppPts), (t) => t.pts)
  weekly('m-lowin', 'Lowest Score in a Win', 'Fewest points while winning.', true, realTw.filter((t) => t.pts > t.oppPts), (t) => t.pts, true)
  const games = lg.games.filter((g) => g.aPts > 0 && g.bPts > 0)
  const gameRow = (g: Game, v: number): RecordRow => {
    const [w, l] = g.aPts >= g.bPts ? [g.a, g.b] : [g.b, g.a]
    return { memberId: w, value: v, display: fmt(v), context: `${g.season} W${g.week} · ${name(w)} vs ${name(l)}`, link: `/versus/${w}/${l}` }
  }
  add('Matchup', 'm-combined', 'Highest Combined Score', 'Both teams together.', true, top(games, (g) => g.aPts + g.bPts).map((g) => gameRow(g, g.aPts + g.bPts)))
  add('Matchup', 'm-combined-low', 'Lowest Combined Score', 'Both teams together.', false, top(games, (g) => g.aPts + g.bPts, true).map((g) => gameRow(g, g.aPts + g.bPts)))

  // ---------- Upsets ----------
  const odds = gameOdds(lg).filter((o) => o.winner)
  const pctStr = (p: number) => `${Math.round(p * 100)}%`
  const oddsCtx = (o: GameOdds, side: string) =>
    `${o.g.season} ${o.g.playoff ? `playoffs W${o.g.week}` : `W${o.g.week}`} vs ${name(side === o.winner ? o.loser! : o.winner!)} · proj ${fmt(side === o.g.a ? o.expA : o.expB, 1)}–${fmt(side === o.g.a ? o.expB : o.expA, 1)}`
  add('Matchup', 'm-upset', 'Biggest Upsets', `Wins with the lowest pre-game win chance (${UPSET_TIP}).`, true,
    top(odds, (o) => o.pWinner, true).map((o) => ({ memberId: o.winner!, value: o.pWinner, display: `${pctStr(o.pWinner)} chance`, context: oddsCtx(o, o.winner!), link: `/versus/${o.winner}/${o.loser}` })))
  add('Matchup', 'm-choke', 'Biggest Chokes', `Losses as the heaviest pre-game favorite (${UPSET_TIP}).`, false,
    top(odds, (o) => 1 - o.pWinner).map((o) => ({ memberId: o.loser!, value: 1 - o.pWinner, display: `${pctStr(1 - o.pWinner)} favorite`, context: oddsCtx(o, o.loser!), link: `/versus/${o.loser}/${o.winner}` })))
  const upsets = odds.filter((o) => o.pWinner < UPSET_LINE)
  const count = (key: (o: GameOdds) => string) => upsets.reduce<Record<string, number>>((m, o) => { m[key(o)] = (m[key(o)] ?? 0) + 1; return m }, {})
  const careerUp = count((o) => o.winner!), careerDown = count((o) => o.loser!)
  const ids = lg.members.map((m) => m.id)
  add('League', 'upset-wins', 'Most Upset Wins', `Career wins with under a ${pctStr(UPSET_LINE)} pre-game chance.`, true,
    top(ids, (id) => careerUp[id] ?? 0).filter((id) => careerUp[id]).map((id) => ({ memberId: id, value: careerUp[id], display: String(careerUp[id]), context: `best: ${pctStr(Math.min(...upsets.filter((o) => o.winner === id).map((o) => o.pWinner)))} chance`, link: `/member/${id}` })))
  add('League', 'upset-losses', 'Most Upset Losses', `Career losses with over a ${pctStr(1 - UPSET_LINE)} pre-game chance.`, false,
    top(ids, (id) => careerDown[id] ?? 0).filter((id) => careerDown[id]).map((id) => ({ memberId: id, value: careerDown[id], display: String(careerDown[id]), context: `worst: lost at ${pctStr(Math.max(...upsets.filter((o) => o.loser === id).map((o) => 1 - o.pWinner)))}`, link: `/member/${id}` })))
  const seasonUp = Object.entries(count((o) => `${o.g.season}|${o.winner}`))
  add('Season', 's-upsets', 'Most Upset Wins in a Season', `Wins with under a ${pctStr(UPSET_LINE)} pre-game chance.`, true,
    top(seasonUp, ([, n]) => n).map(([k, n]) => { const [y, id] = k.split('|'); return { memberId: id, value: n, display: String(n), context: y, link: `/season/${y}/team/${id}` } }))

  // ---------- Streaks & droughts ----------
  const members = cr.map((r) => r.member.id)
  const streakRows = (pred: (t: TeamWeek) => boolean, pool: TeamWeek[]) =>
    members.flatMap((id) => runs(pool.filter((t) => t.memberId === id), pred).map((r) => ({ memberId: id, value: r.len, display: String(r.len), context: `${r.from} → ${r.to}${r.active ? ' (active)' : ''}` })))
  const ordered = [...regTw].sort((a, b) => a.season - b.season || a.week - b.week)
  add('Streaks & Droughts', 'st-win', 'Longest Winning Streak', 'Consecutive regular-season H2H wins.', true, top(streakRows((t) => t.pts > t.oppPts, ordered), (r) => r.value))
  add('Streaks & Droughts', 'st-loss', 'Longest Losing Streak', 'Consecutive regular-season H2H losses.', false, top(streakRows((t) => t.pts < t.oppPts, ordered), (r) => r.value))
  const medianOf: Record<string, number> = {}
  for (const key of new Set(ordered.map((t) => `${t.season}-${t.week}`))) {
    const pts = ordered.filter((t) => `${t.season}-${t.week}` === key).map((t) => t.pts).sort((a, b) => a - b)
    medianOf[key] = (pts[Math.floor((pts.length - 1) / 2)] + pts[Math.ceil((pts.length - 1) / 2)]) / 2
  }
  const aboveMed = (t: TeamWeek) => t.pts > medianOf[`${t.season}-${t.week}`]
  add('Streaks & Droughts', 'st-med', 'Longest Streak Beating the Median', 'Consecutive weeks above the league median.', true, top(streakRows(aboveMed, ordered), (r) => r.value))
  add('Streaks & Droughts', 'st-med-low', 'Longest Streak Below the Median', 'Consecutive weeks at or below the median.', false, top(streakRows((t) => !aboveMed(t), ordered), (r) => r.value))
  const seasonRuns = (pred: (t: TeamSeason) => boolean) =>
    members.flatMap((id) => {
      const seq = [...lg.seasons].reverse().filter((s) => s.complete).map((s) => ({ s: s.year, t: s.teamSeasons.find((t) => t.memberId === id) }))
      const out: RecordRow[] = []
      let len = 0, from = 0
      seq.forEach((x, i) => {
        if (x.t && pred(x.t)) { if (!len) from = x.s; len++ }
        if (!(x.t && pred(x.t)) || i === seq.length - 1) {
          if (len) out.push({ memberId: id, value: len, display: `${len} season${len > 1 ? 's' : ''}`, context: `${from} → ${from + len - 1}` })
          len = 0
        }
      })
      return out
    })
  add('Streaks & Droughts', 'st-po', 'Consecutive Playoff Appearances', 'Back-to-back winners-bracket trips.', true, top(seasonRuns((t) => t.madePlayoffs), (r) => r.value))
  add('Streaks & Droughts', 'st-nopo', 'Playoff Drought', 'Consecutive seasons missing the playoffs.', false, top(seasonRuns((t) => !t.madePlayoffs), (r) => r.value))

  // ---------- Milestones ----------
  const milestone = (id: string, title: string, step: number, f: (r: (typeof cr)[number]) => number, unit: string) =>
    add('Milestones', id, title, `Next milestone every ${step.toLocaleString()} ${unit}.`, true, top(cr, f).map((r) => {
      const v = f(r), next = (Math.floor(v / step) + 1) * step
      return { memberId: r.member.id, value: v, display: Math.round(v).toLocaleString(), context: `${Math.ceil(next - v).toLocaleString()} away from ${next.toLocaleString()}`, link: `/member/${r.member.id}` }
    }))
  milestone('ms-wins', 'Total Wins', 25, (r) => r.wins, 'wins')
  milestone('ms-ap', 'All-Play Wins', 100, (r) => r.apW, 'all-play wins')
  milestone('ms-pts', 'Total Points', 1000, (r) => r.pf, 'points')

  return defs
}

function careerSum(ts: TeamSeason[], id: string, f: (t: TeamSeason) => number) {
  return ts.filter((t) => t.memberId === id).reduce((a, t) => a + f(t), 0)
}
const signed = (n: number) => (n > 0 ? '+' : '') + fmt(n)

function runs(seq: TeamWeek[], pred: (t: TeamWeek) => boolean) {
  const out: { len: number; from: string; to: string; active: boolean }[] = []
  let len = 0, start: TeamWeek | null = null
  seq.forEach((t, i) => {
    if (pred(t)) { if (!len) start = t; len++ }
    const end = !pred(t) || i === seq.length - 1
    if (end && len) {
      const last = pred(t) ? t : seq[i - 1]
      out.push({ len, from: `${start!.season} W${start!.week}`, to: `${last.season} W${last.week}`, active: pred(t) && i === seq.length - 1 })
      len = 0
    }
  })
  return out
}

/** Members holding the #1 spot (ties included) and top-25 appearances per record. */
export function recordHolders(defs: RecordDef[]) {
  const t: Record<string, { pos: number; neg: number; posTop: number; negTop: number }> = {}
  for (const d of defs) {
    if (d.category === 'Milestones') continue
    const best = d.rows[0]?.value
    for (const r of d.rows) {
      const x = (t[r.memberId] ??= { pos: 0, neg: 0, posTop: 0, negTop: 0 })
      if (d.positive) x.posTop++; else x.negTop++
      if (r.value === best) { if (d.positive) x.pos++; else x.neg++ }
    }
  }
  return t
}
