import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { buildRecords, CATEGORIES, recordHolders, type RecordDef } from '../lib/records'
import { careers } from '../lib/stats'
import { Card, MemberLink, Table, Tabs, type Col } from '../components/ui'
import { Icon } from '../components/Icon'

const VIEWS = ['Overview', ...CATEGORIES] as const

export default function RecordBook() {
  const lg = useLeague()
  const defs = useMemo(() => buildRecords(lg), [lg])
  const [view, setView] = useState<(typeof VIEWS)[number]>('Overview')
  const holders = recordHolders(defs)
  const count = (c: string, positive: boolean) => defs.filter((d) => d.category === c && d.positive === positive).length

  const holderRows = careers(lg).map((r) => ({ id: r.member.id, ...(holders[r.member.id] ?? { pos: 0, neg: 0, posTop: 0, negTop: 0 }) }))
  const cols: Col<(typeof holderRows)[number]>[] = [
    { key: 'm', label: 'Member', render: (r) => <MemberLink id={r.id} /> },
    { key: 'pos', label: 'Records Held', render: (r) => <span className="pos"><b>{r.pos}</b></span>, sort: (r) => r.pos, tip: 'Positive records where this member holds #1 (ties count).' },
    { key: 'posTop', label: 'Top 25s', render: (r) => r.posTop, sort: (r) => r.posTop },
    { key: 'neg', label: 'Chud-cords Held', render: (r) => <span className="neg"><b>{r.neg}</b></span>, sort: (r) => r.neg, tip: 'Chud-cords (bad records) where this member holds #1.' },
    { key: 'negTop', label: 'Chud-cord Top 25s', render: (r) => r.negTop, sort: (r) => r.negTop },
    { key: 'tot', label: 'Total Held', render: (r) => <b>{r.pos + r.neg}</b>, sort: (r) => r.pos + r.neg },
  ]
  const milestoneWatch = defs
    .filter((d) => d.category === 'Milestones' && d.positive)
    .flatMap((d) => d.rows.map((r) => ({ d, r, away: Number(r.context.split(' ')[0].replace(/,/g, '')) })))
    .sort((a, b) => a.away / stepOf(a.d) - b.away / stepOf(b.d))
    .slice(0, 8)

  return (
    <div className="page">
      <h1>Record Book</h1>
      <Tabs tabs={VIEWS} value={view} onChange={setView} />
      {view === 'Overview' ? (
        <>
          <div className="cat-grid">
            {CATEGORIES.map((c) => (
              <button key={c} className="cat-card" onClick={() => setView(c)}>
                <span className="cat-count">{count(c, true) + count(c, false)}</span>
                <span>{c}</span>
                <span className="muted small"><span className="pos">{count(c, true)} records</span> · <span className="neg">{count(c, false)} chud-cords</span></span>
              </button>
            ))}
          </div>
          <Card title="Top Record Holders" sub="Who owns the most #1 spots in the book.">
            <Table rows={holderRows} cols={cols} initialSort="pos" rowKey={(r) => r.id} />
          </Card>
          <Card title="Milestone Watch" sub="Members closest to their next milestone.">
            <div className="highlights">
              {milestoneWatch.map(({ d, r }) => (
                <Link key={d.id + r.memberId} to={`/member/${r.memberId}`} className="highlight">
                  <span className="highlight-icon"><Icon name="target" /></span>
                  <div>
                    <div className="highlight-who">{lg.memberById[r.memberId]?.name}</div>
                    <div className="highlight-title">{d.title}</div>
                    <div className="muted small">{r.context} (now {r.display})</div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <>
          <RecordSection title="Records" defs={defs.filter((d) => d.category === view && d.positive)} />
          <RecordSection title="Chud-cords" bad defs={defs.filter((d) => d.category === view && !d.positive)} />
        </>
      )}
    </div>
  )
}

function RecordSection({ title, defs, bad = false }: { title: string; defs: RecordDef[]; bad?: boolean }) {
  if (!defs.length) return null
  return (
    <section className={`record-section ${bad ? 'bad' : 'good'}`}>
      <div className="record-section-head">
        <h2>{title}</h2>
      </div>
      <div className="record-grid">
        {defs.map((d) => <RecordCard key={d.id} d={d} />)}
      </div>
    </section>
  )
}

const stepOf = (d: RecordDef) => Number(d.desc.match(/every ([\d,]+)/)?.[1].replace(/,/g, '') ?? 1)

function RecordCard({ d }: { d: RecordDef }) {
  const [open, setOpen] = useState(false)
  const rows = d.rows.slice(0, open ? 25 : 5)
  const best = d.rows[0]?.value
  return (
    <section className={`card record ${d.positive ? '' : 'blunder'}`}>
      <header className="card-head">
        <div>
          <h2>{d.title}</h2>
          <p className="muted">{d.desc}</p>
        </div>
      </header>
      <div className="table-wrap"><table>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.value === best ? 'holder' : ''}>
              <td className="muted">{i + 1}</td>
              <td><MemberLink id={r.memberId} /></td>
              <td className="right"><b>{r.display}</b></td>
              <td className="muted small">{r.link ? <Link to={r.link}>{r.context}</Link> : r.context}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {d.rows.length > 5 && <button className="link-btn" onClick={() => setOpen(!open)}>{open ? 'Show less' : `Show top ${Math.min(25, d.rows.length)}`}</button>}
    </section>
  )
}
