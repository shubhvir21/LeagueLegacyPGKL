import { useMemo, useState } from 'react'
import { useLeague } from '../lib/data'
import { playersOf } from '../lib/players'
import { FLEX } from '../lib/lineup'
import { fmt } from '../lib/stats'
import { Card, MemberLink, Stat, Tabs } from '../components/ui'
import { PlayerLink } from '../components/PlayerLink'

// Each franchise's best possible lineup from players who started for it.
//   Career       a player's total starting-lineup points across all his seasons with the franchise
//   Best Season  a player's single best season of starting points for the franchise
// All-League format: 1st, 2nd and 3rd teams of QB RB RB WR WR TE FLX FLX DEF. Each player makes
// one team at most; flex slots are filled after the fixed ones.
type Mode = 'Career' | 'Best Season'
interface Entry { pid: string; pos: string; pts: number; memberId: string; seasons: number[]; starts: number }

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'DEF']
const TEAMS = ['First Team', 'Second Team', 'Third Team']

function buildTeam(slots: string[], pool: Entry[], used = new Set<string>()) {
  const sorted = [...pool].sort((a, b) => b.pts - a.pts)
  const key = (e: Entry) => e.pid // one appearance per player, even in best-season mode
  const picks: { slot: string; e: Entry }[] = []
  const take = (slot: string, ok: (pos: string) => boolean) => {
    const e = sorted.find((x) => !used.has(key(x)) && ok(x.pos))
    if (e) { used.add(key(e)); picks.push({ slot, e }) }
  }
  for (const s of slots.filter((x) => !FLEX[x])) take(s, (p) => p === s)
  for (const s of slots.filter((x) => FLEX[x]).sort((a, b) => FLEX[a].length - FLEX[b].length)) take(s, (p) => FLEX[s].includes(p))
  // Keep slot order (QB, RB, RB, ...) rather than fill order.
  picks.sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot))
  return { picks, total: picks.reduce((a, p) => a + p.e.pts, 0) }
}

function buildTeams(pool: Entry[]) {
  const used = new Set<string>()
  return TEAMS.map(() => buildTeam(SLOTS, pool, used))
}

export default function AllTime() {
  const lg = useLeague()
  const pm = playersOf(lg)
  const [member, setMember] = useState('ALL')
  const [mode, setMode] = useState<Mode>('Career')

  const entries = useMemo(() => {
    const career: Record<string, Entry> = {}, season: Record<string, Entry> = {}
    for (const w of pm.weeks) {
      if (!w.started) continue
      const pos = pm.info[w.playerId]?.pos ?? '?'
      const c = (career[`${w.playerId}|${w.memberId}`] ??= { pid: w.playerId, pos, pts: 0, memberId: w.memberId, seasons: [], starts: 0 })
      c.pts += w.pts; c.starts++
      if (!c.seasons.includes(w.season)) c.seasons.push(w.season)
      const s = (season[`${w.playerId}|${w.memberId}|${w.season}`] ??= { pid: w.playerId, pos, pts: 0, memberId: w.memberId, seasons: [w.season], starts: 0 })
      s.pts += w.pts; s.starts++
    }
    return { Career: Object.values(career), 'Best Season': Object.values(season) }
  }, [pm])

  const pool = entries[mode].filter((e) => member === 'ALL' || e.memberId === member)
  const teams = buildTeams(pool)
  const team = teams[0]
  const name = (id: string) => lg.memberById[id]?.name ?? id
  // Franchise totals for comparison (same mode).
  const ranking = lg.members.map((m) => ({ id: m.id, total: buildTeam(SLOTS, entries[mode].filter((e) => e.memberId === m.id)).total }))
    .filter((r) => r.total > 0).sort((a, b) => b.total - a.total)
  const mine = member === 'ALL' ? null : ranking.findIndex((r) => r.id === member) + 1
  const mvp = team.picks.length ? [...team.picks].sort((a, b) => b.e.pts - a.e.pts)[0].e : null

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>All-Time Teams</h1>
          <p className="muted">{member === 'ALL' ? 'All-League teams: the best starters in league history, any franchise.' : `The best players ${name(member)} has ever started.`}</p>
        </div>
        <select value={member} onChange={(e) => setMember(e.target.value)}>
          <option value="ALL">All-League</option>
          {lg.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <Tabs tabs={['Career', 'Best Season'] as const} value={mode} onChange={setMode} />
      <div className="stat-grid">
        <Stat icon="star" label={`First Team total · ${mode === 'Career' ? 'career' : 'single-season'} starting pts`} value={fmt(team.total, 0)} />
        {mvp && <Stat icon="crown" label={`Headliner · ${fmt(mvp.pts, 0)} pts`} value={pm.info[mvp.pid]?.name ?? mvp.pid} />}
        {mine ? <Stat icon="medal" label="All-time team rank" value={`${mine} of ${ranking.length}`} /> : ranking[0] && <Stat icon="medal" label={`Best franchise team · ${fmt(ranking[0].total, 0)}`} value={name(ranking[0].id)} />}
      </div>
      {teams.map((t, i) => t.picks.length > 0 && (
        <Card key={TEAMS[i]} title={`${member === 'ALL' ? 'All-League' : 'All-Franchise'} ${TEAMS[i]}`}
          sub={i === 0 ? (mode === 'Career' ? 'Total starting-lineup points with the franchise' : 'Best single season of starting points') : undefined}
          right={<b>{fmt(t.total, 0)}</b>}>
          <div className="at-lineup">
            {t.picks.map(({ slot, e }, j) => <Row key={slot + j + e.pid} slot={slot} e={e} showTeam={member === 'ALL'} />)}
          </div>
        </Card>
      ))}
      <Card title="All-Time Team Rankings" sub="Each franchise's First Team total, same mode">
        <div className="at-rank">
          {ranking.map((r, i) => (
            <button key={r.id} className={`at-rank-row ${r.id === member ? 'active' : ''}`} onClick={() => setMember(r.id)}>
              <span className="muted">{i + 1}</span><MemberLink id={r.id} /><b>{fmt(r.total, 0)}</b>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

function Row({ slot, e, showTeam }: { slot: string; e: Entry; showTeam: boolean }) {
  return (
    <div className="at-row">
      <span className="at-slot">{slot === 'FLEX' ? 'FLX' : slot}</span>
      <PlayerLink id={e.pid} />
      <span className="muted at-meta">
        {showTeam && <><MemberLink id={e.memberId} avatar={false} /> · </>}
        {e.seasons.length > 1 ? `${Math.min(...e.seasons)}–${Math.max(...e.seasons)}` : e.seasons[0]} · {e.starts} starts
      </span>
      <b className="at-pts">{fmt(e.pts, 1)}</b>
    </div>
  )
}
