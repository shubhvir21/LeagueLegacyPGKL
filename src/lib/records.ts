// Record Book: ranked lists computed from the league model.
import { careers, fmt, ordinal, pct, record, type Game, type League, type TeamSeason } from './stats'
import { gameOdds, UPSET_LINE, type GameOdds } from './upsets'
import { franchiseElo } from './elo'
import { managementCached, managementCareer } from './management'

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
    add('League', id, title, desc, positive, top(cr, f, asc).map((r) => ({ memberId: r.member.id, value: f(r), display: show(r), context: detail[id]?.(r) ?? `${r.seasons.length} seasons`, link: `/member/${r.member.id}` })))
  // Rates need a real sample: one completed season for the regular season, three playoff games for the playoffs.
  const crFull = cr.filter((r) => r.seasons.some((y) => lg.seasons.find((s) => s.year === y)?.complete))
  const crPo = cr.filter((r) => r.playoffW + r.playoffL >= 3)
  const careerOf = (pool: typeof cr, id: string, title: string, desc: string, positive: boolean, f: (r: (typeof cr)[number]) => number, show: (r: (typeof cr)[number]) => string, asc = false) =>
    add('League', id, title, desc, positive, top(pool, f, asc).map((r) => ({ memberId: r.member.id, value: f(r), display: show(r), context: detail[id]?.(r) ?? `${r.seasons.length} seasons`, link: `/member/${r.member.id}` })))
  const winPct = (r: (typeof cr)[number]) => r.wins / (r.wins + r.losses + r.ties || 1)
  const apPct = (r: (typeof cr)[number]) => r.apW / (r.apW + r.apL + r.apT || 1)
  const ppg = (r: (typeof cr)[number]) => r.pf / (r.games || 1)
  const poPct = (r: (typeof cr)[number]) => r.playoffW / (r.playoffW + r.playoffL || 1)
  const done = lg.seasons.filter((s) => s.complete)
  const podiums = (id: string) => done.filter((s) => [s.champion, s.runnerUp, s.third].includes(id)).length
  const coachOf = (id: string) => { const ts = tsAll.filter((t) => t.memberId === id && t.maxPf); const max = ts.reduce((a, t) => a + t.maxPf!, 0); return max ? (ts.reduce((a, t) => a + t.pf, 0) / max) * 100 : 0 }
  const mgr = Object.fromEntries(managementCareer(managementCached(lg).filter((r) => !r.inProgress)).map((r) => [r.memberId, r.managerScore]))
  const crMgr = cr.filter((r) => mgr[r.member.id] != null)
  // Weekly low score: the bottom regular-season score of the week.
  const weekLow: Record<string, number> = {}
  for (const t of regTw.filter((t) => t.pts > 0)) { const k = `${t.season}|${t.week}`; weekLow[k] = Math.min(weekLow[k] ?? Infinity, t.pts) }
  const lows = (id: string) => regTw.filter((t) => t.memberId === id && t.pts > 0 && t.pts === weekLow[`${t.season}|${t.week}`]).length
  // Toilet bowl: the lower score advances, so every losers-bracket game you scored less in counts.
  const toiletLosses = (id: string) => tw.filter((t) => t.memberId === id && t.bracket === 'losers' && t.pts > 0 && t.pts < t.oppPts).length

  // Supporting detail shown next to each career value.
  const mine = (id: string) => tsAll.filter((t) => t.memberId === id).sort((a, b) => a.season - b.season)
  const years = (xs: number[]) => [...xs].sort((a, b) => a - b).join(', ') || '—'
  const bestSeason = (id: string, f: (t: TeamSeason) => number, sign: 1 | -1) => { const t = [...mine(id)].sort((a, b) => sign * (f(b) - f(a)))[0]; return t ? `${signed(f(t))} in ${t.season}` : '' }
  const week = (id: string, sign: 1 | -1) => { const t = regTw.filter((x) => x.memberId === id && x.pts > 0).sort((a, b) => sign * (b.pts - a.pts))[0]; return t ? `${fmt(t.pts)} · ${t.season} W${t.week}` : '' }
  const leaguePpg = cr.reduce((a, r) => a + r.pf, 0) / (cr.reduce((a, r) => a + r.games, 0) || 1)
  const mgrRow = Object.fromEntries(managementCareer(managementCached(lg).filter((r) => !r.inProgress)).map((r) => [r.memberId, r]))
  const pts = (n: number) => `${n >= 0 ? '+' : ''}${fmt(n, 0)}`
  const detail: Record<string, (r: (typeof cr)[number]) => string> = {
    winpct: (r) => record(r.wins, r.losses, r.ties),
    'winpct-low': (r) => record(r.wins, r.losses, r.ties),
    appct: (r) => `${record(r.apW, r.apL, r.apT)} all-play`,
    'appct-low': (r) => `${record(r.apW, r.apL, r.apT)} all-play`,
    ppg: (r) => `${fmt(r.pf, 0)} pts`,
    'ppg-low': (r) => `${fmt(r.pf, 0)} pts`,
    titles: (r) => years(done.filter((s) => s.champion === r.member.id).map((s) => s.year)),
    podiums: (r) => [...done].sort((a, b) => a.year - b.year).filter((s) => [s.champion, s.runnerUp, s.third].includes(r.member.id)).map((s) => `${ordinal(s.champion === r.member.id ? 1 : s.runnerUp === r.member.id ? 2 : 3)} ${s.year}`).join(' · ') || '—',
    playoffs: (r) => years(mine(r.member.id).filter((t) => t.madePlayoffs).map((t) => t.season)),
    'popct-low': (r) => years(mine(r.member.id).filter((t) => t.madePlayoffs).map((t) => t.season)),
    pwins: (r) => `${record(r.playoffW, r.playoffL)} in the playoffs`,
    avgfinish: (r) => mine(r.member.id).filter((t) => done.some((s) => s.year === t.season) && t.finalRank).map((t) => ordinal(t.finalRank!)).join(' · '),
    coach: (r) => `${fmt(mine(r.member.id).reduce((a, t) => a + (t.maxPf ? t.maxPf - t.pf : 0), 0), 0)} pts left on bench`,
    luck: (r) => `best: ${bestSeason(r.member.id, (t) => t.luck, 1)}`,
    unluck: (r) => `worst: ${bestSeason(r.member.id, (t) => t.luck, -1)}`,
    highs: (r) => `best: ${week(r.member.id, 1)}`,
    lows: (r) => `worst: ${week(r.member.id, -1)}`,
    papg: (r) => `${signed(r.pa / (r.games || 1) - leaguePpg)} vs league avg`,
    toilet: (r) => years([...new Set(tw.filter((t) => t.memberId === r.member.id && t.bracket === 'losers' && t.pts > 0 && t.pts < t.oppPts).map((t) => t.season))]),
    'mgr-low': (r) => { const m = mgrRow[r.member.id]; return m ? `lineups ${fmt(m.coachScore, 0)} · waivers ${pts(m.waiverValue)} pts/yr · trades ${pts(m.tradeValue)} pts/yr` : '' },
  }

  careerOf(crFull, 'winpct', 'Best Win Percentage', 'All-time regular-season win % (incl. median). Needs a completed season.', true, winPct, (r) => pct(r.wins, r.losses, r.ties))
  careerOf(crFull, 'appct', 'Best All-Play Percentage', 'All-time all-play win %. Needs a completed season.', true, apPct, (r) => pct(r.apW, r.apL, r.apT))
  careerOf(crFull, 'ppg', 'Best Points Per Game', 'All-time regular-season points per game. Needs a completed season.', true, ppg, (r) => fmt(ppg(r)))
  career('titles', 'Most Championships', 'League titles won.', true, (r) => r.titles, (r) => String(r.titles))
  career('podiums', 'Most Podium Finishes', 'Seasons finishing 1st, 2nd or 3rd.', true, (r) => podiums(r.member.id), (r) => String(podiums(r.member.id)))
  career('playoffs', 'Most Playoff Appearances', 'Seasons reaching the winners bracket.', true, (r) => r.playoffs, (r) => String(r.playoffs))
  career('pwins', 'Most Playoff Wins', 'Winners-bracket games won.', true, (r) => r.playoffW, (r) => String(r.playoffW))
  careerOf(cr.filter((r) => r.avgFinish != null), 'avgfinish', 'Best Average Finish', 'Average final place across completed seasons.', true, (r) => r.avgFinish!, (r) => r.avgFinish!.toFixed(1), true)
  career('coach', 'Best Career Coach Score', 'All-time points ÷ max possible points from your rosters.', true, (r) => coachOf(r.member.id), (r) => coachOf(r.member.id).toFixed(1))
  career('luck', 'Luckiest All-Time', 'Total luck (actual minus expected H2H wins).', true, (r) => careerSum(tsAll, r.member.id, (t) => t.luck), (r) => signed(careerSum(tsAll, r.member.id, (t) => t.luck)))
  career('highs', 'Most Weekly High Scores', 'Weeks finishing as the top scorer.', true, (r) => careerSum(tsAll, r.member.id, (t) => t.highScores), (r) => String(careerSum(tsAll, r.member.id, (t) => t.highScores)))

  careerOf(crFull, 'winpct-low', 'Worst Win Percentage', 'All-time regular-season win % (incl. median). Needs a completed season.', false, winPct, (r) => pct(r.wins, r.losses, r.ties), true)
  careerOf(crFull, 'appct-low', 'Worst All-Play Percentage', 'All-time all-play win %. Needs a completed season.', false, apPct, (r) => pct(r.apW, r.apL, r.apT), true)
  careerOf(crFull, 'ppg-low', 'Worst Points Per Game', 'All-time regular-season points per game. Needs a completed season.', false, ppg, (r) => fmt(ppg(r)), true)
  careerOf(crFull, 'papg', 'Most Points Against Per Game', 'All-time regular-season points allowed per game. The schedule hated you.', false, (r) => r.pa / (r.games || 1), (r) => fmt(r.pa / (r.games || 1)))
  careerOf(crPo, 'popct-low', 'Worst Playoff Win Percentage', 'Winners-bracket record. Needs 3+ playoff games.', false, poPct, (r) => record(r.playoffW, r.playoffL), true)
  career('toilet', 'Most Toilet Bowl Losses', 'Toilet bowl games where you scored less, semifinals and finals.', false, (r) => toiletLosses(r.member.id), (r) => String(toiletLosses(r.member.id)))
  career('lows', 'Most Weekly Low Scores', 'Weeks finishing as the bottom scorer.', false, (r) => lows(r.member.id), (r) => String(lows(r.member.id)))
  careerOf(crMgr, 'mgr-low', 'Worst Manager Score', 'Career average Manager Score (lineups, waivers and trades, 0–100).', false, (r) => mgr[r.member.id], (r) => mgr[r.member.id].toFixed(0), true)
  career('unluck', 'Unluckiest All-Time', 'Lowest total luck.', false, (r) => careerSum(tsAll, r.member.id, (t) => t.luck), (r) => signed(careerSum(tsAll, r.member.id, (t) => t.luck)), true)

  // ---------- Season ----------
  const inProgress = new Set(lg.seasons.filter((x) => !x.complete).map((x) => x.year))
  const ctx = (t: TeamSeason) => `${t.season} · ${t.teamName}${inProgress.has(t.season) ? ' (in progress)' : ''}`
  const season = (id: string, title: string, desc: string, positive: boolean, pool: TeamSeason[], f: (t: TeamSeason) => number, show: (t: TeamSeason) => string, asc = false) =>
    add('Season', id, title, desc, positive, top(pool, f, asc).map((t) => ({ memberId: t.memberId, value: f(t), display: show(t), context: ctx(t), link: `/season/${t.season}/team/${t.memberId}` })))
  season('s-ppg', 'Best Points Per Game', 'Regular-season PPG (includes the current season).', true, tsAll, (t) => t.pf / (t.games || 1), (t) => fmt(t.pf / (t.games || 1)))
  season('s-winpct', 'Best Win Percentage', 'Regular-season win % incl. median (includes the current season).', true, tsAll, (t) => t.wins / (t.wins + t.losses + t.ties || 1), (t) => `${record(t.wins, t.losses, t.ties)} (${pct(t.wins, t.losses, t.ties)})`)
  season('s-winpct-low', 'Worst Win Percentage', 'Regular-season win % incl. median (includes the current season).', false, tsAll, (t) => t.wins / (t.wins + t.losses + t.ties || 1), (t) => `${record(t.wins, t.losses, t.ties)} (${pct(t.wins, t.losses, t.ties)})`, true)
  season('s-ap', 'Best All-Play Season', 'All-play win %.', true, tsAll, (t) => t.apW / (t.apW + t.apL + t.apT || 1), (t) => `${record(t.apW, t.apL, t.apT)} (${pct(t.apW, t.apL, t.apT)})`)
  season('s-ap-low', 'Worst All-Play Season', 'All-play win %.', false, tsAll, (t) => t.apW / (t.apW + t.apL + t.apT || 1), (t) => `${record(t.apW, t.apL, t.apT)} (${pct(t.apW, t.apL, t.apT)})`, true)
  season('s-pa', 'Most Points Against', 'Regular-season points allowed.', false, tsDone, (t) => t.pa, (t) => fmt(t.pa))
  season('s-luck', 'Luckiest Season', 'Actual minus expected H2H wins.', true, tsAll, (t) => t.luck, (t) => signed(t.luck))
  season('s-unluck', 'Unluckiest Season', 'Actual minus expected H2H wins.', false, tsAll, (t) => t.luck, (t) => signed(t.luck), true)
  season('s-coach', 'Best Coach Score', 'Points ÷ max possible points.', true, tsAll.filter((t) => t.coachScore != null), (t) => t.coachScore!, (t) => t.coachScore!.toFixed(1))
  season('s-coach-low', 'Worst Coach Score', 'Points ÷ max possible points.', false, tsAll.filter((t) => t.coachScore != null), (t) => t.coachScore!, (t) => t.coachScore!.toFixed(1), true)
  season('s-score', 'Best Season Score', 'Team Rankings season score.', true, tsDone, (t) => t.seasonScore ?? 0, (t) => (t.seasonScore ?? 0).toFixed(1))
  season('s-highs', 'Most High Scores in a Season', 'Weeks as top scorer.', true, tsAll, (t) => t.highScores, (t) => String(t.highScores))
  const ppgOf = (t: TeamSeason) => t.pf / (t.games || 1)
  const seasonOf = (y: number) => lg.seasons.find((x) => x.year === y)!
  const champs = tsDone.filter((t) => seasonOf(t.season).champion === t.memberId)
  season('s-cinderella', 'Cinderella Champion', 'Lowest regular-season seed to win the title.', true, champs, (t) => t.regRank, (t) => `#${t.regRank} seed`)
  const runPpg = (t: TeamSeason) => { const gs = tw.filter((x) => x.season === t.season && x.memberId === t.memberId && x.bracket === 'winners' && x.pts > 0); return gs.reduce((a, x) => a + x.pts, 0) / (gs.length || 1) }
  season('s-run', 'Best Playoff Run', 'Points per game on the way to a title.', true, champs, runPpg, (t) => fmt(runPpg(t)))
  season('s-median', 'Best Record vs Median', 'Weeks beating the league median.', true, tsAll, (t) => t.medW, (t) => record(t.medW, t.medL))
  const mgrSeasons = managementCached(lg)
  const mgrPool = tsAll.filter((t) => mgrSeasons.some((m) => m.season === t.season && m.memberId === t.memberId))
  const mgrOf = (t: TeamSeason) => mgrSeasons.find((m) => m.season === t.season && m.memberId === t.memberId)!
  season('s-mgr', 'Best Manager Score', 'Single-season Manager Score (lineups, waivers and trades, 0–100).', true, mgrPool, (t) => mgrOf(t).managerScore, (t) => mgrOf(t).managerScore.toFixed(0))

  season('s-ppg-low', 'Worst Points Per Game', 'Regular-season PPG (includes the current season).', false, tsAll, ppgOf, (t) => fmt(ppgOf(t)), true)
  season('s-score-low', 'Worst Season Score', 'Team Rankings season score.', false, tsDone, (t) => t.seasonScore ?? 0, (t) => (t.seasonScore ?? 0).toFixed(1), true)
  const seasonLows = (t: TeamSeason) => regTw.filter((x) => x.season === t.season && x.memberId === t.memberId && x.pts > 0 && x.pts === weekLow[`${x.season}|${x.week}`]).length
  season('s-lows', 'Most Low Scores in a Season', 'Weeks as bottom scorer.', false, tsAll, seasonLows, (t) => String(seasonLows(t)))
  season('s-miss', 'Best Team to Miss the Playoffs', 'Highest regular-season PPG without making the playoffs.', false, tsDone.filter((t) => !t.madePlayoffs), ppgOf, (t) => fmt(ppgOf(t)))
  season('s-bench', 'Most Points Left on the Bench', 'Optimal lineup points minus actual points.', false, mgrPool, (t) => mgrOf(t).benchPts, (t) => fmt(mgrOf(t).benchPts))
  season('s-lineup', 'Most Lineup Losses', 'Losses your best possible lineup would have won.', false, mgrPool, (t) => mgrOf(t).lineupLosses, (t) => String(mgrOf(t).lineupLosses))

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

  // ---------- Elo ----------
  const elo = franchiseElo(lg)
  const eloIds = Object.keys(elo.history)
  const when = (p: { season: number; week: number }) => (p.week ? `${p.season} W${p.week}` : `${p.season} start`)
  add('League', 'elo-peak', 'Highest Peak Elo', 'Best Elo rating ever reached.', true,
    top(eloIds, (id) => elo.peak[id]?.rating ?? 0).map((id) => ({ memberId: id, value: elo.peak[id].rating, display: String(elo.peak[id].rating), context: when(elo.peak[id]), link: `/member/${id}` })))
  add('League', 'elo-low', 'Lowest Elo Ever', 'Worst Elo rating ever reached.', false,
    top(eloIds, (id) => elo.low[id]?.rating ?? 9999, true).map((id) => ({ memberId: id, value: elo.low[id].rating, display: String(elo.low[id].rating), context: when(elo.low[id]), link: `/member/${id}` })))
  const eloWeeks = eloIds.flatMap((id) => elo.history[id].slice(1).map((p, i) => ({ id, p, d: p.rating - elo.history[id][i].rating, prev: elo.history[id][i] })).filter((x) => x.prev.season === x.p.season))
  const finishOf = (id: string, season: number) => elo.finishes.find((f) => f.memberId === id && f.season === season)
  add('Matchup', 'elo-gain', 'Biggest Single-Week Elo Gain', 'Most Elo gained in one week (season finales include the finish payout).', true,
    top(eloWeeks, (x) => x.d).map((x) => { const f = finishOf(x.id, x.p.season); const fin = f && x.p.week === Math.max(...elo.history[x.id].filter((q) => q.season === x.p.season).map((q) => q.week)); return { memberId: x.id, value: x.d, display: `+${x.d}`, context: `${x.p.season} W${x.p.week}${fin ? ` · finished ${f!.place === 1 ? '1st' : f!.place === 2 ? '2nd' : f!.place === 3 ? '3rd' : `${f!.place}th`}` : ''}`, link: `/member/${x.id}` } }))
  const seasonSwing = eloIds.flatMap((id) => [...new Set(elo.history[id].map((p) => p.season))].map((y) => {
    const h = elo.history[id].filter((p) => p.season === y)
    return { id, y, d: h.at(-1)!.rating - h[0].rating }
  }))
  add('Season', 'elo-rise', 'Biggest Elo Rise in a Season', 'Elo gained from the start of a season to the end.', true,
    top(seasonSwing, (x) => x.d).filter((x) => x.d > 0).map((x) => ({ memberId: x.id, value: x.d, display: `+${x.d}`, context: String(x.y), link: `/season/${x.y}/team/${x.id}` })))
  add('Season', 'elo-fall', 'Biggest Elo Drop in a Season', 'Elo lost from the start of a season to the end.', false,
    top(seasonSwing, (x) => x.d, true).filter((x) => x.d < 0).map((x) => ({ memberId: x.id, value: x.d, display: String(x.d), context: String(x.y), link: `/season/${x.y}/team/${x.id}` })))
  const weeksAtTop: Record<string, number> = {}
  const allKeys = [...new Set(Object.values(elo.history).flat().filter((p) => p.week > 0).map((p) => p.season * 100 + p.week))]
  for (const k of allKeys) {
    const pts = eloIds.map((id) => ({ id, r: elo.history[id].find((p) => p.season * 100 + p.week === k)?.rating })).filter((x) => x.r != null)
    const best = pts.sort((a, b) => b.r! - a.r!)[0]
    if (best) weeksAtTop[best.id] = (weeksAtTop[best.id] ?? 0) + 1
  }
  add('Streaks & Droughts', 'elo-top', 'Most Weeks as No. 1 in Elo', 'Weeks holding the league\'s top Elo rating.', true,
    top(Object.keys(weeksAtTop), (id) => weeksAtTop[id]).map((id) => ({ memberId: id, value: weeksAtTop[id], display: String(weeksAtTop[id]), context: 'weeks', link: `/member/${id}` })))

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
  const milestone = (id: string, title: string, step: number, f: (r: (typeof cr)[number]) => number, unit: string, positive = true) =>
    add('Milestones', id, title, `Next milestone every ${step.toLocaleString()} ${unit}.`, positive, top(cr, f).map((r) => {
      const v = f(r), next = (Math.floor(v / step) + 1) * step
      return { memberId: r.member.id, value: v, display: Math.round(v).toLocaleString(), context: `${Math.ceil(next - v).toLocaleString()} away from ${next.toLocaleString()}`, link: `/member/${r.member.id}` }
    }))
  milestone('ms-wins', 'Total Wins', 25, (r) => r.wins, 'wins')
  milestone('ms-ap', 'All-Play Wins', 100, (r) => r.apW, 'all-play wins')
  milestone('ms-pts', 'Total Points', 1000, (r) => r.pf, 'points')
  milestone('ms-losses', 'Total Losses', 25, (r) => r.losses, 'losses', false)
  milestone('ms-aplosses', 'All-Play Losses', 100, (r) => r.apL, 'all-play losses', false)
  milestone('ms-pa', 'Total Points Against', 1000, (r) => r.pa, 'points allowed', false)

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
