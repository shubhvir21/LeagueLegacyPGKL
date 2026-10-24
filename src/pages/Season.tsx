import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { fmt, ordinal, pct, record, type Game, type Season as SeasonT, type TeamSeason } from '../lib/stats'
import { Avatar, Card, MemberLink, RankBadge, Stat, Table, TeamName, TIPS, type Col } from '../components/ui'
import { signed } from './History'

export function SeasonIndex() {
  const lg = useLeague()
  return <Navigate to={`/season/${lg.seasons[0].year}`} replace />
}

export function SeasonPicker({ year, path = (y: number) => `/season/${y}` }: { year: number; path?: (y: number) => string }) {
  const lg = useLeague()
  const nav = useNavigate()
  return (
    <select value={year} onChange={(e) => nav(path(Number(e.target.value)))}>
      {lg.seasons.map((s) => <option key={s.year} value={s.year}>{s.year}</option>)}
    </select>
  )
}

export default function Season() {
  const lg = useLeague()
  const year = Number(useParams().year)
  const s = lg.seasons.find((x) => x.year === year)
  if (!s) return <p>No season {year}.</p>
  const ts = s.teamSeasons
  const top = (f: (t: TeamSeason) => number) => [...ts].sort((a, b) => f(b) - f(a))[0]
  const bottom = (f: (t: TeamSeason) => number) => [...ts].sort((a, b) => f(a) - f(b))[0]
  const regChamp = ts.find((t) => t.regRank === 1)!
  const ptsChamp = top((t) => t.pf)
  const apChamp = top((t) => t.apW)
  const last = [...ts].sort((a, b) => (b.finalRank ?? b.regRank) - (a.finalRank ?? a.regRank))[0]
  const lowest = bottom((t) => t.pf)
  const worstAp = bottom((t) => t.apW)
  const name = (t?: TeamSeason | null) => (t ? lg.memberById[t.memberId]?.name : '—')
  const podium = [2, 1, 3].map((r) => ts.find((t) => t.finalRank === r))

  return (
    <div className="page">
      <div className="page-head">
        <h1>{year} Season</h1>
        <SeasonPicker year={year} />
      </div>
      <p className="muted">
        {s.teams} teams · H2H points + median · {s.playoffTeams} playoff spots · {s.complete ? 'Final' : `Through week ${s.weeksPlayed}`}
      </p>

      <Card title="Summary">
        <p className="blurb">
          {s.complete ? (
            <>
              The {year} season ended with <b>{name(podium[1])}</b> winning the title over <b>{name(podium[0])}</b>, with{' '}
              <b>{name(podium[2])}</b> taking third. <b>{name(regChamp)}</b> finished the regular season on top at{' '}
              {record(regChamp.wins, regChamp.losses, regChamp.ties)}, and <b>{name(ptsChamp)}</b> led the league with{' '}
              {fmt(ptsChamp.pf)} points.{' '}
              {regChamp.finalRank !== 1 && 'The best regular-season team did not take home the trophy.'}
            </>
          ) : (
            <>
              Through week {s.weeksPlayed}, <b>{name(regChamp)}</b> leads at {record(regChamp.wins, regChamp.losses, regChamp.ties)} and{' '}
              <b>{name(ptsChamp)}</b> has scored the most points ({fmt(ptsChamp.pf)}).
            </>
          )}
        </p>
        {s.complete && (
          <div className="podium">
            {podium.map((t, i) => t && (
              <Link key={t.memberId} to={`/season/${year}/team/${t.memberId}`} className={`podium-step p${[2, 1, 3][i]}`}>
                <Avatar id={t.memberId} size={48} />
                <div className="podium-name">{t.teamName}</div>
                <div className="muted small">{name(t)}</div>
                <div className={`podium-place place p${[2, 1, 3][i]}`}>{['2nd', 'Champion', '3rd'][i]}</div>
              </Link>
            ))}
          </div>
        )}
        <div className="stat-grid">
          <Stat icon="crown" label={`${s.complete ? "Reg. season champ" : "Current leader"} · ${record(regChamp.wins, regChamp.losses, regChamp.ties)}`} value={name(regChamp)} />
          <Stat icon="star" label={`Points champ · ${fmt(ptsChamp.pf)}`} value={name(ptsChamp)} />
          <Stat icon="crown" label={`All-play champ · ${record(apChamp.apW, apChamp.apL, apChamp.apT)}`} value={name(apChamp)} />
          <Stat icon="trendDown" label={s.complete ? 'Last place' : 'Currently last'} value={name(last)} />
          <Stat icon="trendDown" label={`Lowest scorer · ${fmt(lowest.pf)}`} value={name(lowest)} />
          <Stat icon="trendDown" label={`Worst all-play · ${record(worstAp.apW, worstAp.apL, worstAp.apT)}`} value={name(worstAp)} />
        </div>
      </Card>

      <Card title="Standings" sub="Regular-season standings. Record includes median games.">
        <StandingsTable s={s} />
      </Card>

      {s.complete && (
        <Card title="Playoffs" sub="Winners bracket results.">
          <Bracket s={s} games={lg.games.filter((g) => g.season === year && g.bracket === 'winners')} />
        </Card>
      )}

      <Card title="Weekly Matchups">
        <WeekMatchups s={s} games={lg.games.filter((g) => g.season === year)} />
      </Card>
    </div>
  )
}

