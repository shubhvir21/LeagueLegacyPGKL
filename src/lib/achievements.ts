// Badges: achievements (good) and blunders (bad), earned from weekly results and seasons.
import { teamWeeks } from './records'
import type { League } from './stats'

export interface Badge { id: string; name: string; icon: string; kind: 'achievement' | 'blunder'; desc: string }
export interface Earned { badge: Badge; memberId: string; season: number; week: number | null; detail: string }

const B = (id: string, name: string, icon: string, kind: Badge['kind'], desc: string): Badge => ({ id, name, icon, kind, desc })
export const BADGES = {
  top: B('top', 'Top Dog', '🐶', 'achievement', 'Highest score of the week.'),
  low: B('low', 'True Lowlight', '🔦', 'blunder', 'Lowest score of the week.'),
  doubleUp: B('double-up', 'Double Up', '✌️', 'achievement', 'Scored at least double your opponent.'),
  doubled: B('doubled', 'Doubled Up', '🫠', 'blunder', 'Opponent scored at least double you.'),
  century: B('century', 'Big Number', '💯', 'achievement', 'Scored 175+ points in a week.'),
  sub80: B('sub80', 'Sub-80 Club', '🧊', 'blunder', 'Scored under 80 points in a week.'),
  nailbiter: B('nailbiter', 'A Small Victory', '😅', 'achievement', 'Won by less than 3 points.'),
  heartbreak: B('heartbreak', 'A Small Defeat', '💔', 'blunder', 'Lost by less than 3 points.'),
  blowout: B('blowout', 'Blowout', '💣', 'achievement', 'Won by 60+ points.'),
  stolen: B('stolen', 'Stole One', '🦹', 'achievement', 'Won with a bottom-3 score of the week.'),
  robbed: B('robbed', 'Robbed', '🚔', 'blunder', 'Lost with a top-3 score of the week.'),
  sweep: B('sweep', 'Clean Sweep', '🧹', 'achievement', 'Beat your opponent and the median with the top score.'),
  winStreak: B('win-streak', 'Heater', '🔥', 'achievement', 'Won 5 straight head-to-head games.'),
  loseStreak: B('lose-streak', 'Ice Cold', '🥶', 'blunder', 'Lost 5 straight head-to-head games.'),
  champ: B('champ', 'Champion', '🏆', 'achievement', 'Won the league.'),
  runnerUp: B('runner-up', 'So Close', '🥈', 'achievement', 'Finished runner-up.'),
  playoffs: B('playoffs', 'Playoff Bound', '🎟', 'achievement', 'Made the playoffs.'),
  regChamp: B('reg-champ', 'Regular Season Champ', '🥇', 'achievement', 'Finished first in the regular season.'),
  pointsChamp: B('points-champ', 'Points Champ', '⭐', 'achievement', 'Scored the most regular-season points.'),
  last: B('last', 'Last Place', '🌮', 'blunder', 'Finished last.'),
  fewest: B('fewest', 'Lowest Scorer', '🤮', 'blunder', 'Scored the fewest regular-season points.'),
  missed: B('missed', 'Golf Season', '⛳', 'blunder', 'Missed the playoffs.'),
  firstSeedOut: B('first-seed-out', 'Choked', '🫣', 'blunder', 'Top regular-season seed who did not win the title.'),
}
const MILESTONES = [25, 50, 75, 100, 125, 150]

