import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { fmt, record, type League } from '../lib/stats'
import { Card } from './ui'

type Kind = 'champ' | 'second' | 'third' | 'points' | 'allplay' | 'toilet'
interface Award { kind: Kind; year: number; detail: string }

const LABEL: Record<Kind, string> = {
  champ: 'PGKL Champion', second: 'Runner-up', third: 'Third place',
  points: 'Points leader', allplay: 'All-play leader', toilet: 'Toilet Bowl',
}
const ORDER: Kind[] = ['champ', 'second', 'third', 'points', 'allplay', 'toilet']

/** Every trophy a member has won, completed seasons only. Points and all-play are regular season. */
export function awardsFor(lg: League, id: string): Award[] {
  const out: Award[] = []
  for (const s of lg.seasons) {
    if (!s.complete) continue
    const t = s.teamSeasons.find((x) => x.memberId === id)
    if (!t) continue
    const topPf = Math.max(...s.teamSeasons.map((x) => x.pf))
    const topAp = Math.max(...s.teamSeasons.map((x) => x.apW))
    if (s.champion === id) out.push({ kind: 'champ', year: s.year, detail: s.runnerUp ? `beat ${lg.memberById[s.runnerUp]?.name ?? '?'} in the final` : '' })
    if (s.runnerUp === id) out.push({ kind: 'second', year: s.year, detail: 'lost in the final' })
    if (s.third === id) out.push({ kind: 'third', year: s.year, detail: 'won the 3rd-place game' })
    if (t.pf === topPf) out.push({ kind: 'points', year: s.year, detail: `${fmt(t.pf)} points` })
    if (t.apW === topAp) out.push({ kind: 'allplay', year: s.year, detail: `${record(t.apW, t.apL, t.apT)} all-play` })
    if (s.toiletBowlLoser === id) out.push({ kind: 'toilet', year: s.year, detail: 'lost the toilet bowl' })
  }
  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.year - b.year)
}

export function TrophyRoom({ id }: { id: string }) {
  const lg = useLeague()
  const awards = awardsFor(lg, id)
  const champs = awards.filter((a) => a.kind === 'champ')
  const rest = awards.filter((a) => a.kind !== 'champ')
  const count = (k: Kind) => awards.filter((a) => a.kind === k).length
  const sub = ORDER.filter((k) => count(k)).map((k) => `${count(k)} × ${LABEL[k]}`).join(' · ')
  return (
    <Card title="Trophy Room" sub={sub || undefined}>
      {!awards.length && <p className="muted">The shelf is empty… for now.</p>}
      {champs.length > 0 && (
        <div className="trophy-shelf champ">
          {champs.map((a) => <TrophyItem key={a.kind + a.year} a={a} />)}
        </div>
      )}
      {rest.length > 0 && (
        <div className="trophy-shelf">
          {rest.map((a) => <TrophyItem key={a.kind + a.year} a={a} />)}
        </div>
      )}
    </Card>
  )
}

function TrophyItem({ a }: { a: Award }) {
  const Art = { champ: ChampionCup, second: Medal, third: Medal, points: SmallCup, allplay: SmallCup, toilet: Toilet }[a.kind]
  return (
    <Link to={`/season/${a.year}`} className={`trophy-item ${a.kind}`} title={`${a.year} ${LABEL[a.kind]}${a.detail ? ` · ${a.detail}` : ''}`}>
      <Art kind={a.kind} year={a.year} />
      <span className="trophy-cap"><b>{a.year}</b><span className="muted small">{LABEL[a.kind]}</span></span>
    </Link>
  )
}

const METAL = {
  gold: ['#fff4c7', '#f2c35b', '#b07a1c', '#6e4a0c'],
  silver: ['#ffffff', '#d4dae3', '#8d97a6', '#545c69'],
  bronze: ['#ffd9b8', '#d9925b', '#9a5a2a', '#5c3215'],
}

function Grad({ id, c, dir = 'h' }: { id: string; c: string[]; dir?: 'h' | 'v' }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={dir === 'h' ? 1 : 0} y2={dir === 'v' ? 1 : 0}>
      <stop offset="0" stopColor={c[2]} /><stop offset=".28" stopColor={c[0]} /><stop offset=".55" stopColor={c[1]} /><stop offset="1" stopColor={c[3]} />
    </linearGradient>
  )
}

