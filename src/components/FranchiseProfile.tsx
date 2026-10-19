// Forbes-style franchise profile: valuation, the numbers behind it, and "the take".
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { useLeague } from '../lib/data'
import { playersOf } from '../lib/players'
import { money, valuationTable, valuationsOf, type Valuation } from '../lib/valuation'
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
  const revTotal = v.revenueLines.reduce((a, l) => a + l.amount, 0)

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
          <Fact k="Revenue" v={money(v.revenue)} />
          <Fact k="Operating income" v={money(v.operatingIncome)} />
          <Fact k="Revenue multiple" v={`${v.multiple.toFixed(1)}×`} />
          <Fact k="Debt / value" v={`${v.debtPct}%`} />
          <Fact k="Championships" v={String(v.titles)} />
          <Fact k="Playoff rate" v={`${Math.round(v.playoffRate * 100)}%`} />
          <Fact k="League rating" v={v.rating.toFixed(1)} />
          <Fact k="League rank" v={`${rank} of ${table.length}`} />
        </dl>
      </div>

      <div className="forbes-take">
        <div className="forbes-label">The take</div>
        <p>{take(lg, id, v, hist, rank, table.length)}</p>
      </div>

      <div className="forbes-split">
        <div>
          <div className="forbes-label">Revenue breakdown · {v.year}</div>
          {v.revenueLines.filter((l) => Math.abs(l.amount) >= 0.5).map((l) => (
            <div key={l.label} className="split-row">
              <span>{l.label}</span>
              <span className="split-bar"><span style={{ width: `${Math.max(2, (Math.max(0, l.amount) / revTotal) * 100)}%`, background: l.amount < 0 ? 'var(--neg)' : undefined }} /></span>
              <b className={l.amount < 0 ? 'neg' : ''}>{l.amount < 0 ? '−' : ''}{money(Math.abs(l.amount))}</b>
            </div>
          ))}
        </div>
        <div>
          <div className="forbes-label">What drives the multiple</div>
          {v.multipleLines.map((l) => (
            <div key={l.label} className="split-row">
              <span>{l.label}</span>
              <b className={l.amount > 0.05 && l.label !== 'League base' ? 'pos' : l.amount < -0.05 ? 'neg' : ''}>
                {l.label === 'League base' ? `${l.amount.toFixed(1)}×` : `${l.amount >= 0 ? '+' : '−'}${Math.abs(l.amount).toFixed(2)}×`}
              </b>
            </div>
          ))}
          <div className="split-row total"><span>Multiple</span><b>{v.multiple.toFixed(2)}×</b></div>
        </div>
      </div>
      <p className="muted small forbes-foot">Value = trailing revenue × multiple, from completed seasons only, recalculated after every season. Revenue weights recent seasons more (5/3/2/1). Not financial advice. Definitely not real money.</p>
    </section>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return <div className="fact"><dt>{k}</dt><dd>{v}</dd></div>
}

/** A short, data-driven writeup in the voice of a sports-business column. */
function take(lg: League, id: string, v: Valuation, hist: Valuation[], rank: number, n: number) {
  const pm = playersOf(lg)
  const done = lg.seasons.filter((s) => s.complete)
  const mine = done.map((s) => ({ s, t: s.teamSeasons.find((t) => t.memberId === id)! })).filter((x) => x.t)
  const titleYears = mine.filter((x) => x.t.finalRank === 1).map((x) => x.s.year).sort()
  const toilets = done.filter((s) => s.toiletBowlLoser === id).map((s) => s.year)
  const lasts = mine.filter((x) => x.t.finalRank === x.s.teams).map((x) => x.s.year)
  const latest = mine.sort((a, b) => b.s.year - a.s.year)[0]
  const trades = pm.trades.filter((t) => t.sides.some((x) => x.memberId === id && (x.gets.length || x.gives.length))).length
  const adds = pm.moves.filter((m) => m.memberId === id).length
  const picks = pm.picks.filter((p) => p.memberId === id && !p.pending)
  const draft = picks.length ? picks.reduce((a, p) => a + p.surplus, 0) / picks.length : 0
  const faab = lg.raw.seasons.filter((s) => s.league.status === 'complete').map((s) => {
    const r = s.rosters.find((x) => lg.rosterOwner[Number(s.league.season)][x.roster_id] === id)
    return (r?.settings.waiver_budget_used ?? 0) / (Number(s.league.settings.waiver_budget) || 100)
  })
  const spend = faab.length ? faab.reduce((a, b) => a + b, 0) / faab.length : 0
  const parts: string[] = []

  if (rank === 1) parts.push(`The crown jewel of the league and its most valuable franchise at ${money(v.value)}: the PGKL's answer to the Dallas Cowboys, minus the playoff anxiety.`)
  else if (rank === n) parts.push(`At ${money(v.value)}, the league's most affordable franchise. Analysts prefer the term "value play"; the owner prefers not to discuss it.`)
  else if (rank <= 3) parts.push(`A blue-chip asset at ${money(v.value)}, ranked #${rank} and firmly in the conversation for the league's marquee brand.`)
  else parts.push(`Valued at ${money(v.value)}, #${rank} of ${n}, a solid mid-market franchise with upside, at least according to its own press releases.`)

  if (titleYears.length >= 2) parts.push(`${titleYears.length} championships (${titleYears.join(', ')}) have turned the trophy case into the single biggest line on the balance sheet.`)
  else if (titleYears.length === 1) parts.push(`The ${titleYears[0]} title still pays dividends; sponsors love a banner, and this one gets dusted weekly.`)
  else parts.push(`The trophy case remains, in the words of one insider, "aspirational."`)

  if (v.change != null && v.change >= 10) parts.push(`Value jumped ${v.change.toFixed(0)}% after ${v.year}, powered by a ${latest.t.wins}-${latest.t.losses} season and ${latest.t.madePlayoffs ? 'a playoff run' : 'sheer optimism'}.`)
  else if (v.change != null && v.change <= -10) parts.push(`Value slid ${Math.abs(v.change).toFixed(0)}% after a ${v.year} campaign that ${latest.t.madePlayoffs ? 'fizzled in the playoffs' : 'ended before December'}; investors have been asked to "trust the process."`)
  else if (hist.length > 1) parts.push(`Value held roughly steady year over year, the fantasy equivalent of a municipal bond.`)

  if (spend >= 0.9) parts.push(`Ownership spends like a hedge fund on the waiver wire (${Math.round(spend * 100)}% of FAAB on average, ${adds} adds).`)
  else if (spend <= 0.45) parts.push(`Famously frugal: just ${Math.round(spend * 100)}% of FAAB spent per season. The accountants are thrilled; the fans are less sure.`)

  if (draft > 4) parts.push(`The scouting department is the envy of the league, beating draft-slot expectations by ${draft.toFixed(1)} points per pick.`)
  else if (draft < -4) parts.push(`Draft-day decisions have been described as "bold" (${draft.toFixed(1)} points per pick below slot value).`)

  if (trades >= 20) parts.push(`A notorious dealmaker with ${trades} trades on record; the front office phone reportedly never stops ringing.`)
  if (toilets.length) parts.push(`Brand consultants are still scrubbing the ${toilets.join(' and ')} toilet-bowl ${toilets.length > 1 ? 'losses' : 'loss'} from the archives.`)
  else if (lasts.length) parts.push(`The ${lasts.join(', ')} last-place finish is not mentioned in the media guide.`)

  return parts.join(' ')
}
