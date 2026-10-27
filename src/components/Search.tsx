import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { League } from '../lib/stats'
import { playersOf } from '../lib/players'
import { buildRecords } from '../lib/records'
import { Avatar } from './ui'
import { Icon } from './Icon'

// Global search: members, past team names, players, seasons, records and pages, opened with ⌘K / Ctrl+K or "/".
interface Hit { group: string; label: string; sub?: string; to: string; state?: unknown; member?: string; pos?: string; rank: number }

const GROUPS = ['Members', 'Teams', 'Players', 'Seasons', 'Records', 'Pages']

export function SearchPalette({ lg, pages, open, onClose }: { lg: League; pages: { to: string; label: string; icon: string }[]; open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const index = useMemo(() => {
    const pm = playersOf(lg)
    const hits: Omit<Hit, 'rank'>[] = []
    for (const m of lg.members) hits.push({ group: 'Members', label: m.name, sub: 'Franchise page', to: `/member/${m.id}`, member: m.id })
    const teams = new Map<string, { id: string; years: number[] }>()
    for (const s of lg.seasons) for (const t of s.teamSeasons) {
      const k = `${t.teamName}|${t.memberId}`
      const e = teams.get(k) ?? { id: t.memberId, years: [] }
      e.years.push(s.year)
      teams.set(k, e)
    }
    for (const [k, e] of teams) hits.push({ group: 'Teams', label: k.split('|')[0], sub: `${lg.memberById[e.id]?.name ?? ''} · ${e.years.sort().join(', ')}`, to: `/season/${Math.max(...e.years)}`, member: e.id })
    const rostered = new Set(pm.seasons.map((s) => s.playerId))
    for (const id of rostered) {
      const p = pm.info[id]
      if (p) hits.push({ group: 'Players', label: p.name, sub: [p.pos, p.team].filter(Boolean).join(' · '), to: `/player/${id}`, pos: p.pos })
    }
    for (const s of lg.seasons) hits.push({ group: 'Seasons', label: `${s.year} season`, sub: s.complete ? 'Final standings, playoffs and recap' : 'In progress', to: `/season/${s.year}` })
    for (const d of buildRecords(lg)) hits.push({ group: 'Records', label: d.title, sub: `${d.category} · ${d.positive ? 'Record' : 'Chud-cord'}`, to: '/records', state: { view: d.category } })
    hits.push({ group: 'Records', label: 'Milestones', sub: 'First-to races', to: '/records', state: { view: 'Milestones' } })
    for (const p of pages) hits.push({ group: 'Pages', label: p.label, to: p.to })
    return hits
  }, [lg, pages])

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return index.filter((h) => h.group === 'Members' || h.group === 'Pages').map((h) => ({ ...h, rank: 0 }))
    const words = t.split(/\s+/)
    const out: Hit[] = []
    for (const h of index) {
      const l = h.label.toLowerCase()
      const hay = `${l} ${(h.sub ?? '').toLowerCase()}`
      if (!words.every((w) => hay.includes(w))) continue
      // Prefix of the label beats a word start, which beats anywhere.
      const rank = l.startsWith(t) ? 0 : l.split(/[\s.'-]+/).some((w) => w.startsWith(words[0])) ? 1 : 2
      out.push({ ...h, rank })
    }
    const per: Record<string, number> = {}
    return out
      .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.rank - b.rank || a.label.localeCompare(b.label))
      .filter((h) => (per[h.group] = (per[h.group] ?? 0) + 1) <= (h.group === 'Players' ? 8 : 5))
  }, [q, index])

  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 0) } }, [open])
  useEffect(() => setSel(0), [q])
  useEffect(() => {
    document.querySelector('.search-item.sel')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  if (!open) return null
  const go = (h: Hit) => { onClose(); nav(h.to, { state: h.state }) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
    else if (e.key === 'Enter' && results[sel]) go(results[sel])
    else if (e.key === 'Escape') onClose()
  }

  return (
    <div className="search-scrim" onClick={onClose}>
      <div className="search-panel" role="dialog" aria-label="Search" onClick={(e) => e.stopPropagation()}>
        <div className="search-bar">
          <Icon name="search" size={18} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search members, teams, players, seasons, records…" />
          <button className="search-esc" onClick={onClose}>Esc</button>
        </div>
        <div className="search-results">
          {results.length === 0 && <div className="search-empty">No matches for “{q}”</div>}
          {results.map((h, i) => (
            <div key={h.group + h.label + h.to + i}>
              {(i === 0 || results[i - 1].group !== h.group) && <div className="search-group">{q.trim() ? h.group : h.group === 'Members' ? 'Members' : 'Jump to'}</div>}
              <button className={`search-item ${i === sel ? 'sel' : ''}`} onMouseMove={() => setSel(i)} onClick={() => go(h)}>
                {h.member ? <Avatar id={h.member} size={22} /> : h.pos ? <span className={`pos-tag ${h.pos}`}>{h.pos}</span> : <span className="search-ic"><Icon name={h.group === 'Seasons' ? 'calendar' : h.group === 'Records' ? 'book' : 'arrowRight'} size={14} /></span>}
                <span className="search-label">{h.label}</span>
                {h.sub && <span className="search-sub">{h.sub}</span>}
              </button>
            </div>
          ))}
        </div>
        <div className="search-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
      </div>
    </div>
  )
}
