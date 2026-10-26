import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { fmt, record, type League } from '../lib/stats'

type Kind = 'champ' | 'second' | 'third' | 'points' | 'allplay' | 'toilet'
interface Award { kind: Kind; year: number; detail: string; value?: string }

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
    if (t.pf === topPf) out.push({ kind: 'points', year: s.year, detail: `${fmt(t.pf)} points`, value: (t.pf / (t.games || 1)).toFixed(1) })
    if (t.apW === topAp) out.push({ kind: 'allplay', year: s.year, detail: `${record(t.apW, t.apL, t.apT)} all-play`, value: record(t.apW, t.apL, t.apT) })
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
  const owner = lg.memberById[id]?.name
  return (
    <section className="trophy-room" aria-label="Trophy Room">
      <div className="trophy-room-head">
        <div className="trophy-plaque"><span>The {owner} Trophy Room</span></div>
        {sub && <p className="trophy-room-sub">{sub}</p>}
      </div>
      {!awards.length && <p className="trophy-room-empty">The shelves are empty… for now.</p>}
      {champs.length > 0 && (
        <div className="trophy-case">
          <div className="trophy-shelf champ">
            {champs.map((a, i) => <TrophyItem key={a.kind + a.year} a={a} nth={i + 1} />)}
          </div>
        </div>
      )}
      {rest.length > 0 && (
        <div className="trophy-shelf">
          {rest.map((a) => <TrophyItem key={a.kind + a.year} a={a} />)}
        </div>
      )}
    </section>
  )
}