export function buildBadges(lg: League): Earned[] {
  const out: Earned[] = []
  const name = (id: string) => lg.memberById[id]?.name ?? '?'
  const tw = teamWeeks(lg).filter((t) => t.pts > 0)
  const weekKeys = [...new Set(tw.map((t) => `${t.season}-${t.week}`))]
  const order = (a: { season: number; week: number }, b: { season: number; week: number }) => a.season - b.season || a.week - b.week

  // ---- Weekly ----
  for (const key of weekKeys) {
    const wk = tw.filter((t) => `${t.season}-${t.week}` === key)
    const reg = wk.filter((t) => !t.playoff)
    const pool = reg.length ? reg : wk
    const sorted = [...pool].sort((a, b) => b.pts - a.pts)
    for (const t of wk) {
      const e = (badge: Badge, detail: string) => out.push({ badge, memberId: t.memberId, season: t.season, week: t.week, detail })
      const vs = `${t.pts.toFixed(2)}–${t.oppPts.toFixed(2)} vs ${name(t.oppId)}`
      const won = t.pts > t.oppPts, lost = t.pts < t.oppPts
      const rank = sorted.findIndex((x) => x.memberId === t.memberId)
      if (!t.playoff && rank === 0) e(BADGES.top, `${t.pts.toFixed(2)} pts`)
      if (!t.playoff && rank === sorted.length - 1) e(BADGES.low, `${t.pts.toFixed(2)} pts`)
      if (t.pts >= 2 * t.oppPts) e(BADGES.doubleUp, vs)
      if (t.oppPts >= 2 * t.pts) e(BADGES.doubled, vs)
      if (t.pts >= 175) e(BADGES.century, `${t.pts.toFixed(2)} pts`)
      if (t.pts < 80) e(BADGES.sub80, `${t.pts.toFixed(2)} pts`)
      if (won && t.pts - t.oppPts < 3) e(BADGES.nailbiter, vs)
      if (lost && t.oppPts - t.pts < 3) e(BADGES.heartbreak, vs)
      if (won && t.pts - t.oppPts >= 60) e(BADGES.blowout, vs)
      if (!t.playoff && rank >= 0) {
        if (won && rank >= sorted.length - 3) e(BADGES.stolen, vs)
        if (lost && rank <= 2) e(BADGES.robbed, vs)
        if (won && rank === 0) e(BADGES.sweep, vs)
      }
    }
  }

  // ---- Streaks & milestones (regular season, all-time order) ----
  for (const m of lg.members) {
    const games = tw.filter((t) => t.memberId === m.id && !t.playoff).sort(order)
    let w = 0, l = 0, wins = 0, losses = 0
    for (const g of games) {
      if (g.pts > g.oppPts) { w++; l = 0; wins++ } else if (g.pts < g.oppPts) { l++; w = 0; losses++ }
      if (w === 5) out.push({ badge: BADGES.winStreak, memberId: m.id, season: g.season, week: g.week, detail: '5 straight wins' })
      if (l === 5) out.push({ badge: BADGES.loseStreak, memberId: m.id, season: g.season, week: g.week, detail: '5 straight losses' })
      for (const n of MILESTONES) {
        if (g.pts > g.oppPts && wins === n) out.push({ badge: B(`wins-${n}`, `H2H Wins – ${n}`, '📈', 'achievement', `Reached ${n} career head-to-head wins.`), memberId: m.id, season: g.season, week: g.week, detail: `${n} wins` })
        if (g.pts < g.oppPts && losses === n) out.push({ badge: B(`losses-${n}`, `H2H Losses – ${n}`, '📉', 'blunder', `Reached ${n} career head-to-head losses.`), memberId: m.id, season: g.season, week: g.week, detail: `${n} losses` })
      }
    }
  }

  // ---- Season ----
  for (const s of lg.seasons.filter((x) => x.complete)) {
    const ts = s.teamSeasons
    const e = (badge: Badge, id: string, detail = `${s.year}`) => out.push({ badge, memberId: id, season: s.year, week: null, detail })
    for (const t of ts) {
      if (t.finalRank === 1) e(BADGES.champ, t.memberId, `${s.year} · ${t.teamName}`)
      if (t.finalRank === 2) e(BADGES.runnerUp, t.memberId)
      if (t.madePlayoffs) e(BADGES.playoffs, t.memberId)
      else e(BADGES.missed, t.memberId)
      if (t.regRank === 1) { e(BADGES.regChamp, t.memberId); if (t.finalRank !== 1) e(BADGES.firstSeedOut, t.memberId, `${s.year} · finished ${t.finalRank}`) }
      if (t.finalRank === s.teams) e(BADGES.last, t.memberId)
    }
    e(BADGES.pointsChamp, [...ts].sort((a, b) => b.pf - a.pf)[0].memberId)
    e(BADGES.fewest, [...ts].sort((a, b) => a.pf - b.pf)[0].memberId)
  }

  return out.sort((a, b) => b.season - a.season || (b.week ?? 99) - (a.week ?? 99))
}