function ChampionCup({ year }: { kind: Kind; year: number }) {
  const u = useId().replace(/:/g, '')
  const g = `g${u}`, gv = `gv${u}`, wood = `w${u}`, shine = `s${u}`
  return (
    <svg viewBox="0 0 160 230" className="trophy-art champ-art" role="img" aria-label={`${year} PGKL championship trophy`}>
      <defs>
        <Grad id={g} c={METAL.gold} />
        <Grad id={gv} c={METAL.gold} dir="v" />
        <linearGradient id={wood} x1="0" x2="1"><stop offset="0" stopColor="#2a1a10" /><stop offset=".5" stopColor="#4a2f1c" /><stop offset="1" stopColor="#24160d" /></linearGradient>
        <radialGradient id={shine} cx=".35" cy=".3" r=".5"><stop offset="0" stopColor="#fff" stopOpacity=".7" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
      </defs>
      {/* handles */}
      <path d="M38 40 C8 40 6 92 50 104" fill="none" stroke={`url(#${gv})`} strokeWidth="8" strokeLinecap="round" />
      <path d="M122 40 C152 40 154 92 110 104" fill="none" stroke={`url(#${gv})`} strokeWidth="8" strokeLinecap="round" />
      {/* bowl */}
      <path d="M32 26 H128 C128 82 112 112 80 120 C48 112 32 82 32 26 Z" fill={`url(#${g})`} />
      <ellipse cx="80" cy="26" rx="48" ry="7" fill={METAL.gold[2]} />
      <ellipse cx="80" cy="25" rx="44" ry="5" fill={METAL.gold[3]} />
      <path d="M40 34 C42 74 54 100 72 112" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="62" cy="58" rx="22" ry="30" fill={`url(#${shine})`} />
      {/* engraving */}
      <text x="80" y="66" textAnchor="middle" className="engrave" fontSize="19" fontWeight="800" letterSpacing="2">PGKL</text>
      <path d="M58 74 H102" stroke={METAL.gold[3]} strokeOpacity=".6" strokeWidth="1.2" />
      <text x="80" y="86" textAnchor="middle" className="engrave" fontSize="7.5" fontWeight="700" letterSpacing="1.5">CHAMPION</text>
      {/* star finial on lid rim */}
      <path d="M80 4 l3.2 6.6 7.2 1 -5.2 5 1.3 7.2 -6.5 -3.4 -6.5 3.4 1.3 -7.2 -5.2 -5 7.2 -1 Z" fill={`url(#${g})`} stroke={METAL.gold[3]} strokeWidth=".6" />
      {/* stem and knot */}
      <path d="M72 118 H88 L85 142 H75 Z" fill={`url(#${g})`} />
      <ellipse cx="80" cy="142" rx="14" ry="5" fill={`url(#${g})`} />
      <path d="M74 146 H86 L92 160 H68 Z" fill={`url(#${g})`} />
      <rect x="56" y="158" width="48" height="8" rx="2" fill={`url(#${g})`} />
      {/* plinth */}
      <path d="M44 166 H116 L122 210 H38 Z" fill={`url(#${wood})`} />
      <rect x="34" y="208" width="92" height="10" rx="2" fill="#1b100a" />
      <rect x="58" y="178" width="44" height="20" rx="2" fill={`url(#${g})`} />
      <text x="80" y="192" textAnchor="middle" className="engrave" fontSize="10" fontWeight="800">{year}</text>
    </svg>
  )
}

