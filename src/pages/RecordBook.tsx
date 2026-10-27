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
    { key: 'posTop', label: 'Top 3s', render: (r) => r.posTop, sort: (r) => r.posTop, tip: 'Top-3 spots across all records.' },
    { key: 'neg', label: 'Chud-cords Held', render: (r) => <span className="neg"><b>{r.neg}</b></span>, sort: (r) => r.neg, tip: 'Chud-cords (bad records) where this member holds #1.' },
    { key: 'negTop', label: 'Chud-cord Top 3s', render: (r) => r.negTop, sort: (r) => r.negTop, tip: 'Top-3 spots across all chud-cords.' },
    { key: 'tot', label: 'Total Held', render: (r) => <b>{r.pos + r.neg}</b>, sort: (r) => r.pos + r.neg },
  ]
  const milestoneWatch = defs
    .filter((d) => d.category === 'Milestones' && d.positive)
    .flatMap((d) => d.rows.map((r) => ({ d, r, away: Number(r.context.split(' ')[0].replace(/,/g, '')) })))
    .sort((a, b) => a.away / stepOf(a.d) - b.away / stepOf(b.d))
    .slice(0, 8)

  return (
    <div className="page">
      <header className="rb-title">
        <div className="rb-kicker">PGKL · Official League Almanac</div>
        <h1>The Record Book</h1>
        <div className="rb-double-rule" />
      </header>
      <Tabs tabs={VIEWS} value={view} onChange={setView} />
      {view === 'Overview' ? (
        <>
          <div className="cat-grid">
            {CATEGORIES.map((c, i) => (
              <button key={c} className="cat-card rb-chapter" onClick={() => setView(c)}>
                <span className="rb-no">Chapter {ROMAN[i]}</span>
                <span className="rb-chapter-name">{c}</span>
                <span className="cat-count">{count(c, true) + count(c, false)} <span className="muted small">entries</span></span>
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

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

function RecordSection({ title, defs, bad = false }: { title: string; defs: RecordDef[]; bad?: boolean }) {
  if (!defs.length) return null
  return (
    <section className={`record-section ${bad ? 'bad' : 'good'}`}>
      <div className="rb-section-head">
        <span className="rb-rule" />
        <h2>{title}</h2>
        <span className="rb-rule" />
      </div>
      <p className="rb-section-sub">{defs.length} entries · {bad ? 'the marks nobody wants' : 'the marks everyone chases'}</p>
      <div className="record-grid">
        {defs.map((d, i) => <RecordCard key={d.id} d={d} n={i + 1} />)}
      </div>
    </section>
  )
}

const stepOf = (d: RecordDef) => Number(d.desc.match(/every ([\d,]+)/)?.[1].replace(/,/g, '') ?? 1)

function Holder({ r }: { r: RecordDef['rows'][number] }) {
  return r.memberId2
    ? <span className="record-pair"><MemberLink id={r.memberId} /><span className="muted">&amp;</span><MemberLink id={r.memberId2} /></span>
    : <MemberLink id={r.memberId} />
}

function RecordCard({ d, n }: { d: RecordDef; n: number }) {
  const [open, setOpen] = useState(false)
  const [top, ...rest] = d.rows
  const rows = rest.slice(0, open ? 24 : 4)
  // Ties share a rank: "T-1", "T-3", ...
  const rankOf = (i: number) => {
    const first = d.rows.findIndex((r) => r.value === d.rows[i].value)
    const tied = d.rows.filter((r) => r.value === d.rows[i].value).length > 1
    return `${tied ? 'T-' : ''}${first + 1}`
  }
  const detail = (r: RecordDef['rows'][number]) => (r.link ? <Link to={r.link}>{r.context}</Link> : r.context)
  return (
    <article className={`rb-entry ${d.positive ? 'good' : 'bad'}`}>
      <header className="rb-entry-head">
        <span className="rb-no">No. {String(n).padStart(2, '0')}</span>
        <h3>{d.title}</h3>
        <p>{d.desc}</p>
      </header>
      {top && (
        <div className="rb-holder">
          <div className="rb-holder-label">{d.positive ? 'Record holder' : 'Chud-cord holder'}{rankOf(0).startsWith('T') && ' · tied'}</div>
          <div className="rb-holder-row">
            <div className="rb-holder-who"><Holder r={top} /></div>
            <div className="rb-holder-value">{top.display}</div>
          </div>
          {top.context && <div className="rb-holder-detail">{detail(top)}</div>}
        </div>
      )}
      {rows.length > 0 && (
        <ol className="rb-ledger">
          {rows.map((r, i) => (
            <li key={i}>
              <span className="rb-rank">{rankOf(i + 1)}</span>
              <span className="rb-who"><Holder r={r} /></span>
              <span className="rb-dots" />
              <b className="rb-val">{r.display}</b>
              {r.context && <span className="rb-ctx">{detail(r)}</span>}
            </li>
          ))}
        </ol>
      )}
      {d.rows.length > 5 && <button className="link-btn rb-more" onClick={() => setOpen(!open)}>{open ? 'Show less' : `Full top ${Math.min(25, d.rows.length)}`}</button>}
    </article>
  )
}
