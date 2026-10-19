import { Link, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLeague } from '../lib/data'
import { careers, fmt, headToHead, ordinal, pct, record, type TeamSeason } from '../lib/stats'
import { Avatar, Card, MemberLink, RankBadge, Stat, Table, Trophies, TIPS, type Col } from '../components/ui'
import { seasonRange, signed } from './History'

export function Members() {
  const lg = useLeague()
  const rows = careers(lg)
  const current = lg.seasons[0].year
  return (
    <div className="page">
      <h1>Members</h1>
      <div className="member-grid">
        {rows.map((r) => (
          <Link key={r.member.id} to={`/member/${r.member.id}`} className={`member-card ${r.seasons.includes(current) ? '' : 'inactive'}`}>
            <Avatar id={r.member.id} size={56} />
            <div className="member-card-name">{r.member.name}</div>
            <div className="muted small">{seasonRange(r.seasons)} · {record(r.wins, r.losses, r.ties)}</div>
            <Trophies gold={r.titles} silver={r.seconds} bronze={r.thirds} />
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function Member() {
  const lg = useLeague()
  const id = useParams().id!
  const row = careers(lg).find((r) => r.member.id === id)
  if (!row) return <p>Member not found.</p>
  const seasons = lg.seasons
    .map((s) => ({ s, t: s.teamSeasons.find((t) => t.memberId === id) }))
    .filter((x): x is { s: (typeof lg.seasons)[number]; t: TeamSeason } => !!x.t)
  const titles = seasons.filter((x) => x.t.finalRank === 1).map((x) => x.s.year)
  const best = [...seasons].sort((a, b) => b.t.seasonScore - a.t.seasonScore)[0]
  const medalScore = row.titles * 10 + row.seconds * 6 + row.thirds * 4 + row.playoffs * 2
  const others = lg.members.filter((m) => m.id !== id)
  const rivals = others
    .map((m) => ({ m, h: headToHead(lg, id, m.id) }))
    .filter((x) => x.h.games.length > 0)
    .sort((a, b) => b.h.games.length - a.h.games.length || b.h.w - b.h.l - (a.h.w - a.h.l))

  const blurb = `${row.member.name} has played ${row.seasons.length} season${row.seasons.length > 1 ? 's' : ''} in the league, going ${record(row.wins, row.losses, row.ties)} overall with a ${record(row.apW, row.apL, row.apT)} all-play mark. They have made the playoffs ${row.playoffs} time${row.playoffs === 1 ? '' : 's'}${row.titles ? ` and won ${row.titles} championship${row.titles > 1 ? 's' : ''} (${titles.join(', ')})` : ''}, averaging ${fmt(row.pf / (row.games || 1))} points per game.${best ? ` Their best season by season score was ${best.s.year} (${best.t.seasonScore.toFixed(1)}).` : ''}`

  const cols: Col<{ s: (typeof seasons)[number]['s']; t: TeamSeason }>[] = [
    { key: 'season', label: 'Season', render: ({ s, t }) => <Link to={`/season/${s.year}/team/${t.memberId}`}><b>{s.year}</b></Link>, sort: ({ s }) => s.year },
    { key: 'team', label: 'Team', render: ({ t }) => t.teamName },
    { key: 'rec', label: 'Record', render: ({ t }) => record(t.wins, t.losses, t.ties), sort: ({ t }) => t.wins, tip: TIPS.median },
    { key: 'ap', label: 'All-Play', render: ({ t }) => record(t.apW, t.apL, t.apT), sort: ({ t }) => t.apW, tip: TIPS.allPlay },
    { key: 'pf', label: 'PF (avg)', render: ({ t }) => `${fmt(t.pf)} (${fmt(t.pf / (t.games || 1))})`, sort: ({ t }) => t.pf, align: 'right' },
    { key: 'share', label: 'Share', render: ({ t }) => `${t.pointsShare.toFixed(2)}%`, sort: ({ t }) => t.pointsShare, tip: TIPS.share, align: 'right' },
    { key: 'pa', label: 'PA (avg)', render: ({ t }) => `${fmt(t.pa)} (${fmt(t.pa / (t.games || 1))})`, sort: ({ t }) => t.pa, align: 'right' },
    { key: 'luck', label: 'Luck', render: ({ t }) => <span className={t.luck >= 0 ? 'pos' : 'neg'}>{signed(t.luck)}</span>, sort: ({ t }) => t.luck, tip: TIPS.luck, align: 'right' },
    { key: 'sos', label: 'SOS', render: ({ t }) => fmt(t.sos), sort: ({ t }) => t.sos, tip: TIPS.sos, align: 'right' },
    { key: 'coach', label: 'Coach', render: ({ t }) => (t.coachScore != null ? t.coachScore.toFixed(1) : '—'), sort: ({ t }) => t.coachScore ?? 0, tip: TIPS.coach, align: 'right' },
    { key: 'score', label: 'Score', render: ({ t }) => t.seasonScore.toFixed(1), sort: ({ t }) => t.seasonScore, tip: TIPS.score, align: 'right' },
    { key: 'rank', label: 'Finish', render: ({ s, t }) => (s.complete ? <RankBadge rank={t.finalRank} n={s.teams} /> : <span className="muted">{ordinal(t.regRank)}*</span>), sort: ({ t }) => -(t.finalRank ?? t.regRank) },
  ]

  return (
    <div className="page">
      <div className="title-row">
        <Avatar id={id} size={72} />
        <div>
          <h1>{row.member.name}</h1>
          <p className="muted">{row.seasons.length} seasons · {record(row.wins, row.losses, row.ties)} league record</p>
        </div>
      </div>
      <Card title="Overview">
        <p className="blurb">{blurb}</p>
        <div className="stat-grid">
          <Stat icon="trophy" label={titles.length ? `Championships · ${titles.join(', ')}` : 'Championships'} value={row.titles} />
          <Stat icon="medal" label="Medal score" value={medalScore} tip="10 per title, 6 per runner-up, 4 per third, 2 per playoff trip." />
          <Stat icon="trendUp" label="League rating" value={row.elo} tip={TIPS.elo} />
          <Stat icon="chart" label="Avg season score" value={row.avgScore.toFixed(1)} tip={TIPS.score} />
          <Stat icon="star" label="Avg points" value={fmt(row.pf / (row.games || 1))} />
          <Stat icon="shield" label="Avg opp. points" value={fmt(row.pa / (row.games || 1))} />
          <Stat icon="target" label="Playoff record" value={record(row.playoffW, row.playoffL)} />
          <Stat icon="medal" label="Avg finish" value={row.avgFinish != null ? row.avgFinish.toFixed(1) : '—'} />
        </div>
        <div className="finish-strip">
          {[...seasons].reverse().map(({ s, t }) => (
            <Link key={s.year} to={`/season/${s.year}/team/${id}`} className="finish-cell">
              <RankBadge rank={s.complete ? t.finalRank : null} n={s.teams} />
              <span className="muted small">{s.year}</span>
            </Link>
          ))}
        </div>
      </Card>

      <Card title="Season History">
        <Table rows={seasons} cols={cols} rowKey={({ s }) => String(s.year)} />
        <p className="muted small">* season in progress — current regular-season rank.</p>
      </Card>

      <Card title="Points by Season">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={[...seasons].reverse().map(({ s, t }) => ({ season: String(s.year), PF: +(t.pf / (t.games || 1)).toFixed(2), PA: +(t.pa / (t.games || 1)).toFixed(2) }))}>
            <CartesianGrid stroke="var(--grid)" />
            <XAxis dataKey="season" stroke="var(--muted)" />
            <YAxis stroke="var(--muted)" domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)' }} />
            <Bar dataKey="PF" name="Avg points for" fill="#7c8cff" />
            <Bar dataKey="PA" name="Avg points against" fill="#ff7a8a" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Rivalries" sub="Head-to-head record against every opponent (incl. playoffs).">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Opponent</th><th>Record</th><th>Win %</th><th className="right">PF</th><th className="right">PA</th><th>Streak</th><th></th></tr></thead>
            <tbody>
              {rivals.map(({ m, h }) => (
                <tr key={m.id}>
                  <td><MemberLink id={m.id} /></td>
                  <td>{record(h.w, h.l, h.t)}</td>
                  <td>{pct(h.w, h.l, h.t)}</td>
                  <td className="right">{fmt(h.pf)}</td>
                  <td className="right">{fmt(h.pa)}</td>
                  <td><span className={`result ${h.streak[0]}`}>{h.streak}</span></td>
                  <td><Link to={`/versus/${id}/${m.id}`}>Details →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
