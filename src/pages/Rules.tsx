// The PGKL Bible: league constitution. Edit the RULES data below to update the page.
import type { ReactNode } from 'react'

interface Rule { id: string; title: string; body: ReactNode }
interface Section { id: string; title: string; rules: Rule[] }

const List = ({ items }: { items: ReactNode[] }) => <ul className="rule-list">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
const KV = ({ rows }: { rows: [string, ReactNode][] }) => (
  <dl className="rule-kv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
)

const RULES: Section[] = [
  {
    id: 's1', title: 'General League Info',
    rules: [
      { id: '1.1', title: 'League Settings', body: <KV rows={[['League', 'PGKL · 10-person league'], ['Commissioner', 'Trent Charlton'], ['Platform', 'Sleeper'], ['Matchup', 'Head-to-head + median scoring']]} /> },
      {
        id: '1.2', title: 'Scoring Settings',
        body: <List items={[
          'Standard PPR scoring',
          <>Non-standard scoring exceptions:<List items={['0.05 pts per passing yard', <>Adjusted defensive scoring<List items={['0.5 pts per 4th-down stop']} /></>]} /></>,
        ]} />,
      },
      { id: '1.3', title: 'Roster Settings', body: <KV rows={[['Starters', 'QB, RB, RB, WR, WR, WR, TE, FLEX, DEF'], ['Bench', '7 spots'], ['IR', '2 spots']]} /> },
    ],
  },
  {
    id: 's2', title: 'League Dues & Prizes',
    rules: [
      { id: '2.1', title: 'League Dues', body: <KV rows={[['2025', '$75'], ['2024', '$60'], ['2023', '$50']]} /> },
      { id: '2.2', title: 'League Prizes', body: <KV rows={[['1st', '60% of the pot'], ['2nd', '30%'], ['3rd', '10%']]} /> },
      {
        id: '2.3', title: 'Last Place Punishment',
        body: <KV rows={[['2025', 'Impractical Jokesters / mic’d-up punishment'], ['2024', 'ACT in costume (Fooze) — everyone contributes $2 toward entry'], ['2023', 'Wendy’s 4-4-4 Mile (Trent)']]} />,
      },
    ],
  },
  {
    id: 's3', title: 'Keepers',
    rules: [
      {
        id: '3.1', title: 'Keeper Basics',
        body: <List items={[
          'Max keepers: 2 per team (no minimum)',
          'Cost = round originally drafted',
          'No keepers in rounds 1–3',
          'Waiver pickups count as round 10 keepers',
          'Multi-year keepers: if a player is kept in consecutive seasons, their cost is halved',
          'Three-season cap: a player may only be kept for three years',
          'Keepers must be your pick or better within the round you keep them in. For example, if you hold the 2.04, you can keep at 2.01–2.04 but not 2.05–2.10',
          'Keepers must be officially announced 48 hours before the scheduled draft time',
        ]} />,
      },
      {
        id: '3.2', title: 'Drafted Keepers',
        body: <List items={[
          'Must be drafted after Round 3 to be kept',
          'Keeper cost is the round the player was drafted in the previous season',
          'If two keepers fall in the same round, one must be bumped one round earlier if you don’t have two picks in that round',
          <>If a player is kept for an additional season, his cost is halved (10 → 5)<List items={[
            'When halving an odd round, round down (5 → 2)',
            'A player kept for a third season who was originally drafted before Round 8 may be retained in the 2nd round, despite the general no-keepers-in-Rounds-1–3 rule',
          ]} /></>,
          'A player can be kept for no more than three years',
          'Keepers drafted in rounds 11–16 cost the pick of the round they were drafted in, not a 10th',
        ]} />,
      },
      {
        id: '3.3', title: 'Traded & Free-Agent Keepers',
        body: <List items={[
          'Traded players keep their existing keeper contracts and may be kept by the acquiring team under the same round-cost rules (capped at Round 10)',
          'Waiver-wire keepers cost a 10th-rounder, and the FAAB spent on that transaction is subtracted from next year’s budget',
          'A traded player must start at least four games for his new team before becoming keeper-eligible for the next draft',
          'If you reacquire a player you previously drafted or kept, he keeps his prior keeper contract; to qualify he must start at least two games or be on your roster for at least four games after acquisition',
          'Any brand-new free-agent pickup must start at least three games or stay on your roster for at least four games to qualify as a keeper, and automatically costs a Round 10 pick',
          'If another franchise drops one of your keepers, any team may claim him, and he carries his remaining keeper seasons and round cost',
          'A player who begins the season on IR must return to play at least one game by Week 17 to keep or start keeper eligibility',
          'Any keeper placed on IR must still meet the standard criteria (active for four games or rostered for eight games during the season) to keep keeper status',
        ]} />,
      },
    ],
  },
  {
    id: 's4', title: 'Draft',
    rules: [
      { id: '4.1', title: 'Draft Logistics', body: <List items={['The 2025 draft takes place Aug 23rd, 2025', 'Traditional snake draft, sixteen rounds']} /> },
      {
        id: '4.2', title: 'Draft Order',
        body: <>
          <p className="rule-p">Draft order is set by the previous year’s finish:</p>
          <ol className="rule-order">
            <li>Toilet Bowl loser picks their draft slot first</li>
            <li>Toilet Bowl winner</li>
            <li>Winner of the 7th/8th game</li>
            <li>Loser of the 7th/8th game</li>
            <li>Winner of the 5th/6th game</li>
            <li>Loser of the 5th/6th game</li>
            <li>4th place</li>
            <li>3rd place, then 2nd, then the league champion picks last</li>
          </ol>
        </>,
      },
    ],
  },
  {
    id: 's5', title: 'Transactions',
    rules: [
      { id: '5.1', title: 'Waiver Process', body: <List items={['Waivers run Thursday at 2 AM', 'Claims are decided by FAAB; each team starts the year with 1,000 FAAB']} /> },
      {
        id: '5.2', title: 'Trades',
        body: <List items={[
          <>Trade deadline: end of Week <span className="pill" style={{ marginLeft: 2 }}>TBD</span></>,
          'All trades require commissioner approval',
          'Draft-pick trading can’t begin until keepers have been selected; once selected, rounds used for keepers can’t be traded',
        ]} />,
      },
    ],
  },
  {
    id: 's6', title: 'Miscellaneous',
    rules: [
      {
        id: '6.1', title: 'House Rules',
        body: <List items={[
          'The lowest scorer each week sends a weekly recap video to the chat',
          'Top seeds in each playoff round choose their matchup (1 and 3 seeds)',
          'Beat someone by 50+ points and you can rename their team to whatever you want until they win again',
        ]} />,
      },
    ],
  },
]

export default function Rules() {
  return (
    <div className="page">
      <div>
        <div className="eyebrow">League Constitution</div>
        <h1>The PGKL Bible</h1>
      </div>
      <div className="rules-layout">
        <nav className="rules-toc" aria-label="Rules contents">
          {RULES.map((s, i) => (
            <div key={s.id}>
              <a href={`#${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
                <span className="toc-num">{i + 1}</span>{s.title}
              </a>
            </div>
          ))}
        </nav>
        <div className="rules-body">
          {RULES.map((s, i) => (
            <section key={s.id} id={s.id} className="card rule-section">
              <h2 className="rule-section-title"><span className="toc-num">{i + 1}</span>{s.title}</h2>
              {s.rules.map((r) => (
                <article key={r.id} className="rule">
                  <h3 className="rule-title"><span className="rule-id">{r.id}</span>{r.title}</h3>
                  {r.body}
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