function TrophyItem({ a, nth = 1 }: { a: Award; nth?: number }) {
  const Art = { champ: ChampionCup, second: Medal, third: Medal, points: Scoreboard, allplay: Crest, toilet: Toilet }[a.kind]
  return (
    <Link to={`/season/${a.year}`} className={`trophy-item ${a.kind}`} title={`${a.year} ${LABEL[a.kind]}${a.detail ? ` · ${a.detail}` : ''}`}>
      <Art kind={a.kind} year={a.year} nth={nth} value={a.value} />
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

const starPath = (cx: number, cy: number, r: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2, d = i % 2 ? r * 0.45 : r
    return `${i ? 'L' : 'M'}${(cx + d * Math.cos(a)).toFixed(2)} ${(cy + d * Math.sin(a)).toFixed(2)}`
  }).join(' ') + ' Z'

/** `nth` = which title this cup is; from the second one on, it carries one star per title. */
function ChampionCup({ year, nth = 1 }: { kind: Kind; year: number; nth?: number }) {
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
      {/* title stars */}
      {nth > 1 && Array.from({ length: nth }, (_, i) => {
        const gap = Math.min(14, 64 / nth)
        return <path key={i} d={starPath(80 + (i - (nth - 1) / 2) * gap, 42, Math.min(6, gap * 0.45))} className="engrave" />
      })}
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

function Medal({ kind, year }: { kind: Kind; year: number; nth?: number }) {
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

/** Points leader: a stadium scoreboard showing regular-season points per game. */
function Scoreboard({ year, value }: { kind: Kind; year: number; nth?: number; value?: string }) {
  const u = useId().replace(/:/g, '')
  const g = `sb${u}`, glow = `sg${u}`
  return (
    <svg viewBox="0 0 120 140" className="trophy-art board-art" role="img" aria-label={`${year} points leader scoreboard, ${value} points per game`}>
      <defs>
        <Grad id={g} c={METAL.gold} />
        <filter id={glow} x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="1.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      {/* light bar */}
      <rect x="22" y="4" width="76" height="8" rx="2" fill={`url(#${g})`} />
      {[30, 42, 54, 66, 78, 90].map((x) => <circle key={x} cx={x} cy="8" r="2" fill="#fff8d6" />)}
      {/* frame and screen */}
      <rect x="6" y="14" width="108" height="66" rx="6" fill={`url(#${g})`} />
      <rect x="12" y="20" width="96" height="54" rx="3" fill="#0b0d12" />
      <text x="60" y="32" textAnchor="middle" fontSize="7" fontWeight="800" letterSpacing="1.6" fill={METAL.gold[1]}>POINTS PER GAME</text>
      <text x="60" y="62" textAnchor="middle" fontSize="26" fontWeight="800" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fill="#ffcf5a" filter={`url(#${glow})`}>{value}</text>
      <path d="M18 67 H102" stroke={METAL.gold[2]} strokeOpacity=".5" strokeWidth=".8" />
      {/* posts and base */}
      <rect x="28" y="80" width="8" height="26" fill={`url(#${g})`} />
      <rect x="84" y="80" width="8" height="26" fill={`url(#${g})`} />
      <path d="M18 104 H102 L106 128 H14 Z" fill="#2c1c11" />
      <rect x="40" y="110" width="40" height="12" rx="1.5" fill={`url(#${g})`} />
      <text x="60" y="119" textAnchor="middle" fontSize="8" fontWeight="800" fill={METAL.gold[3]}>{year}</text>
    </svg>
  )
}

/** All-play leader: a gold shield crest with laurels and crossed swords. */
function Crest({ year, value }: { kind: Kind; year: number; nth?: number; value?: string }) {
  const u = useId().replace(/:/g, '')
  const g = `cr${u}`, gv = `cv${u}`
  const leaves = (side: 1 | -1) => Array.from({ length: 6 }, (_, i) => {
    const t = i / 5, x = 60 + side * (34 + 6 * Math.sin(t * Math.PI)), y = 92 - t * 62
    return <ellipse key={i} cx={x} cy={y} rx="3.2" ry="7" transform={`rotate(${side * (20 + t * 25)} ${x} ${y})`} fill={`url(#${gv})`} />
  })
  return (
    <svg viewBox="0 0 120 140" className="trophy-art crest-art" role="img" aria-label={`${year} all-play leader crest, ${value}`}>
      <defs><Grad id={g} c={METAL.gold} /><Grad id={gv} c={METAL.gold} dir="v" /></defs>
      {/* crossed swords behind the shield */}
      <g stroke={METAL.gold[2]} strokeWidth="3" strokeLinecap="round">
        <path d="M24 18 L96 96" /><path d="M96 18 L24 96" />
      </g>
      <g fill={`url(#${g})`}><rect x="18" y="12" width="10" height="4" rx="1" transform="rotate(45 23 14)" /><rect x="92" y="12" width="10" height="4" rx="1" transform="rotate(-45 97 14)" /></g>
      {leaves(1)}{leaves(-1)}
      {/* shield */}
      <path d="M60 16 L88 26 V54 C88 74 76 88 60 96 C44 88 32 74 32 54 V26 Z" fill={`url(#${g})`} stroke={METAL.gold[3]} strokeWidth="1.2" />
      <path d="M60 22 L82 30 V54 C82 70 72 82 60 89 C48 82 38 70 38 54 V30 Z" fill="none" stroke={METAL.gold[3]} strokeOpacity=".55" strokeWidth="1" />
      <path d="M42 32 C42 58 48 74 56 84" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2.5" strokeLinecap="round" />
      <text x="60" y="56" textAnchor="middle" fontSize="15" fontWeight="800" className="engrave">AP</text>
      <text x="60" y="68" textAnchor="middle" fontSize="6.5" fontWeight="700" className="engrave">{value}</text>
      {/* banner */}
      <path d="M26 98 H94 L90 106 L94 114 H26 L30 106 Z" fill={`url(#${g})`} />
      <text x="60" y="109" textAnchor="middle" fontSize="6.5" fontWeight="800" letterSpacing="1.2" className="engrave">ALL-PLAY</text>
      <path d="M36 118 H84 L87 134 H33 Z" fill="#2c1c11" />
      <rect x="44" y="121" width="32" height="10" rx="1.5" fill={`url(#${g})`} />
      <text x="60" y="128.5" textAnchor="middle" fontSize="7.5" fontWeight="800" fill={METAL.gold[3]}>{year}</text>
    </svg>
  )
}

function Toilet({ year }: { kind: Kind; year: number; nth?: number }) {
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