function StandingsTable({ s }: { s: SeasonT }) {
  const cols: Col<TeamSeason>[] = [
    { key: 'rank', label: 'Rank', render: (t) => <RankBadge rank={t.finalRank ?? t.regRank} n={s.teams} final={s.complete} />, sort: (t) => -(t.finalRank ?? t.regRank) },
    { key: 'team', label: 'Team', render: (t) => <Link to={`/season/${s.year}/team/${t.memberId}`} className="member-link"><Avatar id={t.memberId} /><span>{t.teamName}</span></Link> },
    { key: 'mgr', label: 'Manager', render: (t) => <MemberLink id={t.memberId} avatar={false} /> },
    { key: 'rec', label: 'Record', render: (t) => record(t.wins, t.losses, t.ties), sort: (t) => t.wins + t.pf / 1e5, tip: TIPS.median },
    { key: 'h2h', label: 'H2H', render: (t) => record(t.h2hW, t.h2hL, t.h2hT), sort: (t) => t.h2hW },
    { key: 'med', label: 'vs Median', render: (t) => record(t.medW, t.medL), sort: (t) => t.medW },
    { key: 'ap', label: 'All-Play', render: (t) => `${record(t.apW, t.apL, t.apT)} (${pct(t.apW, t.apL, t.apT)})`, sort: (t) => t.apW, tip: TIPS.allPlay },
    { key: 'pf', label: 'PF', render: (t) => fmt(t.pf), sort: (t) => t.pf, align: 'right' },
    { key: 'pa', label: 'PA', render: (t) => fmt(t.pa), sort: (t) => t.pa, align: 'right' },
    { key: 'luck', label: 'Luck', render: (t) => <span className={t.luck >= 0 ? 'pos' : 'neg'}>{signed(t.luck)}</span>, sort: (t) => t.luck, tip: TIPS.luck, align: 'right' },
    { key: 'coach', label: 'Coach', render: (t) => (t.coachScore != null ? t.coachScore.toFixed(1) : '—'), sort: (t) => t.coachScore ?? 0, tip: TIPS.coach, align: 'right' },
    { key: 'score', label: 'Score', render: (t) => <b>{t.seasonScore != null ? t.seasonScore.toFixed(1) : '—'}</b>, sort: (t) => t.seasonScore ?? -1, tip: TIPS.score, align: 'right' },
  ]
  return <Table rows={s.teamSeasons} cols={cols} rowKey={(t) => t.memberId} />
}

