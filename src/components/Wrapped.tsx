import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLeague } from '../lib/data'
import { fmt, ordinal, record } from '../lib/stats'
import { seasonWrapped, type Wrapped } from '../lib/wrapped'
import { playersOf } from '../lib/players'
import { Avatar } from './ui'
import { Icon } from './Icon'

type Slide = { key: string; tone: string; kicker: string; big: ReactNode; caption: ReactNode; extra?: ReactNode }

/** Button that opens a member's Season Wrapped in a pop-up story. */
export function SeasonWrapped({ year }: { year: number }) {
  const lg = useLeague()
  const s = lg.seasons.find((x) => x.year === year)!
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="wrapped-open" onClick={() => setOpen(true)}>
        <span className="wrapped-open-icon"><Icon name="star" size={18} /></span>
        <span className="wrapped-open-text"><b>{year} Wrapped</b><span className="muted small">{s.complete ? 'Every member’s season, as a story' : `The season so far, through week ${s.weeksPlayed}`}</span></span>
        <Icon name="chevronRight" size={18} />
      </button>
      {open && createPortal(<WrappedModal year={year} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

function WrappedModal({ year, onClose }: { year: number; onClose: () => void }) {
  const lg = useLeague()
  const s = lg.seasons.find((x) => x.year === year)!
  const ids = s.teamSeasons.map((t) => t.memberId)
  const [member, setMember] = useState(ids[0])
  const w = seasonWrapped(lg, year, member)
  const track = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)
  useEffect(() => { track.current?.scrollTo({ left: 0 }); setAt(0) }, [member])
  useEffect(() => {
    document.body.classList.add('no-scroll')
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.classList.remove('no-scroll'); window.removeEventListener('keydown', onKey) }
  }, [onClose])
  const slides = w ? buildSlides(lg, w) : []
  const go = (k: number) => {
    const el = track.current
    if (!el) return
    el.scrollTo({ left: Math.max(0, Math.min(slides.length - 1, k)) * el.clientWidth, behavior: 'smooth' })
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(at + 1); if (e.key === 'ArrowLeft') go(at - 1) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const onScroll = () => { const el = track.current; if (el) setAt(Math.round(el.scrollLeft / el.clientWidth)) }

  return (
    <div className="wrapped-modal" role="dialog" aria-modal="true" aria-label={`${year} Wrapped`} onClick={onClose}>
      <div className="wrapped-box" onClick={(e) => e.stopPropagation()}>
        <div className="wrapped-bar">
          <select value={member} onChange={(e) => setMember(e.target.value)} aria-label="Member">{ids.map((id) => <option key={id} value={id}>{lg.memberById[id]?.name ?? id}</option>)}</select>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button>
        </div>
        <div className="wrapped">
          <div className="wrapped-track" ref={track} onScroll={onScroll}>
            {slides.map((sl, i) => (
              <section key={sl.key} className={`wrapped-slide tone-${sl.tone}`} aria-label={`Slide ${i + 1} of ${slides.length}`}>
                <div className="wrapped-kicker">{sl.kicker}</div>
                <div className="wrapped-big">{sl.big}</div>
                <div className="wrapped-caption">{sl.caption}</div>
                {sl.extra}
              </section>
            ))}
          </div>
          <button className="wrapped-nav prev" onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous"><Icon name="chevronLeft" size={18} /></button>
          <button className="wrapped-nav next" onClick={() => go(at + 1)} disabled={at >= slides.length - 1} aria-label="Next"><Icon name="chevronRight" size={18} /></button>
          <div className="wrapped-dots">{slides.map((sl, i) => <button key={sl.key} className={i === at ? 'on' : ''} onClick={() => go(i)} aria-label={`Go to slide ${i + 1}`} />)}</div>
        </div>
      </div>
    </div>
  )
}

function buildSlides(lg: ReturnType<typeof useLeague>, w: Wrapped): Slide[] {
  const name = (id: string) => lg.memberById[id]?.name ?? id
  const pm = playersOf(lg)
  const player = (id: string) => pm.info[id]?.name ?? 'Unknown player'
  const me = name(w.memberId)
  const team = lg.seasons.find((s) => s.year === w.year)?.teamSeasons.find((t) => t.memberId === w.memberId)?.teamName
  const out: Slide[] = []
  const N = w.teams

  out.push({
    key: 'intro', tone: 'gold', kicker: `${w.year} Wrapped`,
    big: <span className="wrapped-intro"><Avatar id={w.memberId} size={72} /><span>{me}</span></span>,
    caption: team ? <>as <b>{team}</b>. {w.complete ? 'Here’s how the season went.' : `Here’s the season so far, through week ${w.weeksPlayed}.`}</> : 'Here’s how the season went.',
  })

  const f = w.finish
  out.push({
    key: 'finish', tone: f.champion ? 'gold' : f.toiletBowl ? 'red' : f.madePlayoffs ? 'green' : 'blue',
    kicker: w.complete ? 'The finish' : 'Where things stand',
    big: f.champion ? 'Champion' : ordinal(f.rank),
    caption: f.champion ? <>The title is yours. {record(w.record.wins, w.record.losses, w.record.ties)} in the regular season, {ordinal(f.regRank)} seed.</>
      : f.toiletBowl ? <>Last place, toilet bowl and all. {record(w.record.wins, w.record.losses, w.record.ties)} in the regular season.</>
      : w.complete ? <>{f.madePlayoffs ? `Made the playoffs as the ${ordinal(f.regRank)} seed` : `Missed the playoffs, ${ordinal(f.regRank)} in the standings`}, going {record(w.record.wins, w.record.losses, w.record.ties)}.</>
      : <>{record(w.record.wins, w.record.losses, w.record.ties)} so far, counting the weekly median game.</>,
  })

  out.push({
    key: 'points', tone: 'blue', kicker: 'Points scored',
    big: fmt(w.pf, 1),
    caption: <>{ordinal(w.pfRank)} of {N} in the league: {fmt(w.ppg, 1)} a week and {w.share.toFixed(1)}% of every point scored.{w.highScores ? ` Top score of the week ${w.highScores} time${w.highScores > 1 ? 's' : ''}.` : ''}</>,
  })

  out.push({
    key: 'best', tone: 'green', kicker: 'Best week',
    big: fmt(w.best.pts, 2),
    caption: <>Week {w.best.week} {w.best.playoff ? '(playoffs) ' : ''}against {name(w.best.opp)}. {w.best.weekRank === 1 ? 'The top score in the league that week.' : `${ordinal(w.best.weekRank)} best in the league that week.`}</>,
  })
  out.push({
    key: 'worst', tone: 'red', kicker: 'Worst week',
    big: fmt(w.worst.pts, 2),
    caption: w.worst.pts > w.worst.oppPts
      ? <>Week {w.worst.week}, and you still beat {name(w.worst.opp)} ({fmt(w.worst.oppPts, 1)}). Ugly, but a win.</>
      : <>Week {w.worst.week}, a loss to {name(w.worst.opp)} ({fmt(w.worst.oppPts, 1)}). {w.worst.weekRank === N ? 'The lowest score in the league that week.' : 'We don’t talk about it.'}</>,
  })

  if (w.mvp) out.push({
    key: 'mvp', tone: 'gold', kicker: 'Your MVP',
    big: player(w.mvp.playerId),
    caption: <>{fmt(w.mvp.pts, 1)} points in your starting lineup across {w.mvp.starts} start{w.mvp.starts > 1 ? 's' : ''}.</>,
  })
  if (w.pickup) out.push({
    key: 'pickup', tone: 'green', kicker: 'Best pickup',
    big: player(w.pickup.playerId),
    caption: <>Grabbed in week {w.pickup.week}, then added {fmt(w.pickup.gain, 1)} points to your lineup.</>,
  })
  if (w.regret) out.push({
    key: 'regret', tone: 'red', kicker: 'The one that got away',
    big: player(w.regret.playerId),
    caption: <>Dropped in week {w.regret.week}. Keeping him would have added {fmt(w.regret.after, 1)} points to your lineup.</>,
  })

  const L = w.luck
  out.push({
    key: 'luck', tone: L.diff >= 0 ? 'green' : 'purple', kicker: L.diff >= 0 ? 'Lady luck' : 'Robbed',
    big: `${L.diff >= 0 ? '+' : ''}${L.diff.toFixed(1)} wins`,
    caption: <>You won {L.wins} head-to-head game{L.wins === 1 ? '' : 's'}; your scores would have won {L.expected.toFixed(1)} against an average schedule. {L.rank === 1 ? 'The luckiest team in the league.' : L.rank === N ? 'The unluckiest team in the league.' : `${ordinal(L.rank)} luckiest of ${N}.`}</>,
  })

  if (w.bigWin || w.closeLoss) out.push({
    key: 'games', tone: 'blue', kicker: 'Games to remember',
    big: w.bigWin ? `+${fmt(w.bigWin.pts - w.bigWin.oppPts, 1)}` : `−${fmt(w.closeLoss!.oppPts - w.closeLoss!.pts, 1)}`,
    caption: <>
      {w.bigWin && <>Biggest win: {fmt(w.bigWin.pts, 1)}–{fmt(w.bigWin.oppPts, 1)} over {name(w.bigWin.opp)} in week {w.bigWin.week}. </>}
      {w.closeLoss && <>Most painful loss: {fmt(w.closeLoss.pts, 1)}–{fmt(w.closeLoss.oppPts, 1)} to {name(w.closeLoss.opp)} in week {w.closeLoss.week}.</>}
    </>,
  })

  if (w.nemesis || w.victim) out.push({
    key: 'rivals', tone: 'purple', kicker: 'Rivals',
    big: w.nemesis ? name(w.nemesis.id) : name(w.victim!.id),
    caption: <>
      {w.nemesis && <>Your nemesis: {w.nemesis.w}–{w.nemesis.l} against {name(w.nemesis.id)}. </>}
      {w.victim && w.victim.id !== w.nemesis?.id && <>Your favorite opponent: {w.victim.w}–{w.victim.l} against {name(w.victim.id)}.</>}
    </>,
  })

  const d = w.elo.end - w.elo.start
  out.push({
    key: 'elo', tone: d >= 0 ? 'green' : 'red', kicker: 'Elo rating',
    big: `${d >= 0 ? '+' : '−'}${Math.round(Math.abs(d))}`,
    caption: <>From about {Math.round(w.elo.start)} to {Math.round(w.elo.end)} {w.complete ? 'over the season' : 'so far'}.</>,
  })

  out.push({
    key: 'summary', tone: 'gold', kicker: `${me}’s ${w.year}`, big: f.champion ? 'Champion' : ordinal(f.rank),
    caption: 'Screenshot this one for the group chat.',
    extra: (
      <dl className="wrapped-summary">
        <div><dt>Record</dt><dd>{record(w.record.wins, w.record.losses, w.record.ties)}</dd></div>
        <div><dt>Points</dt><dd>{fmt(w.pf, 1)}</dd></div>
        <div><dt>Best week</dt><dd>{fmt(w.best.pts, 1)}</dd></div>
        <div><dt>Luck</dt><dd>{L.diff >= 0 ? '+' : ''}{L.diff.toFixed(1)}</dd></div>
        {w.mvp && <div><dt>MVP</dt><dd>{player(w.mvp.playerId)}</dd></div>}
        {w.nemesis && <div><dt>Nemesis</dt><dd>{name(w.nemesis.id)}</dd></div>}
      </dl>
    ),
  })
  return out
}
