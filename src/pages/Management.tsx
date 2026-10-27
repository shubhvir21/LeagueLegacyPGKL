import { useMemo, type ReactNode } from 'react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { useLeague } from '../lib/data'
import { managementCached, managementCareer, type ManagerSeason } from '../lib/management'
import { fmt } from '../lib/stats'
import { Card, MemberLink, Stat, Table, type Col } from '../components/ui'
import { signed } from './History'

const T = {
  manager: 'Manager Score (0–100, 50 = league average that season): 45% Coach Score, 30% waiver value, 25% trade value.',
  coach: 'Coach Score (0–100): 70% lineup efficiency, 30% avoiding losses your optimal lineup would have won. Season-relative.',
  eff: 'Points scored ÷ points your best possible lineup would have scored (regular season).',
  bench: 'Points left on the bench: optimal lineup minus actual, per season.',
  perfect: 'Weeks where the lineup you started was the best possible one.',
  ll: 'Head-to-head losses your optimal lineup would have won.',
  waiver: 'Net lineup points from waiver/FA moves: what pickups added to your best possible lineup, minus what the players you cut would have added.',
  faab: 'Share of the season’s FAAB budget spent.',
  vpf: 'Waiver value per 1% of FAAB spent — bang for the buck.',
  trade: 'Lineup points gained from trades vs. keeping the players you gave up.',
  pickup: 'Share of starting-lineup points that came from in-season pickups.',
  top3: 'Share of starting-lineup points from the team’s 3 best starters. High = top-heavy roster.',
}

type Row = ManagerSeason & { seasons?: number }