export function Bracket({ s, games }: { s: SeasonT; games: Game[] }) {
  const lg = useLeague()
  const rounds = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b)
  const roundName = (i: number) => (i === rounds.length - 1 ? 'Finals' : i === rounds.length - 2 ? 'Semifinals' : 'Quarterfinals')
  return (
    <div className="bracket">
      {rounds.map((wk, i) => (
        <div key={wk} className="bracket-round">
          <h3>{roundName(i)} <span className="muted small">Week {wk}</span></h3>
          {games.filter((g) => g.week === wk).sort((x, y) => (x.place ?? 0) - (y.place ?? 0)).map((g) => (
            <div key={g.a + g.b}>
              {g.place && <div className={`game-label ${g.place === 1 ? 'final' : ''}`}>{g.place === 1 ? 'Championship' : `${ordinal(g.place)} place`}</div>}
              <GameCard g={g} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function GameCard({ g, label }: { g: Game; label?: (id: string) => string | undefined }) {
  const lg = useLeague()
  const nm = (id: string) => (label ? <span>{label(id) ?? lg.memberById[id]?.name}</span> : <TeamName id={id} season={g.season} />)
  const aWin = g.aPts > g.bPts, bWin = g.bPts > g.aPts
  return (
    <div className="game">
      <Link to={`/member/${g.a}`} className={`game-side ${aWin ? 'win' : ''}`}><Avatar id={g.a} size={22} /> {nm(g.a)}<b>{fmt(g.aPts)}</b></Link>
      <Link to={`/member/${g.b}`} className={`game-side ${bWin ? 'win' : ''}`}><Avatar id={g.b} size={22} /> {nm(g.b)}<b>{fmt(g.bPts)}</b></Link>
    </div>
  )
}

export function WeekMatchups({ s, games }: { s: SeasonT; games: Game[] }) {
  const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b)
  const [week, setWeek] = useState(weeks.at(-1) ?? 1)
  const wk = games.filter((g) => g.week === week)
  return (
    <>
      <div className="week-pills">
        {weeks.map((w) => (
          <button key={w} className={w === week ? 'pill-btn active' : 'pill-btn'} onClick={() => setWeek(w)}>
            {w >= s.playoffStart ? `P${w - s.playoffStart + 1}` : `W${w}`}
          </button>
        ))}
      </div>
      <div className="game-grid">
        {wk.map((g) => (
          <div key={g.a + g.b}>
            {g.bracket && <div className="game-label">{g.bracket === 'winners' ? 'Playoffs' : 'Consolation'}</div>}
            <GameCard g={g} />
          </div>
        ))}
      </div>
    </>
  )
}

export function TeamSeason() {
  const lg = useLeague()
  const { year: y, member } = useParams()
  const year = Number(y)
  const s = lg.seasons.find((x) => x.year === year)
  const t = s?.teamSeasons.find((x) => x.memberId === member)
  if (!s || !t) return <p>Team not found.</p>
  const games = lg.games
    .filter((g) => g.season === year && (g.a === t.memberId || g.b === t.memberId))
    .map((g) => (g.a === t.memberId ? g : { ...g, a: g.b, b: g.a, aPts: g.bPts, bPts: g.aPts }))
  const teamName = (id: string) => s.teamSeasons.find((x) => x.memberId === id)?.teamName
  return (
    <div className="page">
      <div className="page-head">
        <div className="title-row">
          <Avatar id={t.memberId} size={56} />
          <div>
            <h1>{t.teamName}</h1>
            <p className="muted"><MemberLink id={t.memberId} avatar={false} /> · <Link to={`/season/${year}`}>{year} season</Link></p>
          </div>
        </div>
        <SeasonPicker year={year} path={(yy) => `/season/${yy}/team/${t.memberId}`} />
      </div>
      <div className="stat-grid">
        <Stat icon="medal" label={s.complete ? 'Final finish' : 'Current rank'} value={ordinal(t.finalRank ?? t.regRank)} />
        <Stat icon="list" label="Record" value={record(t.wins, t.losses, t.ties)} tip={TIPS.median} />
        <Stat icon="swords" label="H2H record" value={record(t.h2hW, t.h2hL, t.h2hT)} />
        <Stat icon="crown" label="All-play" value={record(t.apW, t.apL, t.apT)} tip={TIPS.allPlay} />
        <Stat icon="star" label="Points for" value={fmt(t.pf)} />
        <Stat icon="shield" label="Points against" value={fmt(t.pa)} />
        <Stat icon="shield" label="Strength of schedule" value={fmt(t.sos)} tip={TIPS.sos} />
        <Stat icon="scale" label="Luck" value={signed(t.luck)} tip={TIPS.luck} />
        <Stat icon="zap" label="Coach score" value={t.coachScore != null ? t.coachScore.toFixed(1) : '—'} tip={TIPS.coach} />
        <Stat icon="chart" label="Points share" value={`${t.pointsShare.toFixed(2)}%`} tip={TIPS.share} />
        <Stat icon="trendUp" label="Season score" value={t.seasonScore != null ? t.seasonScore.toFixed(1) : '—'} tip={TIPS.score} />
        <Stat icon="flame" label="Weekly high scores" value={t.highScores} />
      </div>
      <Card title="Weekly Results">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Week</th><th>Opponent</th><th>Result</th><th className="right">Score</th><th className="right">Margin</th></tr></thead>
            <tbody>
              {games.map((g) => {
                const res = g.aPts > g.bPts ? 'W' : g.aPts < g.bPts ? 'L' : 'T'
                return (
                  <tr key={g.week}>
                    <td>{g.playoff ? `${g.bracket === 'winners' ? 'Playoffs' : 'Consolation'} (W${g.week})` : `Week ${g.week}`}</td>
                    <td><Link to={`/season/${year}/team/${g.b}`} className="member-link"><Avatar id={g.b} /><span>{teamName(g.b)}</span></Link></td>
                    <td><span className={`result ${res}`}>{res}</span></td>
                    <td className="right">{fmt(g.aPts)} – {fmt(g.bPts)}</td>
                    <td className={`right ${res === 'W' ? 'pos' : 'neg'}`}>{signed(g.aPts - g.bPts)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