function Medal({ kind, year }: { kind: Kind; year: number }) {
  const u = useId().replace(/:/g, '')
  const c = kind === 'second' ? METAL.silver : METAL.bronze
  const g = `m${u}`
  const place = kind === 'second' ? '2' : '3'
  return (
    <svg viewBox="0 0 100 140" className="trophy-art medal-art" role="img" aria-label={`${year} ${LABEL[kind]} medal`}>
      <defs><Grad id={g} c={c} dir="v" /></defs>
      <path d="M30 0 H50 L60 58 H42 Z" fill="#3b4cc0" />
      <path d="M70 0 H50 L40 58 H58 Z" fill="#c0394b" />
      <path d="M36 0 H44 L52 58 H47 Z" fill="#fff" fillOpacity=".25" />
      <circle cx="50" cy="94" r="34" fill={`url(#${g})`} />
      <circle cx="50" cy="94" r="27" fill="none" stroke={c[3]} strokeOpacity=".55" strokeWidth="2" />
      <circle cx="50" cy="94" r="34" fill="none" stroke={c[3]} strokeWidth="1.5" />
      <text x="50" y="104" textAnchor="middle" fontSize="28" fontWeight="800" fill={c[3]}>{place}</text>
      <path d="M30 80 A26 26 0 0 1 56 68" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function SmallCup({ kind, year }: { kind: Kind; year: number }) {
  const u = useId().replace(/:/g, '')
  const c = kind === 'points' ? METAL.gold : METAL.silver
  const g = `c${u}`
  return (
    <svg viewBox="0 0 100 140" className="trophy-art cup-art" role="img" aria-label={`${year} ${LABEL[kind]} trophy`}>
      <defs><Grad id={g} c={c} /></defs>
      <path d="M28 30 C10 30 10 62 36 66" fill="none" stroke={c[2]} strokeWidth="5" strokeLinecap="round" />
      <path d="M72 30 C90 30 90 62 64 66" fill="none" stroke={c[2]} strokeWidth="5" strokeLinecap="round" />
      <path d="M24 20 H76 C76 54 66 72 50 76 C34 72 24 54 24 20 Z" fill={`url(#${g})`} />
      <ellipse cx="50" cy="20" rx="26" ry="4" fill={c[3]} />
      <path d="M30 26 C32 50 38 64 46 70" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="3" strokeLinecap="round" />
      <text x="50" y="48" textAnchor="middle" fontSize="13" fontWeight="800" fill={c[3]}>{kind === 'points' ? 'PF' : 'AP'}</text>
      <path d="M45 75 H55 L57 96 H43 Z" fill={`url(#${g})`} />
      <rect x="32" y="96" width="36" height="7" rx="2" fill={`url(#${g})`} />
      <path d="M28 103 H72 L75 128 H25 Z" fill="#2c1c11" />
      <rect x="36" y="110" width="28" height="11" rx="1.5" fill={`url(#${g})`} />
      <text x="50" y="118.5" textAnchor="middle" fontSize="7.5" fontWeight="800" fill={c[3]}>{year}</text>
    </svg>
  )
}

function Toilet({ year }: { kind: Kind; year: number }) {
  const u = useId().replace(/:/g, '')
  const p = `p${u}`, g = `t${u}`
  return (
    <svg viewBox="0 0 100 140" className="trophy-art toilet-art" role="img" aria-label={`${year} toilet bowl trophy`}>
      <defs>
        <linearGradient id={p} x1="0" x2="1"><stop offset="0" stopColor="#b9c0cc" /><stop offset=".35" stopColor="#ffffff" /><stop offset="1" stopColor="#9aa3b1" /></linearGradient>
        <Grad id={g} c={METAL.gold} />
      </defs>
      {/* tank */}
      <rect x="54" y="14" width="30" height="48" rx="4" fill={`url(#${p})`} />
      <rect x="52" y="10" width="34" height="7" rx="2" fill={`url(#${g})`} />
      <rect x="74" y="24" width="8" height="3" rx="1.5" fill={`url(#${g})`} />
      {/* seat and bowl */}
      <path d="M14 58 H80 C80 80 66 92 48 92 C30 92 14 80 14 58 Z" fill={`url(#${p})`} />
      <ellipse cx="47" cy="58" rx="34" ry="7" fill={`url(#${g})`} />
      <ellipse cx="47" cy="58" rx="27" ry="4.5" fill="#6b7a8c" />
      <path d="M36 90 H62 L66 108 H32 Z" fill={`url(#${p})`} />
      <path d="M26 108 H72 L75 128 H23 Z" fill="#2c1c11" />
      <rect x="35" y="112" width="28" height="11" rx="1.5" fill={`url(#${g})`} />
      <text x="49" y="120.5" textAnchor="middle" fontSize="7.5" fontWeight="800" fill={METAL.gold[3]}>{year}</text>
    </svg>
  )
}