/** Lineup and roster-building scores. `view` is 'All-Time' or a season year; `extra` adds stat tiles. */
export function ManagementSection({ view, extra }: { view: string; extra?: ReactNode }) {
  const lg = useLeague()
  const all = useMemo(() => managementCached(lg), [lg])
  const rows: Row[] = view === 'All-Time' ? managementCareer(all) : all.filter((r) => r.season === Number(view))
  const perSeason = view === 'All-Time'
  const best = <K extends keyof Row>(k: K, asc = false) => [...rows].sort((a, b) => (asc ? 1 : -1) * (Number(a[k]) - Number(b[k])))[0]
  const name = (r?: Row) => (r ? lg.memberById[r.memberId]?.name : '—')
  const inProgress = view !== 'All-Time' && rows[0]?.inProgress

  const cols: Col<Row>[] = [
    { key: 'm', label: 'Member', render: (r) => <MemberLink id={r.memberId} />, sort: (r) => (lg.memberById[r.memberId]?.name ?? '').toLowerCase() },
    { key: 'mgr', label: 'Manager', render: (r) => <ScorePill v={r.managerScore} />, sort: (r) => r.managerScore, tip: T.manager },
    { key: 'coach', label: 'Coach', render: (r) => <ScorePill v={r.coachScore} />, sort: (r) => r.coachScore, tip: T.coach },
    { key: 'eff', label: 'Lineup Eff.', render: (r) => `${r.efficiency.toFixed(1)}%`, sort: (r) => r.efficiency, align: 'right', tip: T.eff },
    { key: 'bench', label: perSeason ? 'Bench Pts / Season' : 'Bench Pts', render: (r) => fmt(r.benchPts, 0), sort: (r) => r.benchPts, align: 'right', tip: T.bench },
    { key: 'perf', label: 'Perfect Wks', render: (r) => r.perfectWeeks, sort: (r) => r.perfectWeeks, align: 'right', tip: T.perfect },
    { key: 'll', label: 'Lineup Losses', render: (r) => <span className={r.lineupLosses ? 'neg' : ''}>{r.lineupLosses}</span>, sort: (r) => r.lineupLosses, align: 'right', tip: T.ll },
    { key: 'adds', label: perSeason ? 'Adds / Season' : 'Adds', render: (r) => fmt(r.adds, perSeason ? 1 : 0), sort: (r) => r.adds, align: 'right' },
    { key: 'wv', label: 'Waiver Value', render: (r) => signed(r.waiverValue), sort: (r) => r.waiverValue, align: 'right', tip: T.waiver },
    { key: 'faab', label: 'FAAB Used', render: (r) => `${Math.round(r.faabPct)}%`, sort: (r) => r.faabPct, align: 'right', tip: T.faab },
    { key: 'vpf', label: 'Value / FAAB', render: (r) => (r.faabPct ? fmt(r.valuePerFaab) : '—'), sort: (r) => r.valuePerFaab, align: 'right', tip: T.vpf },
    { key: 'tr', label: 'Trades', render: (r) => r.trades, sort: (r) => r.trades, align: 'right' },
    { key: 'tv', label: 'Trade Value', render: (r) => <span className={r.tradeValue >= 0 ? 'pos' : 'neg'}>{signed(r.tradeValue)}</span>, sort: (r) => r.tradeValue, align: 'right', tip: T.trade },
    { key: 'pu', label: 'Pickup Share', render: (r) => `${Math.round(r.pickupShare)}%`, sort: (r) => r.pickupShare, align: 'right', tip: T.pickup },
    { key: 't3', label: 'Top-3 Share', render: (r) => `${Math.round(r.top3Share)}%`, sort: (r) => r.top3Share, align: 'right', tip: T.top3 },
  ]

  const coachBest = best('coachScore'), benchWorst = best('benchPts'), llWorst = best('lineupLosses')
  const hawk = best('waiverValue'), thrifty = [...rows].filter((r) => r.faabPct > 5).sort((a, b) => b.valuePerFaab - a.valuePerFaab)[0], trader = best('tradeValue')
  const scatter = rows.map((r) => ({ x: +r.efficiency.toFixed(1), y: +r.waiverValue.toFixed(1), z: r.managerScore, name: name(r) }))

  return (
    <>
      {inProgress && <div className="banner">{view} is in progress — numbers cover weeks played so far.</div>}

      <div className="stat-grid">
        <Stat icon="crown" label={`Best coach · ${coachBest?.coachScore.toFixed(0)}`} value={name(coachBest)} tip={T.coach} />
        <Stat icon="trendDown" label={`Most left on bench · ${fmt(benchWorst?.benchPts ?? 0, 0)} pts`} value={name(benchWorst)} tip={T.bench} />
        <Stat icon="target" label={`Most lineup losses · ${llWorst?.lineupLosses ?? 0}`} value={name(llWorst)} tip={T.ll} />
        <Stat icon="plus" label={`Waiver hawk · ${signed(hawk?.waiverValue ?? 0)}`} value={name(hawk)} tip={T.waiver} />
        <Stat icon="dollar" label={`Best value per FAAB · ${thrifty ? fmt(thrifty.valuePerFaab) : '—'}`} value={name(thrifty)} tip={T.vpf} />
        <Stat icon="swap" label={`Best trader · ${signed(trader?.tradeValue ?? 0)}`} value={name(trader)} tip={T.trade} />
        {extra}
      </div>

      <Card title="Manager Rankings" sub={`Lineups, waivers and trades in one score.${perSeason ? ' All-time: per-season averages unless noted.' : ''}`}>
        <Table key={view} rows={rows} cols={cols} initialSort="mgr" rowKey={(r) => r.memberId} />
      </Card>

      <Card title="Coaching vs. Waiver Work" sub="Lineup efficiency (x) against waiver value (y). Top-right managers do both well.">
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" />
            <XAxis type="number" dataKey="x" name="Lineup eff. %" unit="%" stroke="var(--muted)" domain={['auto', 'auto']} />
            <YAxis type="number" dataKey="y" name="Waiver value" stroke="var(--muted)" />
            <ZAxis type="number" dataKey="z" range={[60, 260]} name="Manager score" />
            <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
              formatter={(v, k) => [String(v), String(k)]} labelFormatter={() => ''}
              content={({ payload }) => payload?.[0] ? (
                <div className="chart-tip"><b>{payload[0].payload.name}</b><div>Eff {payload[0].payload.x}% · Waiver {payload[0].payload.y} · Mgr {Math.round(payload[0].payload.z)}</div></div>
              ) : null} />
            <Scatter data={scatter} fill="#7c8cff" />
          </ScatterChart>
        </ResponsiveContainer>
      </Card>
    </>
  )
}

function ScorePill({ v }: { v: number }) {
  const cls = v >= 60 ? 'good' : v <= 40 ? 'bad' : ''
  return <span className={`score-pill ${cls}`}>{Math.round(v)}</span>
}
