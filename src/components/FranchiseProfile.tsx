// Forbes-style franchise profile: valuation, the numbers behind it, and "the take".
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { useLeague } from '../lib/data'
import { playersOf } from '../lib/players'
import { money, valuationTable, valuationsOf, type Valuation } from '../lib/valuation'
import { managementCached } from '../lib/management'
import type { League } from '../lib/stats'
import { Avatar } from './ui'

export function FranchiseProfile({ id }: { id: string }) {
  const lg = useLeague()
  const hist = valuationsOf(lg)[id]
  if (!hist?.length) return null
  const v = hist.at(-1)!
  const table = valuationTable(lg)
  const rank = table.findIndex((x) => x.memberId === id) + 1
  const name = lg.memberById[id]?.name ?? '?'
  const team = lg.seasons[0].teamSeasons.find((t) => t.memberId === id)?.teamName
  const est = Math.min(...lg.seasons.filter((s) => s.teamSeasons.some((t) => t.memberId === id)).map((s) => s.year))

  return (
    <section className="forbes">
      <div className="forbes-head">
        <div className="forbes-kicker">#{rank} · The League's Most Valuable Franchises · {v.year}</div>
        <div className="forbes-title">
          <Avatar id={id} size={64} />
          <div>
            <h2 className="forbes-name">{team ?? name}</h2>
            <div className="muted">Owner: <b>{name}</b> · Est. {est}</div>
          </div>
        </div>
      </div>

      <div className="forbes-grid">
        <div className="forbes-value">
          <div className="forbes-label">Franchise value</div>
          <div className="forbes-big">{money(v.value)}</div>
          {v.change != null ? (
            <div className={`yoy ${v.change >= 0 ? 'up' : 'down'}`}>{v.change >= 0 ? '▲' : '▼'} {Math.abs(v.change).toFixed(1)}% 1-yr change</div>
          ) : <div className="muted small">First valuation</div>}
          <div className="forbes-spark">
            <ResponsiveContainer width="100%" height={90}>
              <BarChart data={hist.map((h) => ({ y: String(h.year), v: +(h.value / 1000).toFixed(2) }))}>
                <XAxis dataKey="y" stroke="var(--muted)" tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)' }} formatter={(x) => [`$${x}B`, 'Value']} />
                <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                  {hist.map((h, i) => <Cell key={h.year} fill={i === hist.length - 1 ? 'var(--gold)' : 'rgba(124,140,255,.55)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <dl className="forbes-facts">
          <Fact k="Franchise index" v={v.index.toFixed(1)} />
          <Fact k="Elo" v={String(v.elo)} />
          <Fact k="Championships" v={String(v.titles)} />
          <Fact k="Playoff rate" v={`${Math.round(v.playoffRate * 100)}%`} />
          <Fact k="Avg finish" v={v.avgFinish.toFixed(1)} />
          <Fact k="Best season" v={v.bestSeason.toFixed(1)} />
          <Fact k="Manager score" v={v.managerScore.toFixed(0)} />
          <Fact k="League rank" v={`${rank} of ${table.length}`} />
        </dl>
      </div>

      <div className="forbes-take">
        <div className="forbes-label">The take</div>
        <p>{take(lg, id, v, hist, rank, table.length)}</p>
      </div>

      <div className="forbes-pillars">
        <div className="forbes-label">What drives the value · {v.year}</div>
        {v.pillars.map((p) => (
          <div key={p.key} className="split-row pillar-row">
            <span>{p.label} <span className="muted small">{Math.round(p.weight * 100)}%</span></span>
            <span className="split-bar"><span style={{ width: `${Math.max(2, p.score)}%` }} /></span>
            <b>{Math.round(p.score)}</b>
            <span className="muted small pillar-detail">{p.detail}</span>
          </div>
        ))}
        <div className="split-row pillar-row total"><span>Franchise index</span><span /><b>{v.index.toFixed(1)}</b><span /></div>
      </div>
      <p className="muted small forbes-foot">Each pillar is scored 0–100 against the rest of the league (50 = average) and recalculated after every completed season. Not financial advice. Definitely not real money.</p>
    </section>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return <div className="fact"><dt>{k}</dt><dd>{v}</dd></div>
}

/** A short, data-driven writeup in the voice of a sports-business column that has seen too much. */
function take(lg: League, id: string, v: Valuation, hist: Valuation[], rank: number, n: number) {
  const pm = playersOf(lg)
  const done = lg.seasons.filter((s) => s.complete)
  const mine = done.map((s) => ({ s, t: s.teamSeasons.find((t) => t.memberId === id)! })).filter((x) => x.t)
  const titleYears = mine.filter((x) => x.t.finalRank === 1).map((x) => x.s.year).sort()
  const seconds = mine.filter((x) => x.t.finalRank === 2).map((x) => x.s.year)
  const toilets = done.filter((s) => s.toiletBowlLoser === id).map((s) => s.year)
  const latest = [...mine].sort((a, b) => b.s.year - a.s.year)[0]
  const trades = pm.trades.filter((t) => t.sides.some((x) => x.memberId === id && (x.gets.length || x.gives.length))).length
  const mgmt = managementCached(lg).filter((r) => r.memberId === id && !r.inProgress)
  const lineupLosses = mgmt.reduce((a, r) => a + r.lineupLosses, 0)
  const faab = lg.raw.seasons.filter((s) => s.league.status === 'complete').map((s) => {
    const r = s.rosters.find((x) => lg.rosterOwner[Number(s.league.season)][x.roster_id] === id)
    return (r?.settings.waiver_budget_used ?? 0) / (Number(s.league.settings.waiver_budget) || 100)
  })
  const spend = faab.length ? faab.reduce((a, b) => a + b, 0) / faab.length : 0
  const p = Object.fromEntries(v.pillars.map((x) => [x.key, x.score]))
  const best = [...v.pillars].sort((a, b) => b.score - a.score)[0]
  const worst = [...v.pillars].sort((a, b) => a.score - b.score)[0]
  const parts: string[] = []

  // Headline
  if (rank === 1) parts.push(`At ${money(v.value)}, the most valuable franchise in the league, and the owner would like you to know that, ideally in the group chat, ideally every day.`)
  else if (rank === n) parts.push(`Valued at ${money(v.value)}, dead last. Analysts call it "a distressed asset"; the owner calls it "a rebuild"; the trophy case calls it "roomy."`)
  else if (rank <= 3) parts.push(`A blue-chip franchise at ${money(v.value)} (#${rank} of ${n}), close enough to the top to smell it and far enough to complain about it.`)
  else if (rank >= n - 2) parts.push(`At ${money(v.value)} (#${rank} of ${n}), this franchise is priced to move. Serious inquiries only. Unserious inquiries also welcome.`)
  else parts.push([
    `Valued at ${money(v.value)}, #${rank} of ${n}: the beige Camry of fantasy franchises. Reliable, inoffensive, nobody's dream car.`,
    `At ${money(v.value)} (#${rank} of ${n}), firmly middle class. Owns a nice grill. Talks about the grill a lot.`,
    `Valued at ${money(v.value)}, #${rank} of ${n}. Not good enough to fear, not bad enough to pity: the league's designated "yeah, they're fine."`,
    `At ${money(v.value)} (#${rank} of ${n}), a franchise with real upside, according to a press release written by the owner.`,
  ][(rank - 4) % 4])

  // Trophy cabinet
  if (titleYears.length >= 2) parts.push(`${titleYears.length} championships (${titleYears.join(', ')}). The trophy case needed a second shelf and, reportedly, its own insurance policy.`)
  else if (titleYears.length === 1) parts.push(`The ${titleYears[0]} title is still mentioned in roughly every conversation, including ones about the weather.`)
  else if (seconds.length) parts.push(`${seconds.length > 1 ? `${seconds.length} runner-up finishes` : `A runner-up finish in ${seconds[0]}`} and zero titles. Always the bridesmaid; the dress is lovely, though.`)
  else if (rank !== n) parts.push([
    `The trophy case has been described by visitors as "minimalist" and by the owner as "under construction."`,
    `No titles yet. The owner insists the trophy case is "a vibe" and that the empty shelf is intentional.`,
    `Zero championships, but a very nice display case. It's been dusted. Repeatedly. For nothing.`,
  ][rank % 3])

  // Skill (Elo)
  if (p.skill >= 75) parts.push(`An Elo of ${v.elo} says this team is genuinely good, which is annoying for everyone else.`)
  else if (p.skill <= 30) parts.push(`An Elo of ${v.elo}. The algorithm ran the numbers twice and then quietly closed the laptop.`)

  // Momentum
  const rec = `${latest.t.wins}-${latest.t.losses}`, an = /^(8|11|18)\b/.test(rec) ? 'an' : 'a'
  const winning = latest.t.wins > latest.t.losses
  if (v.change != null && v.change >= 12 && winning) parts.push(`Value is up ${v.change.toFixed(0)}% after ${v.year}, fueled by ${an} ${rec} season and an owner who has started using the word "dynasty" unironically.`)
  else if (v.change != null && v.change >= 12) parts.push(`Value is somehow up ${v.change.toFixed(0)}% after ${an} ${rec} season in ${v.year}. Economists are baffled. The owner is taking full credit.`)
  else if (v.change != null && v.change <= -5) parts.push(`Value fell ${Math.abs(v.change).toFixed(0)}% after ${v.year}. Investors have been told to "trust the process," which is also what they were told last year.`)
  else if (p.momentum <= 30) parts.push(`Momentum is heading the wrong way: the ${latest.s.year} season ended with the energy of a group project nobody wanted to present.`)

  // Front office
  if (p.office >= 65) parts.push(`The front office is legitimately sharp, setting lineups like it has a spreadsheet for everything. It does.`)
  else if (p.office <= 35) parts.push(`Sunday lineup decisions have been called "bold," "experimental," and, by the bench, "a crime": ${lineupLosses} losses the bench would have won.`)

  if (spend <= 0.4) parts.push(`Spends just ${Math.round(spend * 100)}% of FAAB a season, presumably saving it for something. Nobody knows what. Possibly retirement.`)
  if (trades >= 20) parts.push(`${trades} trades on record; league members now let the calls go to voicemail.`)
  if (toilets.length) parts.push(`The ${toilets.join(' and ')} toilet-bowl ${toilets.length > 1 ? 'losses have' : 'loss has'} been scrubbed from the media guide, but not from anyone's memory.`)

  // Sign-off: best and worst pillar
  if (best.score - worst.score >= 25 && worst.score < 45 && !(worst.key === 'office' && p.office <= 35)) parts.push(`Biggest asset: ${best.label.toLowerCase()}. Biggest liability: ${worst.label.toLowerCase()}. Consultants have been hired. Consultants have quit.`)
  if (hist.length === 1) parts.push(`First year on the books, so the auditors are still figuring out where everything is.`)
  return parts.join(' ')
}
