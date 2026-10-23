import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLeague } from '../lib/data'
import { fmt, type Game } from '../lib/stats'
import { Card, MemberLink, Tabs } from '../components/ui'
import { WeekMatchups } from './Season'

const CATS = ['Highest Scoring', 'Lowest Scoring', 'Closest', 'Blowouts', 'Playoff Games'] as const

export default function HistoricalMatchups() {
  const lg = useLeague()
  const [year, setYear] = useState(lg.seasons[0].year)
  const [cat, setCat] = useState<(typeof CATS)[number]>('Highest Scoring')
  const s = lg.seasons.find((x) => x.year === year)!
  const played = lg.games.filter((g) => g.aPts > 0 || g.bPts > 0)

  const chart = [...lg.seasons].reverse().map((ss) => {
    const reg = played.filter((g) => g.season === ss.year && !g.playoff)
    const pts = reg.flatMap((g) => [g.aPts, g.bPts])
    const margins = reg.map((g) => Math.abs(g.aPts - g.bPts))
    return {
      season: String(ss.year),
      avg: +(pts.reduce((a, b) => a + b, 0) / (pts.length || 1)).toFixed(2),
      margin: +(margins.reduce((a, b) => a + b, 0) / (margins.length || 1)).toFixed(2),
    }
  })

  const sorters: Record<(typeof CATS)[number], (gs: Game[]) => Game[]> = {
    'Highest Scoring': (gs) => [...gs].sort((a, b) => b.aPts + b.bPts - (a.aPts + a.bPts)),
    'Lowest Scoring': (gs) => [...gs].sort((a, b) => a.aPts + a.bPts - (b.aPts + b.bPts)),
    Closest: (gs) => [...gs].sort((a, b) => Math.abs(a.aPts - a.bPts) - Math.abs(b.aPts - b.bPts)),
    Blowouts: (gs) => [...gs].sort((a, b) => Math.abs(b.aPts - b.bPts) - Math.abs(a.aPts - a.bPts)),
    'Playoff Games': (gs) => gs.filter((g) => g.bracket === 'winners').sort((a, b) => b.season - a.season || b.week - a.week),
  }
  const list = sorters[cat](played).slice(0, 20)

  return (
    <div className="page">
      <h1>Historical Matchups</h1>
      <Card title="Average Matchup Score by Season" sub="Average team score and average margin in regular-season games.">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chart}>
            <CartesianGrid stroke="var(--grid)" />
            <XAxis dataKey="season" stroke="var(--muted)" />
            <YAxis stroke="var(--muted)" />
            <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)' }} />
            <Bar dataKey="avg" name="Avg team score" fill="#7c8cff" />
            <Bar dataKey="margin" name="Avg margin" fill="#f2c35b" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card
        title="Season Matchups"
        sub="Every game by week. P1, P2… are playoff rounds."
        right={
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {lg.seasons.map((x) => <option key={x.year}>{x.year}</option>)}
          </select>
        }
      >
        <WeekMatchups key={year} s={s} games={lg.games.filter((g) => g.season === year)} />
      </Card>

      <Card title="Matchups by Category" sub="The top 20 games in league history for each category.">
        <Tabs tabs={CATS} value={cat} onChange={setCat} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>Season</th><th>Week</th><th>Winner</th><th>Loser</th><th className="right">Score</th><th className="right">Combined</th><th className="right">Margin</th></tr>
            </thead>
            <tbody>
              {list.map((g, i) => {
                const [w, l, wp, lp] = g.aPts >= g.bPts ? [g.a, g.b, g.aPts, g.bPts] : [g.b, g.a, g.bPts, g.aPts]
                return (
                  <tr key={`${g.season}-${g.week}-${g.a}`}>
                    <td>{i + 1}</td>
                    <td>{g.season}</td>
                    <td>{g.week}{g.bracket && <span className="pill">{g.bracket === 'winners' ? 'Playoffs' : 'Consolation'}</span>}</td>
                    <td><MemberLink id={w} /></td>
                    <td><MemberLink id={l} /></td>
                    <td className="right">{fmt(wp)} – {fmt(lp)}</td>
                    <td className="right">{fmt(wp + lp)}</td>
                    <td className="right">{fmt(wp - lp)}</td>
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
