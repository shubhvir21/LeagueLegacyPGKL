import { useMemo, useState } from 'react'
import { useLeague } from '../lib/data'
import { managementCached } from '../lib/management'
import { ManagementSection } from './Management'
import { TransactionsSection, useTransactionTiles } from './Transactions'

// Front Office: lineup management, waivers and trades on one page (formerly Management + Transactions).
export default function FrontOffice() {
  const lg = useLeague()
  const years = useMemo(() => [...new Set(managementCached(lg).map((r) => r.season))].sort((a, b) => b - a), [lg])
  const [view, setView] = useState('All-Time')
  const [member, setMember] = useState('ALL')
  const tiles = useTransactionTiles(view, member)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Front Office</h1>
          <p className="muted">Lineup decisions, waiver work and trades.</p>
        </div>
        <div className="row">
          <select value={view} onChange={(e) => setView(e.target.value)}>
            <option>All-Time</option>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
          <select value={member} onChange={(e) => setMember(e.target.value)} aria-label="Filter moves and trades by franchise">
            <option value="ALL">All franchises</option>
            {lg.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>
      <ManagementSection view={view} extra={tiles} />
      <TransactionsSection season={view} member={member} />
    </div>
  )
}
