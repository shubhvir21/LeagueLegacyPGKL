import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLeague } from '../lib/data'
import { buildBadges, type Earned } from '../lib/achievements'
import { careers, type League } from '../lib/stats'
import { Card, MemberLink, Table, type Col } from '../components/ui'
import { PALETTE } from './History'

const cache = new WeakMap<League, Earned[]>()
export function badgesOf(lg: League) {
  let b = cache.get(lg)
  if (!b) { b = buildBadges(lg); cache.set(lg, b) }
  return b
}

export default function Achievements() {
  const lg = useLeague()
  const all = badgesOf(lg)
  const [member, setMember] = useState('ALL')
  const scoped = member === 'ALL' ? all : all.filter((e) => e.memberId === member)
  const rows = useMemo(() => careers(lg).map((r) => {
    const mine = all.filter((e) => e.memberId === r.member.id)
    const a = mine.filter((e) => e.badge.kind === 'achievement'), b = mine.filter((e) => e.badge.kind === 'blunder')
    return { id: r.member.id, aU: new Set(a.map((e) => e.badge.id)).size, a: a.length, bU: new Set(b.map((e) => e.badge.id)).size, b: b.length }
  }), [lg, all])
  const cols: Col<(typeof rows)[number]>[] = [
    { key: 'm', label: 'Member', render: (r) => <MemberLink id={r.id} /> },
    { key: 'aU', label: 'Achievements (unique)', render: (r) => <span className="pos">{r.aU}</span>, sort: (r) => r.aU, align: 'right' },
    { key: 'a', label: '#', render: (r) => r.a, sort: (r) => r.a, align: 'right' },
    { key: 'bU', label: 'Blunders (unique)', render: (r) => <span className="neg">{r.bU}</span>, sort: (r) => r.bU, align: 'right' },
    { key: 'b', label: '#', render: (r) => r.b, sort: (r) => r.b, align: 'right' },
    { key: 't', label: 'Total', render: (r) => <b>{r.a + r.b}</b>, sort: (r) => r.a + r.b, align: 'right' },
  ]
  const catalog = [...new Map(all.map((e) => [e.badge.id, e.badge])).values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  const years = [...lg.seasons].reverse().map((s) => s.year)
  const ids = careers(lg).map((r) => r.member.id)
  const chart = years.map((y) => ({ season: String(y), ...Object.fromEntries(ids.map((id) => [id, all.filter((e) => e.season === y && e.memberId === id && e.badge.kind === 'achievement').length])) }))

  return (
    <div className="page">
      <div className="page-head">
        <h1>Achievements</h1>
        <select value={member} onChange={(e) => setMember(e.target.value)}>
          <option value="ALL">All franchises</option>
          {careers(lg).map((r) => <option key={r.member.id} value={r.member.id}>{r.member.name}</option>)}
        </select>
      </div>
      <Card title="Member Badge Totals" sub="Achievements are the good stuff; blunders are the bad.">
        <Table rows={member === 'ALL' ? rows : rows.filter((r) => r.id === member)} cols={cols} initialSort="a" rowKey={(r) => r.id} />
      </Card>
      <div className="two-col">
        <Card title="Recent Badges">
          <table><tbody>{scoped.slice(0, 15).map((e, i) => (
            <tr key={i}>
              <td><MemberLink id={e.memberId} /></td>
              <td><span className={`badge ${e.badge.kind}`} title={e.badge.desc}>{e.badge.icon} {e.badge.name}</span></td>
              <td className="muted small">{e.season}{e.week ? ` · W${e.week}` : ''}</td>
            </tr>
          ))}</tbody></table>
        </Card>
        <Card title="Badge Catalog" sub="How often each badge has been earned.">
          <table><tbody>{catalog.map((b) => {
            const earned = scoped.filter((e) => e.badge.id === b.id)
            return (
              <tr key={b.id}>
                <td><span className={`badge ${b.kind}`}>{b.icon} {b.name}</span></td>
                <td className="muted small">{b.desc}</td>
                <td className="right"><b>{earned.length}</b></td>
              </tr>
            )
          })}</tbody></table>
        </Card>
      </div>
      <Card title="Achievements by Season">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chart}>
            <CartesianGrid stroke="var(--grid)" />
            <XAxis dataKey="season" stroke="var(--muted)" />
            <YAxis stroke="var(--muted)" />
            <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)' }} />
            <Legend />
            {ids.map((id, i) => <Bar key={id} dataKey={id} name={lg.memberById[id]?.name} stackId="a" fill={PALETTE[i % PALETTE.length]} />)}
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
